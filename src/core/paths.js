import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the app's code lives (read-only when installed). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Where the user's work lives: brands, saved campaigns, exports, settings. Defaults to the project
 * folder for development; the desktop app points it at Documents/Content Chef via CONTENT_CHEF_HOME
 * (and passes the same value to the MCP server so Claude sees the same brands).
 */
export const HOME = process.env.CONTENT_CHEF_HOME ? path.resolve(process.env.CONTENT_CHEF_HOME) : ROOT;
export const BRANDS_DIR = path.join(HOME, 'brands');
export const CATALOG_DIR = path.join(HOME, 'catalog');
export const OUTPUT_DIR = path.join(HOME, 'output');
export const DATA_DIR = path.join(HOME, 'data');
export const TEMPLATES_DIR = path.join(HOME, 'templates'); // custom templates (made by the user or Claude)
export const EXAMPLES_DIR = path.join(ROOT, 'examples');

/**
 * First run: give an empty workspace the example brands and campaign so there's something to
 * play with. Never touches folders that already have content.
 */
export function ensureWorkspace() {
  for (const [sub, dest] of [['brands', BRANDS_DIR], ['catalog', CATALOG_DIR], ['templates', TEMPLATES_DIR]]) {
    const src = path.join(EXAMPLES_DIR, sub);
    const empty = !fs.existsSync(dest) || fs.readdirSync(dest).length === 0;
    if (empty && fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true });
  }
  for (const d of [OUTPUT_DIR, DATA_DIR, TEMPLATES_DIR]) fs.mkdirSync(d, { recursive: true });
}

/** Turn arbitrary text into a safe file/folder slug. */
export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

/** Resolve `child` inside `base`, refusing anything that escapes it. */
export function safeJoin(base, child) {
  const p = path.resolve(base, child);
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error(`Path escapes ${base}: ${child}`);
  return p;
}
