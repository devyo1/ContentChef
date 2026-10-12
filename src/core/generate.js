import fs from 'node:fs/promises';
import path from 'node:path';
import { loadBrand, assetPath } from './brands.js';
import { composeAd } from './compose.js';
import { FORMATS, resolveFormats } from './formats.js';
import { renderHtml, renderVideo, pool } from './renderer.js';
import { buildCaptions, captionsMarkdown } from './captions.js';
import { getTemplate } from './templates/index.js';
import { isVideo, mp4ToGif } from './media.js';
import { OUTPUT_DIR, safeJoin, slugify } from './paths.js';

// Keys on a catalog item / request that control generation rather than being ad copy.
export const CONTROL_KEYS = ['id', 'templates', 'template', 'palettes', 'palette', 'formats', 'format', 'variants'];

export function splitItem(item) {
  const content = {};
  for (const [k, v] of Object.entries(item)) if (!CONTROL_KEYS.includes(k)) content[k] = v;
  return content;
}

/** Expand copy variants: explicit `variants: [{headline..}, ..]` or `headline: ["A", "B"]`. */
export function expandVariants(content, variants) {
  if (variants?.length) return variants.map((v) => ({ ...content, ...v }));
  if (Array.isArray(content.headline)) return content.headline.map((h) => ({ ...content, headline: h }));
  return [content];
}

/** Work out everything one ad needs to render, without rendering it. */
async function plan({ brand, campaign = 'adhoc', id, content = {}, variants, templates, palettes, formats, video = false, gif = false, still = true, type = 'png', outRoot = OUTPUT_DIR }) {
  const b = typeof brand === 'string' ? await loadBrand(brand) : brand;
  const tpls = [].concat(templates ?? b.defaults?.templates ?? ['headline']);
  tpls.forEach(getTemplate);
  let pals = [].concat(palettes ?? b.defaults?.palettes ?? [Object.keys(b.palettes)[0]]);
  if (pals.includes('all')) pals = Object.keys(b.palettes);
  for (const p of pals) if (!b.palettes[p]) throw new Error(`Brand "${b.id}" has no palette "${p}". Has: ${Object.keys(b.palettes).join(', ')}`);
  const fmts = resolveFormats(formats ?? b.defaults?.formats ?? 'social');
  const vars = expandVariants(content, variants);

  const itemId = slugify(id ?? (Array.isArray(content.headline) ? content.headline[0] : content.headline ?? content.offer) ?? 'ad');
  const dir = safeJoin(outRoot, path.join(b.id, slugify(campaign), itemId));

  const jobs = [];
  vars.forEach((v, vi) => {
    for (const template of tpls) for (const palette of pals) for (const format of fmts) {
      const base = `${template}_${palette}_${format}${vars.length > 1 ? `_v${vi + 1}` : ''}`;
      const job = { variant: vi + 1, content: v, template, palette, format, base };
      if (still) jobs.push({ ...job, kind: 'image', file: `${base}.${type === 'jpeg' ? 'jpg' : 'png'}` });
      if (video) jobs.push({ ...job, kind: 'video', file: `${base}.mp4` });
      if (gif) jobs.push({ ...job, kind: 'gif', file: `${base}.gif` });
    }
  });
  return { b, campaign, itemId, dir, tpls, pals, fmts, vars, jobs };
}

