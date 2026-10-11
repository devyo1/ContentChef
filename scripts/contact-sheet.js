// Dev helper: tile every image in a folder (recursively) into one JPEG for quick review.
// Usage: node scripts/contact-sheet.js <folder> <out.jpg> [filter]
import fs from 'node:fs';
import path from 'node:path';
import { contactSheet, closeBrowser } from '../src/core/index.js';

const [dir, out, filter = ''] = process.argv.slice(2);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const imgs = walk(dir).filter((f) => /\.(png|jpg)$/.test(f) && f.includes(filter)).sort();
fs.writeFileSync(out, await contactSheet(imgs.map((p) => ({ path: p })), { width: 1600, thumbHeight: 300 }));
await closeBrowser();
console.log(`${imgs.length} images → ${out}`);
