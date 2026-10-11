import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getBrowser } from './renderer.js';
import { esc } from './templates/base.js';

/**
 * Tile rendered images into one contact-sheet image (for quick human / LLM review).
 * @param {{path:string,label?:string}[]} files
 * @returns {Promise<Buffer>} JPEG
 */
export async function contactSheet(files, { width = 1400, thumbHeight = 260, quality = 80 } = {}) {
  const html = `<!doctype html><body style="margin:0;background:#2b2b2b;color:#ddd;font:13px system-ui,sans-serif;width:${width}px;padding:12px;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
${files.map((f) => `<figure style="margin:0"><img src="${pathToFileURL(f.path)}" style="height:${thumbHeight}px;display:block;box-shadow:0 1px 4px #0008"><figcaption style="margin-top:4px;max-width:${thumbHeight * 1.8}px">${esc(f.label ?? path.basename(f.path))}</figcaption></figure>`).join('')}
</body>`;
  const tmp = path.join(os.tmpdir(), `adgen-sheet-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, html);
  const browser = await getBrowser('cpu');
  const page = await browser.newPage({ viewport: { width, height: 400 } });
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    // Size the viewport to the content instead of fullPage capture (more reliable with GPU rendering).
    const h = await page.evaluate(() => Math.ceil(document.body.scrollHeight));
    await page.setViewportSize({ width, height: h });
    return await page.screenshot({ type: 'jpeg', quality });
  } finally {
    await page.close();
    await fs.rm(tmp, { force: true });
  }
}
