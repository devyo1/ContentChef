import fs from 'node:fs/promises';
import path from 'node:path';
import { CATALOG_DIR, safeJoin, slugify } from './paths.js';
import { generate, splitItem } from './generate.js';

// A catalog is a JSON file of ad items for one brand + campaign:
// { brand, campaign, defaults: { templates, palettes, formats }, items: [ { id, headline, ... } ] }

function catalogPath(name) {
  return safeJoin(CATALOG_DIR, `${slugify(name.replace(/\.json$/i, ''))}.json`);
}

export async function listCatalogs() {
  await fs.mkdir(CATALOG_DIR, { recursive: true });
  const files = (await fs.readdir(CATALOG_DIR)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const c = JSON.parse(await fs.readFile(path.join(CATALOG_DIR, f), 'utf8'));
      out.push({ name: f.replace(/\.json$/, ''), brand: c.brand, campaign: c.campaign, items: (c.items ?? []).map((i) => i.id) });
    } catch (e) {
      out.push({ name: f.replace(/\.json$/, ''), error: e.message });
    }
  }
  return out;
}

export async function loadCatalog(name) {
  // Accept a bare name ("northside-autumn") or a path to any JSON file.
  const file = name.endsWith('.json') && (await exists(path.resolve(name))) ? path.resolve(name) : catalogPath(name);
  const cat = JSON.parse(await fs.readFile(file, 'utf8'));
  cat.items ??= [];
  cat.defaults ??= {};
  return { ...cat, file };
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function saveCatalog(name, catalog) {
  const file = catalogPath(name);
  await fs.mkdir(CATALOG_DIR, { recursive: true });
  const { file: _drop, ...rest } = catalog;
  await fs.writeFile(file, JSON.stringify(rest, null, 2));
  return file;
}

/** Add or replace (by id) an item in a catalog, creating the catalog if needed. */
export async function upsertItem(name, item, { brand, campaign } = {}) {
  let cat;
  try { cat = await loadCatalog(name); } catch {
    if (!brand) throw new Error(`Catalog "${name}" doesn't exist yet; pass a brand to create it.`);
    cat = { brand, campaign: campaign ?? name, defaults: {}, items: [] };
  }
  const entry = { ...item, id: slugify(item.id ?? item.headline ?? `item-${cat.items.length + 1}`) };
  const idx = cat.items.findIndex((i) => i.id === entry.id);
  if (idx >= 0) cat.items[idx] = entry; else cat.items.push(entry);
  await saveCatalog(name, cat);
  return { catalog: name, item: entry, count: cat.items.length };
}

export async function removeItem(name, id) {
  const cat = await loadCatalog(name);
  cat.items = cat.items.filter((i) => i.id !== id);
  await saveCatalog(name, cat);
}

/** Render a whole catalog (or selected item ids). Returns one manifest per item. */
export async function renderCatalog(name, { only, onProgress, ...opts } = {}) {
  const cat = await loadCatalog(name);
  const items = only?.length ? cat.items.filter((i) => only.includes(i.id)) : cat.items;
  if (!items.length) throw new Error(only?.length ? `No items matching ${only.join(', ')}` : 'Catalog has no items');
  const manifests = [];
  for (const item of items) {
    manifests.push(await generate({
      brand: item.brand ?? cat.brand,
      campaign: cat.campaign ?? name,
      id: item.id,
      content: { ...cat.defaults.content, ...splitItem(item) },
      variants: item.variants,
      templates: item.templates ?? item.template ?? cat.defaults.templates,
      palettes: item.palettes ?? item.palette ?? cat.defaults.palettes,
      formats: item.formats ?? item.format ?? cat.defaults.formats,
      ...opts,
      onProgress: onProgress && ((d, t, job) => onProgress(item.id, d, t, job)),
    }));
  }
  return manifests;
}
