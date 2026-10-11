import fs from 'node:fs/promises';
import path from 'node:path';
import { BRANDS_DIR, safeJoin, slugify } from './paths.js';
import { VIDEO_EXT } from './media.js';

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const FONT_EXT = /\.(woff2?|ttf|otf)$/i;
const isMedia = (f) => IMAGE_EXT.test(f) || VIDEO_EXT.test(f);

export const BRAND_DEFAULTS = {
  name: 'Untitled Brand',
  tagline: '',
  fonts: {
    display: { family: 'Inter', weight: 800, google: 'Inter:wght@400;600;800' },
    body: { family: 'Inter', weight: 400, google: 'Inter:wght@400;600;800' },
  },
  palettes: {
    default: { bg: '#111111', fg: '#FFFFFF', accent: '#FF5A36', muted: '#A0A0A0', ctaText: '#111111' },
  },
  logo: null,          // path inside the brand folder, e.g. "assets/logo.svg"
  style: {
    headlineCase: 'none',      // none | upper | lower
    headlineTracking: '-0.02em',
    headlineLeading: 1.0,
    eyebrowCase: 'upper',
    radius: 999,               // CTA corner radius in px @1080 (999 = pill)
    overlay: 0.45,             // darkening over background images (0–1)
    bgStyle: 'solid',          // background when there's no image: solid | gradient | aurora | grid | dots | spotlight
    grain: false,              // subtle film grain texture
    align: 'left',             // left | center
  },
  defaults: { templates: ['headline'], formats: 'social', palettes: ['default'] },
  captions: {
    voice: '',                 // free-text tone notes for humans / LLMs writing copy
    hashtags: [],
    signoff: '',
    link: '',
    emoji: true,
  },
};

function deepMerge(base, over) {
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && v && typeof v === 'object' && !Array.isArray(v)
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

export function brandDir(id) {
  return safeJoin(BRANDS_DIR, slugify(id));
}

export async function listBrands() {
  await fs.mkdir(BRANDS_DIR, { recursive: true });
  const entries = await fs.readdir(BRANDS_DIR, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try { out.push(await loadBrand(e.name)); } catch { /* skip folders without brand.json */ }
  }
  return out;
}

/** New brands never merge into an existing brand with the same name. */
export async function createBrand(patch, { logoAsset } = {}) {
  if (!patch.name?.trim()) throw new Error('A new brand needs a name');
  await fs.mkdir(BRANDS_DIR, { recursive: true });
  const base = slugify(patch.name);
  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? base : `${base.slice(0, 54)}-${n}`;
    try { await fs.mkdir(brandDir(id)); }
    catch (err) { if (err.code === 'EEXIST') continue; throw err; }
    const logo = logoAsset ? await saveAsset(id, `website-logo.${logoAsset.ext}`, logoAsset.body) : patch.logo;
    return saveBrand(id, { ...patch, logo: logo ?? null }, { replace: true });
  }
  throw new Error('Too many brands share this name. Try a different name.');
}

