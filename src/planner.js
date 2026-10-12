// Content planner: a per-brand content strategy (goals, audience, pillars, rhythm, platforms) and
// a calendar of planned posts that walk from idea → draft → ready → posted. The AI can draft a
// plan (post ideas spread over the next weeks) that the user then reviews on the calendar.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DATA_DIR, loadBrand, getSettings, slugify, PLATFORMS } from './core/index.js';
import { writeWithProvider } from './copywriter.js';

export const PLANNER_DIR = path.join(DATA_DIR, 'planner');
const file = (brand) => path.join(PLANNER_DIR, `${slugify(brand)}.json`);

export const POST_STATUSES = ['idea', 'draft', 'ready', 'posted'];
export const POST_FORMATS = ['single', 'carousel', 'bulk', 'video'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const StrategyShape = z.object({
  goals: z.string().max(2000).default(''),
  audience: z.string().max(2000).default(''),
  pillars: z.array(z.string().max(80)).max(12).default([]),
  // Posting rhythm: which weekdays (1 = Mon … 7 = Sun) and at what times. Once a week = one day,
  // one time; twice a day = every day, two times. Posts per week = days × times.
  days: z.array(z.number().int().min(1).max(7)).max(7).default([1, 3, 5]),
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(6).default(['10:00']),
  platforms: z.array(z.string()).max(10).default(['instagram']),
  // Autopilot: when Content Chef makes each planned post (design + captions) by itself.
  // 'on-the-day' = from midnight on the post's day, 'day-before' = 24h ahead (time to review), 'off' = only when asked.
  autopilot: z.enum(['off', 'day-before', 'on-the-day']).default('on-the-day'),
});
export const Strategy = StrategyShape.transform((x) => ({ ...x, days: [...new Set(x.days)].sort(), times: [...new Set(x.times)].sort() }));
export const Post = z.object({
  id: z.string().default(() => randomUUID()),
  date: z.string().regex(DATE).nullable().default(null), // null = unscheduled idea
  time: z.string().regex(/^\d{2}:\d{2}$/).default('10:00'),
  platforms: z.array(z.string()).max(10).default([]),
  pillar: z.string().max(80).default(''),
  format: z.enum(POST_FORMATS).default('single'),
  status: z.enum(POST_STATUSES).default('idea'),
  headline: z.string().max(300).default(''),
  brief: z.string().max(2000).default(''),
  caption: z.string().max(5000).default(''),
  notes: z.string().max(2000).default(''),
  reminded: z.boolean().optional(),
  // Filled in when the post is made: the on-image copy, per-platform captions and the rendered files.
  content: z.record(z.string(), z.any()).optional(),
  captions: z.record(z.string(), z.string()).optional(),
  assets: z.array(z.object({ platform: z.string(), format: z.string(), kind: z.string().default('image'), file: z.string(), path: z.string(), width: z.number().optional(), height: z.number().optional() })).max(40).optional(),
  auto: z.object({ state: z.enum(['queued', 'making', 'done', 'error']), at: z.number(), error: z.string().max(500).optional(), step: z.string().max(200).optional() }).optional(),
});

export async function getPlanner(brand) {
  try {
    const j = JSON.parse(await fs.readFile(file(brand), 'utf8'));
    return { brand, strategy: Strategy.parse(j.strategy ?? {}), posts: z.array(Post).parse(j.posts ?? []), updatedAt: j.updatedAt ?? 0 };
  } catch {
    return { brand, strategy: Strategy.parse({}), posts: [], updatedAt: 0 };
  }
}

// Writes are serialised, so the autopilot updating a post and the user editing never lose each other's changes.
let writes = Promise.resolve();
const serial = (fn) => { const run = writes.catch(() => {}).then(fn); writes = run; return run; };

export function savePlanner(brand, input) {
  return serial(async () => {
    // A save from the Planner page may carry a post from before the autopilot finished it: keep the newer result.
    if (input?.posts) {
      const cur = new Map((await getPlanner(brand)).posts.map((p) => [p.id, p]));
      input = { ...input, posts: input.posts.map((p) => {
        const c = cur.get(p.id);
        if (!c?.auto || (p.auto?.at ?? 0) >= c.auto.at) return p;
        return { ...p, auto: c.auto, assets: c.assets, content: c.content, captions: c.captions, caption: p.caption || c.caption, status: c.auto.state === 'done' && p.status === 'idea' ? c.status : p.status };
      }) };
    }
    return writePlanner(brand, input);
  });
}
async function writePlanner(brand, { strategy, posts }) {
  await loadBrand(brand); // must exist
  const cur = await getPlanner(brand);
  const next = {
    brand,
    strategy: Strategy.parse(strategy ?? cur.strategy),
    posts: z.array(Post).max(1000).parse(posts ?? cur.posts),
    updatedAt: Date.now(),
  };
  await fs.mkdir(PLANNER_DIR, { recursive: true });
  const tmp = `${file(brand)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2));
  await fs.rename(tmp, file(brand));
  return next;
}

/** Add or update posts by id (and optionally delete some), keeping everything else. */
export function upsertPosts(brand, { posts = [], remove = [], strategy } = {}) {
  return serial(async () => {
    const cur = await getPlanner(brand);
    const byId = new Map(cur.posts.map((p) => [p.id, p]));
    for (const p of posts) byId.set(p.id ?? randomUUID(), Post.parse({ ...(p.id ? byId.get(p.id) : {}), ...p }));
    for (const id of remove) byId.delete(id);
    return writePlanner(brand, { strategy: strategy ? { ...cur.strategy, ...strategy } : cur.strategy, posts: [...byId.values()] });
  });
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Open posting slots ({date, time}, skipping ones already `taken` by a post) for `weeks` weeks from `start` (default tomorrow) on the chosen days and times. */
export function planSlots({ start, weeks = 2, days = [1, 3, 5], times = ['10:00'], taken = [] }) {
  const busy = new Set(taken.map((p) => `${p.date} ${p.time}`));
  const begin = start && DATE.test(start) ? new Date(`${start}T12:00:00`) : new Date(Date.now() + 864e5);
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(begin.getTime() + i * 864e5);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    if (days.includes(dow)) for (const time of times) if (!busy.has(`${ymd(d)} ${time}`)) out.push({ date: ymd(d), time });
  }
  return out;
}

const PlanInput = z.object({
  weeks: z.number().int().min(1).max(8).default(2),
  start: z.string().regex(DATE).optional(),
  prompt: z.string().max(2000).optional(),
  strategy: StrategyShape.partial().optional(),
});

/**
 * Ask the connected AI for a content plan. Returns proposed posts (status "idea", dated) and,
 * if the strategy had no pillars, suggested pillars. Nothing is saved until the user keeps it.
 */
export async function planContent(brandId, input, { generate = writeWithProvider, signal } = {}) {
  const a = PlanInput.parse(input ?? {});
  const brand = await loadBrand(brandId);
  const cur = await getPlanner(brandId);
  const strategy = { ...cur.strategy, ...(a.strategy ?? {}) };
  // Only the open slots in the rhythm: posts you already planned stay as they are.
  const dates = planSlots({ start: a.start, weeks: a.weeks, days: strategy.days, times: strategy.times, taken: cur.posts.filter((p) => p.date) }).slice(0, 60);
  if (!dates.length) throw new Error('Every slot in those weeks already has a post. Pick more weeks or add posting days.');
  const today = ymd(new Date());
  const mix = strategy.pillars.map((p) => `${p}: ${cur.posts.filter((x) => x.pillar === p && x.date >= today).length}`);
  const platforms = strategy.platforms.length ? strategy.platforms : ['instagram'];
  const taken = cur.posts.filter((p) => p.date).map((p) => `${p.date}: ${p.headline}`).slice(-30);
  const text = [
    `Brand: ${brand.name}${brand.tagline ? ` (${brand.tagline})` : ''}`,
    `Voice: ${brand.captions?.voice || 'clear, confident, human.'}`,
    strategy.goals && `Goals: ${strategy.goals}`,
    strategy.audience && `Audience: ${strategy.audience}`,
    strategy.pillars.length ? `Content pillars: ${strategy.pillars.join(' · ')}` : 'No content pillars yet: propose 3–5 and use them.',
    `Platforms: ${platforms.map((p) => PLATFORMS[p]?.label ?? p).join(', ')}`,
    taken.length && `Already planned (don't repeat these): ${taken.join(' | ')}`,
    mix.length && `Upcoming posts per pillar (favour the pillars with fewer): ${mix.join(', ')}`,
    a.prompt && `Brief from the user: ${a.prompt}`,
    '',
    `Write a content plan of exactly ${dates.length} posts, in posting order, that a small team can actually make. Mix value posts (tips, insights, lists, behind the scenes) with a few promotional ones, rotate the pillars, and build a little narrative across the weeks. For each post: pillar, format ("single" for one image, "carousel" for a multi-slide story, "video" for a short clip), headline (2–7 words, the on-image hook; *stars* around one key word), brief (one or two sentences: what the post says and why it matters to the audience), caption (ready to post, in the brand voice, no hashtags spam: at most 3).`,
    'Never invent statistics, reviews, prices or offers that are not in the brief.',
  ].filter(Boolean).join('\n');
  const item = {
    type: 'object', additionalProperties: false, required: ['pillar', 'format', 'headline', 'brief', 'caption'],
    properties: { pillar: { type: 'string' }, format: { type: 'string', enum: ['single', 'carousel', 'video'] }, headline: { type: 'string' }, brief: { type: 'string' }, caption: { type: 'string' } },
  };
  const schema = {
    type: 'object', additionalProperties: false, required: ['pillars', 'posts'],
    properties: { pillars: { type: 'array', items: { type: 'string' } }, posts: { type: 'array', items: item } },
  };
  const settings = await getSettings();
  const out = await generate(settings, { text, schema, signal });
  const posts = (Array.isArray(out?.posts) ? out.posts : []).slice(0, dates.length).map((p, i) => Post.parse({
    date: dates[i].date, time: dates[i].time, platforms, status: 'idea',
    pillar: String(p.pillar ?? '').slice(0, 80), format: POST_FORMATS.includes(p.format) ? p.format : 'single',
    headline: String(p.headline ?? '').slice(0, 300), brief: String(p.brief ?? '').slice(0, 2000), caption: String(p.caption ?? '').slice(0, 5000),
  }));
  if (!posts.length) throw new Error('The assistant did not return a plan. Try again.');
  return { posts, pillars: strategy.pillars.length ? strategy.pillars : (out.pillars ?? []).map((x) => String(x).slice(0, 80)).slice(0, 8) };
}

/** An .ics calendar of the scheduled posts, to subscribe to / import in Google, Apple or Outlook calendars. */
export function plannerIcs(planner, brandName) {
  const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Content Chef//Planner//EN', `X-WR-CALNAME:${esc(`${brandName} content`)}`];
  for (const p of planner.posts.filter((x) => x.date && x.status !== 'posted')) {
    const [y, m, d] = p.date.split('-');
    const [hh, mm] = p.time.split(':');
    lines.push('BEGIN:VEVENT', `UID:${p.id}@content-chef`, `DTSTAMP:${stamp}`, `DTSTART:${y}${m}${d}T${hh}${mm}00`, 'DURATION:PT30M',
      `SUMMARY:${esc(`Post: ${p.headline.replace(/[*_|]/g, '') || 'Untitled'} (${p.platforms.join(', ')})`)}`,
      `DESCRIPTION:${esc([p.brief, p.caption && `Caption:\n${p.caption}`].filter(Boolean).join('\n\n'))}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Time to post', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
