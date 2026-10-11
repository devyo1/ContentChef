// "Write with Claude" for the Words step: one request that returns ONLY copy (headline, body,
// list points…) for the fields the chosen templates use. No tools, no design changes. Works with
// either provider: the Anthropic API (structured JSON output) or the local Claude Code CLI.
import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { z } from 'zod';
import { loadBrand, getSettings, getTemplate, DATA_DIR, PLATFORMS } from './core/index.js';
import { findClaude, childEnv } from './claude-code.js';

// What each copy field is, with length guidance (the layouts auto-fit, but short reads better).
const FIELD_GUIDE = {
  eyebrow: 'small top line above the headline, 2–4 words (e.g. "New this autumn", "Tip #3")',
  headline: 'the main message, 2–7 words, max ~45 characters. Wrap 1–2 key words in *stars* to colour them; "|" forces a line break (rarely needed)',
  subhead: 'one supporting sentence, max ~90 characters',
  cta: 'button or link text, 1–3 words',
  body: 'value-post paragraph(s): 2–4 short, genuinely useful sentences, max ~320 characters; a blank line starts a new paragraph',
  points: 'list items, 3–5 of them, each max ~60 characters; "Title: detail" format bolds the title',
  stat: 'one big number, e.g. "73%", "3×", "10 min"',
  source: 'short citation for the number',
  offer: 'the big promo text, e.g. "30% OFF", "2 for 1"',
  attribution: 'who said the quote, e.g. "— Sam R., regular"',
  badge: 'one tiny label, e.g. "NEW"',
  leftTitle: 'left column title, 1–2 words (e.g. "Myth")',
  leftPoints: 'left column items, 2–4 short lines',
  rightTitle: 'right column title, 1–2 words (e.g. "Fact")',
  rightPoints: 'right column items, 2–4 short lines',
  footnote: 'small print, one short line',
};
const LIST_FIELDS = new Set(['points', 'leftPoints', 'rightPoints']);
/** Fields written per ad in bulk mode; the rest are shared by every ad. */
const ROW_FIELDS = ['headline', 'eyebrow', 'subhead', 'body', 'points', 'stat', 'offer'];
const ALWAYS = ['eyebrow', 'headline', 'subhead', 'cta'];

const fieldSchema = (k) => (LIST_FIELDS.has(k) ? { type: 'array', items: { type: 'string' } } : { type: 'string' });
const objectSchema = (keys) => ({ type: 'object', properties: Object.fromEntries(keys.map((k) => [k, fieldSchema(k)])), required: keys, additionalProperties: false });

/** Which copy fields to write, from the chosen templates. */
function copyFields(templates) {
  const used = new Set(ALWAYS);
  for (const id of templates ?? []) {
    try { for (const f of getTemplate(id).fields) used.add(f); } catch { /* unknown template: ignore */ }
  }
  return Object.keys(FIELD_GUIDE).filter((k) => used.has(k) && k !== 'footnote');
}