export async function loadBrand(id) {
  const dir = brandDir(id);
  let raw;
  let version;
  try {
    const file = path.join(dir, 'brand.json');
    raw = JSON.parse(await fs.readFile(file, 'utf8'));
    version = Math.floor((await fs.stat(file)).mtimeMs);
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Brand "${id}" not found. Create it with save_brand or add brands/${slugify(id)}/brand.json`);
    throw new Error(`brands/${path.basename(dir)}/brand.json is invalid: ${e.message}`);
  }
  const brand = deepMerge(BRAND_DEFAULTS, raw);
  // Palettes are replaced wholesale, not merged with the default palette.
  brand.palettes = raw.palettes ?? BRAND_DEFAULTS.palettes;
  brand.id = path.basename(dir);
  brand.dir = dir;
  brand.version = version; // file timestamp: lets editors detect they're saving over a newer copy
  brand.assets = await listAssets(brand.id);
  return brand;
}

/**
 * Create or update a brand. By default `patch` is deep-merged into the existing brand.json
 * (a palette set to null is deleted). With { replace: true } the brand is overwritten wholesale.
 */
export async function saveBrand(id, patch, { replace = false, expectVersion } = {}) {
  if (!id && !patch.name) throw new Error('A new brand needs a name');
  const dir = brandDir(id || patch.name);
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  const file = path.join(dir, 'brand.json');
  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(file, 'utf8'));
    if (expectVersion && Math.floor((await fs.stat(file)).mtimeMs) > expectVersion) {
      throw Object.assign(new Error('This brand was changed somewhere else since you opened it. Reload to get the latest version, then redo your edits.'), { code: 'STALE' });
    }
  } catch (e) { if (e.code === 'STALE') throw e; /* new brand */ }
  const next = replace ? { ...patch } : deepMerge(existing, patch);
  if (!replace && patch.palettes) next.palettes = { ...existing.palettes, ...patch.palettes };
  for (const [k, v] of Object.entries(next.palettes ?? {})) if (v == null) delete next.palettes[k];
  if (next.palettes && !Object.keys(next.palettes).length) throw new Error('A brand needs at least one palette');
  delete next.id; delete next.dir; delete next.assets; delete next.version;
  await fs.writeFile(file, JSON.stringify(next, null, 2));
  return loadBrand(path.basename(dir));
}

export async function listAssets(id) {
  const dir = path.join(brandDir(id), 'assets');
  try {
    const files = await fs.readdir(dir);
    return files.filter(isMedia).map((f) => `assets/${f}`);
  } catch {
    return [];
  }
}

export async function saveAsset(id, filename, buffer) {
  const name = path.basename(filename).replace(/[^\w.\-]+/g, '_');
  if (!isMedia(name) && !FONT_EXT.test(name)) throw new Error('Asset must be an image (png, jpg, webp, gif, svg, avif), a video (mp4, mov, webm) or a font (woff2, ttf, otf)');
  const dir = path.join(brandDir(id), 'assets');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  return `assets/${name}`;
}

/** Delete one of a brand's media files (never the logo in use). Returns the removed ref. */
export async function deleteAsset(id, ref) {
  if (!/^assets\//.test(ref ?? '')) throw new Error('Can only delete files in the brand\'s assets folder');
  const b = await loadBrand(id);
  if (b.logo === ref) throw new Error('That file is the brand logo. Pick another logo first.');
  await fs.rm(safeJoin(path.join(brandDir(id), 'assets'), ref.slice('assets/'.length)));
  await fs.rm(path.join(brandDir(id), 'assets', '.cache', `${path.basename(ref)}.poster.jpg`), { force: true });
  return ref;
}

/** Absolute file path for a brand-relative asset ref (or an absolute path). */
export function assetPath(brand, ref) {
  return path.isAbsolute(ref) ? ref : safeJoin(brand.dir, ref);
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

/**
 * Asset resolvers turn a brand-relative path ("assets/x.jpg"), an absolute file path or an
 * http(s) URL into something the template HTML can load.
 *  - dataUriResolver: inlines files (used when rendering, so pages are self-contained)
 *  - httpResolver: points at the web server's /brands static route (used for live previews)
 */
export function dataUriResolver(brand) {
  return async (ref) => {
    if (!ref) return null;
    if (/^(https?:|data:)/.test(ref)) return ref;
    const file = assetPath(brand, ref);
    const ext = path.extname(file).slice(1).toLowerCase();
    const buf = await fs.readFile(file);
    return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${buf.toString('base64')}`;
  };
}

export function httpResolver(brand) {
  return async (ref) => {
    if (!ref) return null;
    if (/^(https?:|data:)/.test(ref)) return ref;
    if (path.isAbsolute(ref)) return dataUriResolver(brand)(ref);
    return `/brands/${encodeURIComponent(brand.id)}/${ref.split('/').map(encodeURIComponent).join('/')}`;
  };
}
