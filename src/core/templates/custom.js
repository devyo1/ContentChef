// Custom templates: made by the user or by Claude (via MCP), stored as plain JSON in
// HOME/templates/<id>.json. Declarative only, HTML + CSS with {{tokens}} filled from the
// brand and the copy, so they can't run code. Loaded fresh whenever the file changes.
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES_DIR, slugify } from '../paths.js';
import { esc, rich, parts, rootClass, listItems, pointHtml } from './base.js';

/** Fields a custom template can declare (the editor shows inputs for these). */
export const CUSTOM_FIELDS = ['eyebrow', 'headline', 'subhead', 'cta', 'body', 'points', 'stat', 'source', 'offer', 'attribution', 'badge', 'handle', 'footnote', 'background'];

/** Every {{token}} a custom template's HTML can use, with what it becomes. Shown to Claude by template_guide. */
export const TOKENS = {
  root: 'Class list for the outer element: <div class="{{root}}">…</div> (added for you if missing). Carries orientation (o-portrait / o-square / o-landscape), alignment (a-left / a-center), has-bg / no-bg, light / dark, on-photo.',
  bg: 'Background: the photo/video (with neutral darkening) if one is chosen, else the generated background style.',
  media: 'Just the photo/video <img class="bg">, no darkening. Empty if none. Use when you place the photo yourself (e.g. inside a frame).',
  genbg: 'Just the generated background (solid / gradient / aurora / spotlight / grid / dots).',
  logo: 'Brand logo image, or the brand name as a wordmark: <div class="logo">…</div>.',
  brand: 'Brand name as plain text.',
  tagline: 'Brand tagline as plain text.',
  eyebrow: '<div class="eyebrow">top line</div> (empty if no top line).',
  headline: 'The headline as <h1 class="headline" data-fit>: auto-sized to FILL ITS PARENT, so put it inside a box with a definite height, e.g. <div class="fitbox hbox">{{headline}}</div> with .hbox{height:calc(var(--u)*30)} or flex:1. Options: {{headline min=3 max=9}} (font size range in u).',
  sub: '<p class="sub">supporting line</p>.',
  cta: 'Button: <div class="cta">text →</div>.',
  link: 'Quiet text link (accent colour, no button): <div class="link">text →</div>.',
  body: '<div class="body">paragraphs</div>. {{body min=2 max=4.6}} auto-sizes it to fill its parent (give the parent a definite height).',
  points: 'List: <ul class="list">…</ul>; "Title: detail" items get a bold title. {{points numbered}} for <ol>. {{points min=2 max=4}} auto-sizes.',
  stat: '<div class="stat-num" data-fit>73%</div>: auto-sized big number (put it in a sized box).',
  source: '<div class="src">source</div>.',
  offer: '<div class="offer" data-fit>30% OFF</div>: auto-sized (put it in a sized box).',
  attribution: '<div class="who">— name</div>.',
  badge: '<span class="badge">NEW</span>.',
  handle: '<span class="handle">@brand</span>.',
  foot: '<div class="foot">small print</div>.',
};

const BLOCKED_TAGS = /<\/?(script|iframe|object|embed|link|meta|base|form|input|button|textarea|select|frame|frameset|applet|portal)\b[^>]*>/gi;