function buildRequest({ brand, mode, templates, content, rows, prompt, versions, count }) {
  const fields = copyFields(templates);
  const tpls = (templates ?? []).map((id) => { try { const t = getTemplate(id); return `- ${t.name}: ${t.description}`; } catch { return null; } }).filter(Boolean);
  const current = Object.fromEntries(fields.filter((k) => content?.[k] != null && content[k] !== '').map((k) => [k, content[k]]));
  const bulk = mode === 'bulk';
  const rowFields = fields.filter((k) => ROW_FIELDS.includes(k));

  const schema = bulk
    ? objectSchema(['rows', ...fields.filter((k) => !rowFields.includes(k))])
    : objectSchema([...fields, ...(versions > 0 ? ['versions'] : [])]);
  if (bulk) schema.properties.rows = { type: 'array', items: objectSchema(rowFields) };
  if (!bulk && versions > 0) schema.properties.versions = { type: 'array', items: { type: 'string' } };

  const lines = [
    `Brand: ${brand.name}${brand.tagline ? ` (${brand.tagline})` : ''}`,
    brand.captions?.voice ? `Voice: ${brand.captions.voice}` : 'Voice: clear, confident, human.',
    brand.handle ? `Handle: ${brand.handle}` : '',
    tpls.length ? `The copy goes into these layouts:\n${tpls.join('\n')}` : '',
    Object.keys(current).length ? `Current copy (may be placeholder text): ${JSON.stringify(current)}` : '',
    bulk && rows?.length ? `Current list of ads: ${JSON.stringify(rows.slice(0, 20))}` : '',
    '',
    `What to write: ${prompt?.trim() || (Object.keys(current).length
      ? 'Fresh, stronger copy on the same topic as the current copy. If the current copy is generic placeholder text, pick a strong angle that fits this brand.'
      : 'Strong copy for a typical post this brand would make.')}`,
    '',
    bulk
      ? `Write ${count} different ads as "rows" (each a distinct angle on the brief, not rewordings of one idea). Per row: ${rowFields.join(', ')}. ${fields.filter((k) => !rowFields.includes(k)).length ? `Shared by every ad: ${fields.filter((k) => !rowFields.includes(k)).join(', ')}.` : ''}`
      : `Write: ${fields.join(', ')}.${versions > 0 ? ` Also ${versions} alternative headlines as "versions" (different angles, same rules as the headline).` : ''}`,
    '',
    'Fields:',
    ...fields.map((k) => `- ${k}: ${FIELD_GUIDE[k]}`),
    '',
    'Rules: follow the brand voice. Plain words people actually use; no hype clichés ("elevate", "unlock", "game-changer"), no emoji, no hashtags. Never invent statistics, studies, reviews or quotes from real people or organisations: only use numbers given in the brief or self-evident ones ("3 steps", "10 min"), and attribute stats/quotes to the brand or leave the source generic. Only write words; never mention design, colours or layout.',
  ].filter((l) => l !== null);
  return { fields, rowFields, schema, text: lines.join('\n') };
}

/** Normalise model output: trim, keep only expected keys, lists as newline text for the editor. */
function clean(out, { fields, rowFields }, bulk) {
  const val = (k, v) => {
    if (v == null) return undefined;
    if (LIST_FIELDS.has(k)) return (Array.isArray(v) ? v : String(v).split('\n')).map((x) => String(x).trim()).filter(Boolean).join('\n');
    return String(v).trim().slice(0, 600);
  };
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, val(k, o?.[k])]).filter(([, v]) => v));
  if (bulk) {
    return {
      content: pick(out, fields.filter((k) => !rowFields.includes(k))),
      rows: (Array.isArray(out.rows) ? out.rows : []).map((r) => pick(r, rowFields)).filter((r) => r.headline),
    };
  }
  return {
    content: pick(out, fields),
    versions: (Array.isArray(out.versions) ? out.versions : []).map((v) => String(v).trim()).filter(Boolean),
  };
}

const SYSTEM = 'You are the copywriter inside Content Chef, a tool for on-brand social posts and ads. You write only the on-screen words for a design. Reply with the JSON object requested and nothing else.';

