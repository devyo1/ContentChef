import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { ROOT } from './paths.js';
import { videoEncoder, extractFrames } from './media.js';

// Two browsers: a GPU-accelerated one for ad rendering (blur / glass / backdrop-filter are ~9×
// faster) and a software one as a fallback — GPU capture can fail on pages holding many large
// images (contact sheets) or with flaky drivers. Set ADGEN_NO_GPU=1 to always use software.
const ANGLE = { win32: ['--use-angle=d3d11'], darwin: ['--use-angle=metal'] }[process.platform] ?? [];
const GPU_ARGS = ['--enable-gpu', ...ANGLE, '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force-color-profile=srgb'];
const browsers = {};
let installing = null;

/**
 * First-run safety net for installed copies: if no usable browser exists (no Playwright Chromium,
 * no Edge/Chrome), download Playwright's Chromium once. Runs Playwright's own installer with the
 * current runtime (the desktop app runs it in Node mode).
 */
function installChromium() {
  installing ??= new Promise((resolve, reject) => {
    const cli = path.join(ROOT, 'node_modules', 'playwright', 'cli.js');
    const env = { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
    const p = spawn(process.execPath, [cli, 'install', 'chromium'], { env, stdio: 'ignore', windowsHide: true });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Chromium download failed (exit ${code})`))));
  }).finally(() => { installing = null; });
  return installing;
}

async function launch(kind) {
  // Prefer Playwright's bundled Chromium; fall back to system Edge / Chrome; as a last resort,
  // download Chromium. Always render in sRGB so exported colours match the hex values on any monitor.
  const args = kind === 'gpu' && !process.env.ADGEN_NO_GPU ? GPU_ARGS : ['--force-color-profile=srgb'];
  let lastErr;
  for (const channel of [undefined, 'msedge', 'chrome']) {
    try { return await chromium.launch({ channel, args }); } catch (e) { lastErr = e; }
  }
  try {
    await installChromium();
    return await chromium.launch({ args });
  } catch (e) {
    throw new Error(`Could not start a browser for rendering. Check your internet connection (Chromium is downloaded on first use) or run "npm run setup".\n${e.message ?? lastErr?.message}`);
  }
}

export function getBrowser(kind = 'gpu') {
  browsers[kind] ??= launch(kind).catch((e) => { delete browsers[kind]; throw e; });
  return browsers[kind];
}

export async function closeBrowser() {
  const all = Object.values(browsers);
  for (const k of Object.keys(browsers)) delete browsers[k];
  await Promise.all(all.map(async (p) => (await p.catch(() => null))?.close()));
}

/** Open an ad page, wait until fonts/fit/animations are ready, run `fn(page)`, then clean up. */
async function withAdPage(html, opts, fn) {
  try {
    return await withAdPageOn('gpu', html, opts, fn);
  } catch (e) {
    if (!/capture screenshot|Target crashed|GPU/i.test(e.message)) throw e;
    return withAdPageOn('cpu', html, opts, fn);
  }
}

async function withAdPageOn(kind, html, { width, height, scale = 1, setup }, fn) {
  const browser = await getBrowser(kind);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  try {
    const page = await context.newPage();
    if (setup) await setup(page);
    await page.setContent(html, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => window.__AD_READY === true, null, { timeout: 30000 });
    return await fn(page);
  } finally {
    await context.close();
  }
}

// No `animations: 'disabled'`: Playwright would fast-forward our paused timeline to the end.
const shot = (page, width, height, type = 'png', quality = 92) =>
  page.screenshot({ type, ...(type === 'jpeg' ? { quality } : {}), clip: { x: 0, y: 0, width, height }, caret: 'initial' });

/**
 * Render an ad HTML document to a still image buffer (the finished state of any animation).
 * @param {string} html
 * @param {{width:number,height:number,scale?:number,type?:'png'|'jpeg',quality?:number}} o
 */
export async function renderHtml(html, { width, height, scale = 1, type = 'png', quality = 92 }) {
  return withAdPage(html, { width, height, scale }, async (page) => {
    await page.evaluate(() => window.__stillPose?.()); // frozen pose for glimmer / holo on stills
    return shot(page, width, height, type, quality);
  });
}

/** Capture the ad at specific moments (seconds) — used for animation filmstrips. */
export async function renderFrames(html, { width, height, scale = 1, times, quality = 85 }) {
  return withAdPage(html, { width, height, scale }, async (page) => {
    const out = [];
    for (const t of times) {
      await page.evaluate((s) => window.__setTime(s), t);
      out.push(await shot(page, width, height, 'jpeg', quality));
    }
    return out;
  });
}

/**
 * Render an animated ad to MP4 by stepping the animation clock frame by frame.
 * If `bgVideo` (a file path) is given, its frames are decoded and swapped into the page's
 * background image for each frame, so blur/glass/scrim effects apply to the video too.
 */
export async function renderVideo(html, { width, height, scale = 1, fps = 30, duration = 6, out, bgVideo, onFrame }) {
  const W = Math.round(width * scale);
  const H = Math.round(height * scale);
  let frameDir = null;
  let frameCount = 0;
  try {
    if (bgVideo) {
      frameDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adgen-frames-'));
      frameCount = await extractFrames(bgVideo, frameDir, { width: W, height: H, fps, duration });
    }
    const setup = frameDir && ((page) => page.route('http://adgen.local/frames/*', (route) =>
      route.fulfill({ path: path.join(frameDir, path.basename(new URL(route.request().url()).pathname)), contentType: 'image/jpeg' })));
    await withAdPage(html, { width, height, scale, setup }, async (page) => {
      const enc = videoEncoder({ out, width: W, height: H, fps, duration });
      const total = Math.round(duration * fps);
      try {
        for (let i = 0; i < total; i++) {
          const frameUrl = frameCount ? `http://adgen.local/frames/${String(Math.min(i + 1, frameCount)).padStart(5, '0')}.jpg` : null;
          await page.evaluate(async ([t, url]) => {
            if (url) await window.__setBgFrame(url);
            window.__setTime(t);
          }, [i / fps, frameUrl]);
          await enc.write(await shot(page, width, height, 'jpeg', 94));
          onFrame?.(i + 1, total);
        }
      } finally {
        await enc.end();
      }
    });
    return out;
  } finally {
    if (frameDir) await fs.rm(frameDir, { recursive: true, force: true });
  }
}

/** Run async tasks with limited concurrency. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