async function execute(pl, { scale, type = 'png', quality, fps = 30, concurrency = 4, onProgress, imagesOnly = false }) {
  const { b, dir, jobs } = pl;
  await fs.mkdir(dir, { recursive: true });
  let done = 0;
  // Videos are CPU-heavy (browser + ffmpeg), so run fewer at once.
  const images = jobs.filter((j) => j.kind === 'image');
  const videos = jobs.filter((j) => j.kind === 'video' || j.kind === 'gif');
  const runJob = async (job) => {
    const fmt = FORMATS[job.format];
    const html = await composeAd({ brand: b, template: job.template, palette: job.palette, format: job.format, content: job.content });
    const s = scale ?? fmt.scale ?? 1;
    const out = path.join(dir, job.file);
    if (job.kind === 'video' || job.kind === 'gif') {
      const bg = job.content.background;
      const gif = job.kind === 'gif';
      const mp4 = gif ? `${out}.tmp.mp4` : out;
      await renderVideo(html, {
        width: fmt.width, height: fmt.height, scale: gif ? 1 : s, fps: gif ? 15 : fps, out: mp4,
        duration: Number(job.content.duration ?? 6),
        bgVideo: isVideo(bg) ? assetPath(b, bg) : null,
      });
      if (gif) {
        try { await mp4ToGif(mp4, out, { width: Math.min(720, fmt.width) }); } finally { await fs.rm(mp4, { force: true }); }
      }
    } else {
      await fs.writeFile(out, await renderHtml(html, { width: fmt.width, height: fmt.height, scale: s, type, quality }));
    }
    onProgress?.(++done, jobs.length, { ...job, path: out });
    return {
      path: out, file: job.file, kind: job.kind, variant: job.variant, template: job.template, palette: job.palette,
      format: job.format, platform: fmt.platform, width: Math.round(fmt.width * s), height: Math.round(fmt.height * s),
    };
  };
  const files = [
    ...(await pool(images, concurrency, runJob)),
    ...(await pool(videos, Math.max(1, Math.min(2, concurrency)), runJob)),
  ];

  const platforms = [...new Set(pl.fmts.map((f) => FORMATS[f].platform))];
  const captions = pl.vars.map((v) => buildCaptions(b, v, platforms));
  const many = pl.vars.length > 1;
  // imagesOnly (quick exports): just the image/video files, no captions or manifest next to them.
  if (!imagesOnly) {
    await fs.writeFile(path.join(dir, 'captions.json'), JSON.stringify(many ? captions : captions[0], null, 2));
    await fs.writeFile(
      path.join(dir, 'captions.md'),
      captions.map((c, i) => `${many ? `# Variant ${i + 1}: ${pl.vars[i].headline}\n\n` : ''}${captionsMarkdown(c)}`).join('\n---\n\n'),
    );
  }
  const manifest = {
    brand: b.id, campaign: pl.campaign, id: pl.itemId, dir, generatedAt: new Date().toISOString(),
    templates: pl.tpls, palettes: pl.pals, formats: pl.fmts, variants: pl.vars.length,
    files, captions: many ? captions : captions[0], copy: pl.vars,
  };
  if (!imagesOnly) await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Render every combination of variant × template × palette × format for one ad,
 * write images (and MP4s when `video` is set) plus captions.{json,md} and manifest.json.
 */
export async function generate(opts) {
  const pl = await plan(opts);
  return execute(pl, opts);
}

/** Number of files a generate() call would produce (for progress bars / confirmations). */
export async function countOutputs(opts) {
  return (await plan(opts)).jobs.length;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
// Copy without the *accent* / _italic_ / | line-break markup, for spreadsheets.
const plainCopy = (s) => (s == null ? '' : String(s).replace(/[*_]/g, '').replace(/\s*(\\n|\n|\|)\s*/g, ' ').trim());

/**
 * Bulk mode: many rows of copy (each row = one ad) rendered with shared settings.
 * `shared` holds copy/options applied to every row; row values override it.
 * Also writes <campaign>/campaign.csv listing every file with its copy and caption.
 */
export async function generateBatch({ brand, campaign = 'bulk', rows = [], shared = {}, onProgress, ...opts }) {
  if (!rows.length) throw new Error('No rows to generate');
  const used = new Set();
  const plans = [];
  for (const [i, row] of rows.entries()) {
    const { id, ...copy } = row;
    let rid = slugify(id ?? copy.headline ?? copy.offer ?? `ad-${i + 1}`);
    for (let n = 2; used.has(rid); n++) rid = `${slugify(id ?? copy.headline ?? `ad-${i + 1}`)}-${n}`;
    used.add(rid);
    plans.push(await plan({ ...opts, brand, campaign, id: rid, content: { ...shared, ...copy } }));
  }
  const total = plans.reduce((s, p) => s + p.jobs.length, 0);
  let done = 0;
  const manifests = [];
  for (const pl of plans) {
    manifests.push(await execute(pl, { ...opts, onProgress: (_d, _t, job) => onProgress?.(++done, total, { ...job, ad: pl.itemId }) }));
  }

  const campaignDir = path.dirname(manifests[0].dir);
  const header = ['ad', 'file', 'type', 'format', 'platform', 'width', 'height', 'template', 'palette', 'eyebrow', 'headline', 'subhead', 'cta', 'caption'];
  const lines = [header.join(',')];
  for (const m of manifests) {
    for (const f of m.files) {
      const copy = m.copy[f.variant - 1] ?? {};
      const cap = (Array.isArray(m.captions) ? m.captions[f.variant - 1] : m.captions)?.[f.platform];
      const capText = typeof cap === 'object' && cap ? `${cap.title}\n\n${cap.description}` : cap;
      lines.push([m.id, path.relative(campaignDir, f.path).replaceAll('\\', '/'), f.kind, f.format, f.platform, f.width, f.height,
        f.template, f.palette, ...[copy.eyebrow, copy.offer ? `${copy.offer} ${copy.headline ?? ''}` : copy.headline, copy.subhead, copy.cta].map(plainCopy), capText].map(csvCell).join(','));
    }
  }
  const csv = path.join(campaignDir, 'campaign.csv');
  await fs.writeFile(csv, `﻿${lines.join('\r\n')}`); // BOM so Excel reads UTF-8 (emoji, accents)
  return { dir: campaignDir, csv, total, manifests };
}