/** Strip anything executable or remote from template HTML. */
export function sanitizeHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(BLOCKED_TAGS, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|action|formaction)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html|https?:)[^"'\s>]*\2?/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

/** Strip remote loads and anything that could break out of the <style> element. */
export function sanitizeCss(css) {
  return String(css ?? '')
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(')
    .replace(/url\(\s*(['"]?)\s*(?!data:image\/)[^)]*\)/gi, 'none');
}

function attrs(arg) {
  const out = {};
  for (const m of String(arg ?? '').matchAll(/([a-z]+)(?:=("[^"]*"|[\d.]+|[a-z-]+))?/gi)) out[m[1]] = m[2] == null ? true : m[2].replace(/"/g, '');
  return out;
}
const fitAttrs = (a, min, max) => `data-fit data-min="${Number(a.min ?? min)}" data-max="${Number(a.max ?? max)}"`;

/** Fill {{tokens}} and {{#if field}}…{{/if}} blocks from the ad's context. */
function fill(html, ctx) {
  const p = parts(ctx);
  const c = ctx.content;
  const has = (k) => {
    const v = { sub: c.subhead, foot: c.footnote, logo: c.showLogo !== false, media: ctx.bgUrl, bg: true, photo: ctx.bgUrl }[k] ?? c[k];
    return Array.isArray(v) ? v.length > 0 : !!(typeof v === 'string' ? v.trim() : v);
  };
  let out = String(html);
  // {{#if x}}…{{else}}…{{/if}} — not nested.
  out = out.replace(/\{\{#if\s+(!?)(\w+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, not, k, inner) => {
    const [yes, no = ''] = inner.split(/\{\{else\}\}/);
    return (not ? !has(k) : has(k)) ? yes : no;
  });
  return out.replace(/\{\{\s*(\w+)([^}]*)\}\}/g, (m, name, arg) => {
    const a = attrs(arg);
    switch (name) {
      case 'root': return rootClass(ctx);
      case 'bg': return p.bg;
      case 'media': return p.media;
      case 'genbg': return p.genbg;
      case 'logo': return p.logo;
      case 'brand': return esc(ctx.brand.name);
      case 'tagline': return esc(ctx.brand.tagline ?? '');
      case 'eyebrow': return p.eyebrow;
      case 'headline': return p.headline(fitAttrs(a, 3, 9).replace('data-fit ', ''));
      case 'sub': case 'subhead': return p.sub;
      case 'cta': return p.cta;
      case 'link': return p.link;
      case 'body': return p.body(c.body, a.min || a.max ? fitAttrs(a, 2, 4.6) : '');
      case 'points': {
        const items = listItems(c.points);
        if (!items.length) return '';
        const tag = a.numbered ? 'ol' : 'ul';
        return `<${tag} class="list" ${a.min || a.max ? fitAttrs(a, 2, 4) : ''}>${items.map((i) => `<li>${pointHtml(i)}</li>`).join('')}</${tag}>`;
      }
      case 'stat': return c.stat ? `<div class="stat-num" ${fitAttrs(a, 8, 40)}>${rich(c.stat)}</div>` : '';
      case 'source': return c.source ? `<div class="src">${rich(c.source)}</div>` : '';
      case 'offer': return c.offer ? `<div class="offer" ${fitAttrs(a, 6, 30)}>${rich(c.offer)}</div>` : '';
      case 'attribution': return c.attribution ? `<div class="who">${rich(c.attribution)}</div>` : '';
      case 'badge': return c.badge ? `<span class="badge">${esc(c.badge)}</span>` : '';
      case 'handle': return `<span class="handle">${p.handle}</span>`;
      case 'foot': case 'footnote': return p.foot;
      default: return m; // unknown: leave visible so the author notices
    }
  });
}

/** Validate + normalise a spec (throws with a helpful message). */
export function normalizeSpec(spec, builtInIds = []) {
  const id = slugify(spec.id ?? spec.name);
  if (!spec.name) throw new Error('A template needs a name');
  if (builtInIds.includes(id)) throw new Error(`"${id}" is a built-in template id; pick another`);
  if (!spec.html || !String(spec.html).trim()) throw new Error('A template needs html');
  const fields = [...new Set([].concat(spec.fields ?? []).filter((f) => CUSTOM_FIELDS.includes(f)))];
  return {
    id,
    name: String(spec.name).slice(0, 60),
    description: String(spec.description ?? '').slice(0, 400),
    fields: fields.length ? fields : ['eyebrow', 'headline', 'subhead', 'cta', 'background'],
    textOnPhoto: !!spec.textOnPhoto,
    preferBg: spec.preferBg || undefined,
    css: sanitizeCss(spec.css),
    html: sanitizeHtml(spec.html),
    author: spec.author ? String(spec.author).slice(0, 60) : undefined,
    updatedAt: new Date().toISOString(),
  };
}

// Sensible defaults for the pieces tokens produce; a template's own CSS comes after and wins.
const DEFAULT_CSS = `
.list{margin:0;padding-left:1.15em;display:flex;flex-direction:column;gap:.55em;font-size:calc(var(--u)*3.4);line-height:1.35;width:100%}
.list li::marker{color:var(--accent);font-weight:700}
.list b{color:var(--accent);font-weight:700}
.stat-num{font-family:var(--font-display);font-weight:var(--display-weight);line-height:.9;letter-spacing:var(--tracking);color:var(--accent);width:100%}
.offer{font-family:var(--font-display);font-weight:var(--display-weight);line-height:.9;letter-spacing:var(--tracking);width:100%}
.src{font-size:calc(var(--u)*2.3);opacity:.65}
.who{font-size:calc(var(--u)*3);font-weight:600;opacity:.85}
.badge{display:inline-flex;align-self:flex-start;padding:.45em .95em;border-radius:99px;background:var(--accent);color:var(--cta-text);font-weight:700;font-size:calc(var(--u)*2.4);letter-spacing:.06em;text-transform:uppercase}
`;

/** Turn a stored spec into a template module like the built-in ones. */
function toTemplate(spec) {
  return {
    ...spec,
    category: 'custom',
    custom: true,
    render(ctx) {
      let body = fill(spec.html, ctx);
      if (!/\{\{\s*root\s*\}\}/.test(spec.html)) body = `<div class="${rootClass(ctx)}">${body}</div>`;
      return { css: DEFAULT_CSS + spec.css, body };
    },
  };
}

const cache = new Map(); // file → { mtime, tpl }
/** Every valid custom template on disk (re-read only when a file changes). */
export function loadCustomTemplates() {
  let files = [];
  try { files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const file = path.join(TEMPLATES_DIR, f);
    try {
      const mtime = fs.statSync(file).mtimeMs;
      let hit = cache.get(file);
      if (!hit || hit.mtime !== mtime) {
        const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
        // Re-sanitise on load: the file may have been edited by hand.
        hit = { mtime, tpl: toTemplate({ ...spec, id: path.basename(f, '.json'), css: sanitizeCss(spec.css), html: sanitizeHtml(spec.html) }) };
        cache.set(file, hit);
      }
      out.push(hit.tpl);
    } catch (e) {
      console.warn(`Skipping custom template ${f}: ${e.message}`);
    }
  }
  return out;
}

export function saveCustomTemplate(spec, builtInIds) {
  const s = normalizeSpec(spec, builtInIds);
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEMPLATES_DIR, `${s.id}.json`), `${JSON.stringify(s, null, 2)}\n`);
  return s;
}

export function readCustomSpec(id) {
  const file = path.join(TEMPLATES_DIR, `${slugify(id)}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function deleteCustomTemplate(id) {
  const file = path.join(TEMPLATES_DIR, `${slugify(id)}.json`);
  if (!fs.existsSync(file)) throw new Error(`No custom template "${id}"`);
  fs.unlinkSync(file);
  cache.delete(file);
}