async function viaApi(settings, req) {
  const client = new Anthropic(settings.claude.apiKey ? { apiKey: settings.claude.apiKey } : {});
  const res = await client.messages.parse({
    model: settings.claude.model || 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: jsonSchemaOutputFormat(req.schema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: req.text }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to write that. Try a different brief.');
  if (!res.parsed_output) throw new Error('Claude did not return usable copy. Try again.');
  return res.parsed_output;
}

/** One headless Claude Code run with no tools at all; parse the JSON object from its reply. */
async function viaClaudeCode(settings, req) {
  const exe = findClaude(settings.claude.codePath);
  if (!exe) throw new Error('Claude Code was not found. Install the Claude desktop app, or add an API key in Settings.');
  const args = ['-p', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--append-system-prompt', SYSTEM];
  if (settings.claude.codeModel) args.push('--model', settings.claude.codeModel);
  const prompt = `${req.text}\n\nReply with ONLY a JSON object matching this JSON Schema (no prose, no code fences):\n${JSON.stringify(req.schema)}`;
  const child = spawn(exe, args, { cwd: DATA_DIR, env: childEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(prompt);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const code = await new Promise((resolve) => child.on('close', resolve));
  let result;
  try { result = JSON.parse(stdout); } catch { /* not JSON */ }
  const reply = String(result?.result ?? '');
  if (result?.is_error || code !== 0) {
    const msg = reply || stderr.trim().slice(-300) || `Claude Code exited (${code})`;
    throw new Error(/not logged in|\/login/i.test(msg) ? 'Claude Code is not signed in. Open Settings → Claude assistant and press "Sign in with Claude".' : msg);
  }
  const a = reply.indexOf('{');
  const b = reply.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Claude did not return usable copy. Try again.');
  return JSON.parse(reply.slice(a, b + 1));
}

const Input = z.object({
  brand: z.string(),
  mode: z.enum(['single', 'bulk']).default('single'),
  templates: z.array(z.string()).default([]),
  content: z.record(z.string(), z.any()).default({}),
  rows: z.array(z.record(z.string(), z.any())).optional(),
  prompt: z.string().max(2000).optional(),
  versions: z.number().int().min(0).max(8).default(0),
  count: z.number().int().min(1).max(30).default(5),
});

const CaptionInput = z.object({
  brand: z.string(),
  content: z.record(z.string(), z.any()).default({}),
  platforms: z.array(z.string()).min(1),
  prompt: z.string().max(2000).optional(),
});

/** Captions for each platform, written to that platform's norms and the per-platform switches. */
export async function writeCaptions(input) {
  const { brand: brandId, content, platforms: requested, prompt } = CaptionInput.parse(input);
  const brand = await loadBrand(brandId);
  const settings = await getSettings();
  const platforms = requested.filter((p) => PLATFORMS[p] && content.platformOpts?.[p]?.caption !== false);
  if (!platforms.length) return {};
  const bc = brand.captions ?? {};
  const rules = platforms.map((p) => {
    const r = PLATFORMS[p];
    const po = content.platformOpts?.[p] ?? {};
    const link = po.link === false ? 'no link' : r.link ? `include the link ${bc.link || '(none set: skip it)'}` : 'links are not clickable here: say "link in bio" only if useful';
    const tags = po.hashtags === false ? 'no hashtags' : `up to ${r.hashtags} hashtags${p === 'instagram' ? ' in a block at the end' : ''}`;
    return `- ${p} (${r.label}): max ${r.limit} characters${p === 'pinterest' ? `, as { title (max ${r.titleLimit}), description }` : ''}; ${link}; ${tags}${po.cta === false ? '; no call to action' : ''}`;
  });
  const copy = Object.fromEntries(['eyebrow', 'headline', 'subhead', 'cta', 'body', 'points', 'stat', 'source', 'offer'].filter((k) => content[k]).map((k) => [k, content[k]]));
  const text = [
    `Brand: ${brand.name}${brand.tagline ? ` (${brand.tagline})` : ''}`,
    `Voice: ${bc.voice || 'clear, confident, human.'}`,
    bc.hashtags?.length ? `Brand hashtags to draw from: ${bc.hashtags.map((h) => `#${String(h).replace(/^#/, '')}`).join(' ')}` : '',
    bc.signoff ? `Sign-off they like: ${bc.signoff}` : '',
    `The post's on-image copy (*stars* mark highlighted words; ignore the markup): ${JSON.stringify(copy)}`,
    prompt?.trim() ? `Brief: ${prompt.trim()}` : '',
    '',
    'Write the post caption for each platform, in its native style (Instagram: a hook line then a short story; LinkedIn: a useful, professional take; X: punchy; TikTok: casual and short; Pinterest: searchable title + description; YouTube: description). Expand on the on-image copy rather than repeating it word for word.',
    ...rules,
    'Never invent statistics, reviews, quotes or offers that are not in the copy or brief. No hype clichés.',
  ].filter(Boolean).join('\n');
  const properties = Object.fromEntries(platforms.map((p) => [p, p === 'pinterest'
    ? { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title', 'description'], additionalProperties: false }
    : { type: 'string' }]));
  const req = { text, schema: { type: 'object', properties, required: platforms, additionalProperties: false } };
  const out = settings.claude.provider === 'api' ? await viaApi(settings, req) : await viaClaudeCode(settings, req);
  return Object.fromEntries(platforms.filter((p) => out[p]).map((p) => {
    const lim = PLATFORMS[p].limit;
    if (p === 'pinterest') return [p, { title: String(out[p].title ?? '').slice(0, PLATFORMS[p].titleLimit), description: String(out[p].description ?? '').slice(0, lim) }];
    return [p, String(out[p]).trim().slice(0, lim)];
  }));
}

/** Write copy for the editor. Returns { content, versions } (single) or { content, rows } (bulk). */
export async function writeCopy(input) {
  const args = Input.parse(input);
  const brand = await loadBrand(args.brand);
  const settings = await getSettings();
  const req = buildRequest({ ...args, brand });
  const out = settings.claude.provider === 'api' ? await viaApi(settings, req) : await viaClaudeCode(settings, req);
  return clean(out, req, args.mode === 'bulk');
}
