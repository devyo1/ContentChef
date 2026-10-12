// Planner autopilot: turns a planned post (headline + brief) into a finished, ready-to-post post —
// on-image copy, the design rendered at each platform's size, and a caption per platform — without
// the user opening the builder. Runs on schedule (the day of the post, or the day before) while
// Content Chef is open, or on demand ("Make it now"). Falls back to plain copy when no AI is connected.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { listBrands, loadBrand, generate, buildCaptions, getTemplate, OUTPUT_DIR, slugify } from './core/index.js';
import { writeCopy, writeCaptions } from './copywriter.js';
import { createCarousel, exportCarousel } from './carousels.js';
import { getPlanner, upsertPosts } from './planner.js';

// The best organic-post size for each platform.
export const PLATFORM_FORMAT = {
  instagram: 'ig-portrait', facebook: 'fb-square', x: 'x-post', linkedin: 'linkedin-sq',
  tiktok: 'tiktok', pinterest: 'pinterest', youtube: 'yt-thumb',
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pick = (list, seed) => list[parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16) % list.length];
const firstSentence = (s) => String(s ?? '').split(/(?<=[.!?])\s/)[0].slice(0, 160);
// Why the AI step was skipped, in a few words (the full error goes to the log).
const shortReason = (e) => { console.warn(`Autopilot: ${e.message}`); return /not found|sign in|log ?in|api key|not connected/i.test(e.message) ? 'no assistant connected' : /too long|timed? ?out/i.test(e.message) ? 'the assistant took too long' : 'the assistant had a problem'; };
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} took too long`)), ms))]);

/** Is this post due to be made now, given the brand's autopilot setting? */
export function isDue(post, mode, now = new Date()) {
  if (mode === 'off' || !post.date || post.status !== 'idea' || post.assets?.length) return false;
  if (post.auto && ['queued', 'making', 'done'].includes(post.auto.state)) return false;
  if (post.auto?.state === 'error' && now - post.auto.at < 6 * 3600e3) return false; // retry failures a few times a day, not in a loop
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 864e5));
  if (post.date < yesterday) return false; // long gone: leave it alone
  if (mode === 'on-the-day') return post.date <= today;
  return new Date(`${post.date}T${post.time}:00`).getTime() - now.getTime() <= 24 * 3600e3;
}

const relOut = (p) => path.relative(OUTPUT_DIR, p).split(path.sep).join('/');

/** Make one planned post. Saves progress on the post as it goes; returns the finished post. */
export async function makePost(brandId, postId, { aiTimeout = 240_000 } = {}) {
  const planner = await getPlanner(brandId);
  const post = planner.posts.find((p) => p.id === postId);
  if (!post) throw new Error('That post is no longer in the plan.');
  const brand = await loadBrand(brandId);
  const s = planner.strategy;
  const step = (txt) => upsertPosts(brandId, { posts: [{ id: postId, auto: { state: 'making', at: Date.now(), step: txt } }] });
  const platforms = (post.platforms.length ? post.platforms : s.platforms.length ? s.platforms : ['instagram']).filter((p) => PLATFORM_FORMAT[p]);
  const brief = [
    post.headline && `Headline to use (keep it, you may tighten it): ${post.headline}`,
    post.brief && `What the post says: ${post.brief}`,
    post.pillar && `Topic: ${post.pillar}`,
    s.audience && `Audience: ${s.audience}`,
    s.goals && `Goal: ${s.goals}`,
  ].filter(Boolean).join('\n');
  const notes = [];

  try {
    await step('Writing the copy');
    let assets; let content;

    if (post.format === 'carousel') {
      try {
        const format = platforms.includes('instagram') || !platforms.includes('linkedin') ? 'ig-portrait' : 'linkedin-sq';
        const palette = (brand.defaults?.palettes ?? Object.keys(brand.palettes))[0];
        const c = await withTimeout(createCarousel({ brand: brandId, prompt: brief || post.headline, count: 5, ctaMode: 'dynamic', format, palette }), aiTimeout, 'Writing the carousel');
        await step('Designing the slides');
        const out = await exportCarousel(c.id, { generate });
        content = { ...c.slides[0].content, headline: c.slides[0].content.headline };
        const plats = platforms.filter((p) => ['instagram', 'linkedin', 'facebook'].includes(p));
        assets = out.files.flatMap((f) => (plats.length ? plats : ['instagram']).map((platform) => ({ platform, format, kind: 'slide', file: relOut(f), path: f })));
      } catch (e) {
        notes.push(`Made a single image instead of a carousel (${shortReason(e)})`);
      }
    }

    if (!assets) {
      const templates = [].concat(brand.defaults?.templates ?? ['headline']);
      const template = pick(templates, post.id);
      const fields = getTemplate(template).fields ?? [];
      content = { headline: post.headline, eyebrow: post.pillar || undefined, subhead: firstSentence(post.brief) || undefined };
      try {
        const r = await withTimeout(writeCopy({ brand: brandId, mode: 'single', templates: [template], content, prompt: brief }), aiTimeout, 'Writing the copy');
        content = { ...content, ...r.content, ...(post.headline ? { headline: post.headline } : {}) };
      } catch (e) {
        notes.push(`Copy taken from your headline and brief (${shortReason(e)})`);
      }
      for (const k of Object.keys(content)) if (content[k] == null || (fields.length && !fields.includes(k) && k !== 'headline')) delete content[k];
      if (post.format === 'video') content.animation ??= brand.style?.animation && brand.style.animation !== 'none' ? brand.style.animation : 'word-rise';
      await step(post.format === 'video' ? 'Rendering the video' : 'Designing it at every size');
      const palette = (brand.defaults?.palettes ?? Object.keys(brand.palettes))[0];
      const formats = [...new Set(platforms.map((p) => PLATFORM_FORMAT[p]))];
      const m = await generate({
        brand: brandId, campaign: 'planner', id: `${post.date ?? 'unscheduled'}-${slugify(content.headline || post.headline || 'post').slice(0, 40)}-${slugify(post.id).slice(0, 6)}`,
        content, templates: [template], palettes: [palette], formats, video: post.format === 'video', still: post.format !== 'video', imagesOnly: true,
      });
      assets = platforms.map((platform) => {
        const f = m.files.find((x) => x.format === PLATFORM_FORMAT[platform]);
        return f && { platform, format: f.format, kind: f.kind, file: relOut(f.path), path: f.path, width: f.width, height: f.height };
      }).filter(Boolean);
      content = { ...content, template, palette };
    }

    await step('Writing the captions');
    let captions = {};
    if (post.caption) captions = Object.fromEntries(platforms.map((p) => [p, post.caption]));
    else {
      try {
        const r = await withTimeout(writeCaptions({ brand: brandId, content, platforms, prompt: brief }), aiTimeout, 'Writing captions');
        captions = Object.fromEntries(Object.entries(r).map(([p, c]) => [p, typeof c === 'object' ? `${c.title}\n\n${c.description}` : c]));
      } catch (e) {
        notes.push(`Simple captions from your brand settings (${shortReason(e)})`);
        const b = buildCaptions(brand, content, platforms);
        captions = Object.fromEntries(Object.entries(b).map(([p, c]) => [p, typeof c === 'object' && c ? `${c.title}\n\n${c.description}` : String(c ?? '')]));
      }
    }

    const saved = await upsertPosts(brandId, { posts: [{
      id: postId, status: 'ready', content, captions, assets, ...(!post.headline && content.headline ? { headline: content.headline } : {}), caption: post.caption || captions[platforms[0]] || '',
      auto: { state: 'done', at: Date.now(), ...(notes.length ? { step: notes.join('; ').slice(0, 200) } : {}) },
    }] });
    return saved.posts.find((p) => p.id === postId);
  } catch (e) {
    await upsertPosts(brandId, { posts: [{ id: postId, auto: { state: 'error', at: Date.now(), error: String(e.message).slice(0, 500) } }] }).catch(() => {});
    throw e;
  }
}

// One post at a time: rendering is heavy and AI calls are rate-limited.
let chain = Promise.resolve();
const queued = new Set();
/** Queue posts to be made (marks them "queued" so the Planner shows it straight away). */
export async function queueMake(brandId, postIds) {
  const fresh = postIds.filter((id) => !queued.has(`${brandId}:${id}`));
  if (!fresh.length) return { queued: 0 };
  await upsertPosts(brandId, { posts: fresh.map((id) => ({ id, auto: { state: 'queued', at: Date.now() } })) });
  for (const id of fresh) {
    const key = `${brandId}:${id}`;
    queued.add(key);
    chain = chain.then(() => makePost(brandId, id)).catch((e) => console.warn(`Autopilot: ${e.message}`)).finally(() => queued.delete(key));
  }
  return { queued: fresh.length };
}

/** Posts in a brand's plan that should be made now (or within `days` days, for "make this week now"). */
export async function duePosts(brandId, { days } = {}) {
  const { strategy, posts } = await getPlanner(brandId);
  if (days) {
    const until = ymd(new Date(Date.now() + days * 864e5));
    return posts.filter((p) => p.date && p.date >= ymd(new Date()) && p.date <= until && p.status === 'idea' && !p.assets?.length && !['queued', 'making'].includes(p.auto?.state)).map((p) => p.id);
  }
  return posts.filter((p) => isDue(p, strategy.autopilot)).map((p) => p.id);
}

/** Check every brand's plan and queue whatever is due. Called on a timer by the server. */
export async function autopilotTick() {
  for (const b of await listBrands().catch(() => [])) {
    const ids = await duePosts(b.id).catch(() => []);
    if (ids.length) await queueMake(b.id, ids).catch(() => {});
  }
}

/** On startup, posts left "queued"/"making" by a closed app are put back so they get made again. */
export async function recoverInterrupted() {
  for (const b of await listBrands().catch(() => [])) {
    const { posts } = await getPlanner(b.id);
    const stuck = posts.filter((p) => ['queued', 'making'].includes(p.auto?.state));
    if (stuck.length) await upsertPosts(b.id, { posts: stuck.map((p) => ({ id: p.id, auto: undefined })) }).catch(() => {});
  }
}
