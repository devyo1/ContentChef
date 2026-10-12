#!/usr/bin/env node
// Local web editor: live previews, single + bulk ad creation, brand editing, export jobs with progress.
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  listBrands, loadBrand, saveBrand, saveAsset, describeTemplates, FORMATS, FORMAT_GROUPS, PLATFORMS,
  ANIMATIONS, BG_STYLES, EFFECTS, STYLE_ROLES, CATEGORIES, PALETTE_LIBRARY, FONT_LIBRARY, googleSpec, composeAd, generate, generateBatch,
  buildCaptions, listCatalogs, loadCatalog, saveCatalog, upsertItem, removeItem, renderCatalog,
  closeBrowser, getWorkspace, setWorkspace, getSettings, saveSettings, publicSettings,
  BRANDS_DIR, OUTPUT_DIR, CATALOG_DIR, DATA_DIR, TEMPLATES_DIR, ROOT, HOME, ensureWorkspace, mcpLaunch,
  deleteAsset, assetPath, gifToMp4, getActivity, CTA_FX, LOOP_PERIODS, DECOR_PRESETS, trimVideo, VIDEO_ASPECTS,
} from './core/index.js';
import { runChat, resetChat, chatErrorMessage } from './chat.js';
import { writeCopy, writeCaptions } from './copywriter.js';
import { claudeCodeStatus, startClaudeLogin, runClaudeCodeChat, resetClaudeCodeChat } from './claude-code.js';
import { codexStatus, startCodexLogin, runCodexChat, resetCodexChat } from './codex.js';
import { draftBrand, acceptBrandDraft } from './brand-import.js';
import { createBrand } from './core/brands.js';
import { imageStatus, prepareBackground, generateBackground } from './background-images.js';
import { connectHiggsfield, finishHiggsfield, disconnectHiggsfield, higgsfieldModels } from './higgsfield.js';
import { getPlanner, savePlanner, planContent, plannerIcs, PLANNER_DIR } from './planner.js';
import { listCarousels, loadCarousel, createCarousel, saveCarouselSlide, refineCarouselSlide, exportCarousel, saveCarouselDesign, generateCarouselDesign } from './carousels.js';

const PORT = Number(process.env.PORT ?? 4545);
const APP_VERSION = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/preact', express.static(path.join(ROOT, 'node_modules/preact')));
app.use('/vendor/htm', express.static(path.join(ROOT, 'node_modules/htm')));
app.use('/brands', express.static(BRANDS_DIR));
app.use('/output', express.static(OUTPUT_DIR));

const api = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (e) { res.status(400).json({ error: e.message }); }
};
const toUrl = (p) => `/output/${path.relative(OUTPUT_DIR, p).split(path.sep).map(encodeURIComponent).join('/')}`;
const withUrls = (m) => ({ ...m, folder: path.relative(ROOT, m.dir), files: m.files.map((f) => ({ ...f, url: toUrl(f.path) })) });
const stripDir = ({ dir, ...b }) => b;

// ── Metadata ────────────────────────────────────────────────────────────────

app.get('/api/meta', api(async () => ({
  version: APP_VERSION,
  brands: (await listBrands()).map(stripDir),
  templates: describeTemplates(),
  categories: CATEGORIES,
  formats: FORMATS,
  groups: FORMAT_GROUPS,
  platforms: PLATFORMS,
  animations: ANIMATIONS,
  effects: EFFECTS,
  ctaFx: CTA_FX,
  decorPresets: DECOR_PRESETS,
  loopPeriods: LOOP_PERIODS,
  styleRoles: STYLE_ROLES,
  bgStyles: BG_STYLES,
  paletteLibrary: PALETTE_LIBRARY,
  fonts: FONT_LIBRARY.map((f) => ({ ...f, google: googleSpec(f.family) })),
  root: ROOT,
  home: HOME,
  mcp: mcpLaunch(),
  desktop: !!process.versions.electron,
})));

// ── Brands ──────────────────────────────────────────────────────────────────

app.get('/api/brand/:id', api(async (req) => stripDir(await loadBrand(req.params.id))));
const progressApi = (work) => async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const streaming = req.get('accept') === 'application/x-ndjson';
  const send = (event) => { if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`); };
  let heartbeat;
  if (streaming) {
    res.set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    heartbeat = setInterval(() => send({ type: 'heartbeat' }), 15000);
  }
  try {
    const result = await work(req.body, { signal: controller.signal,
      onProgress: streaming ? (progress) => send({ type: 'progress', ...progress }) : undefined });
    if (!res.destroyed) {
      if (streaming) { send({ type: 'result', result }); res.end(); }
      else res.json(result);
    }
  } catch (e) {
    if (!res.destroyed) {
      if (streaming) { send({ type: 'error', error: e.message }); res.end(); }
      else res.status(400).json({ error: e.message });
    }
  } finally { clearInterval(heartbeat); }
};
app.post('/api/brand-import/draft', progressApi(draftBrand));
app.post('/api/brand-import/create', api(async (req) => stripDir(await acceptBrandDraft(req.body))));
// ── Content planner (strategy + calendar) ──
app.get('/api/planner', api((req) => getPlanner(String(req.query.brand ?? ''))));
app.put('/api/planner/:brand', api((req) => savePlanner(req.params.brand, req.body)));
app.post('/api/planner/:brand/plan', api(async (req, res) => {
  const controller = new AbortController(); res.on('close', () => controller.abort());
  return planContent(req.params.brand, req.body, { signal: controller.signal });
}));
app.get('/api/planner/:brand/calendar.ics', async (req, res) => {
  try {
    const b = await loadBrand(req.params.brand);
    res.type('text/calendar').set('content-disposition', `attachment; filename="${b.id}-content-plan.ics"`).send(plannerIcs(await getPlanner(b.id), b.name));
  } catch (e) { res.status(400).type('text').send(e.message); }
});

app.get('/api/carousels', api((req) => listCarousels(req.query.brand)));
app.get('/api/carousels/:id', api((req) => loadCarousel(req.params.id)));
app.put('/api/carousels/:id/design', api(req => saveCarouselDesign(req.params.id, req.body)));
app.post('/api/carousels', progressApi(createCarousel));
app.put('/api/carousels/:id/slides/:slide', api((req) => saveCarouselSlide(req.params.id, req.params.slide, req.body)));
app.post('/api/carousels/:id/slides/:slide/refine', api(async (req, res) => {
  const controller = new AbortController(); res.on('close', () => controller.abort());
  return refineCarouselSlide(req.params.id, req.params.slide, req.body, { signal: controller.signal });
}));
app.post('/api/carousels/:id/export', api(async (req) => {
  await loadCarousel(req.params.id);
  const job = startJob(async (onProgress) => {
    const result = await exportCarousel(req.params.id, { generate, onProgress });
    return { ...result, dir: path.relative(ROOT, result.dir), files: result.files.map((p) => ({ name: path.basename(p), url: toUrl(p) })) };
  });
  return { id: job.id };
}));
// Editor saves send the complete brand, so replace rather than merge (lets palettes be deleted).
app.put('/api/brand/:id', api(async (req) => {
  const isNew = req.params.id === '_new';
  const { version, ...body } = req.body;
  return stripDir(isNew ? await createBrand(body) : await saveBrand(req.params.id, body, { replace: true, expectVersion: version }));
}));

app.post('/api/upload', express.raw({ type: '*/*', limit: '500mb' }), api(async (req) => {
  const ref = await saveAsset(req.query.brand, req.query.name, req.body);
  // Animated GIFs become MP4s so they play as background video (frame-exact in exports).
  if (/\.gif$/i.test(ref) && req.query.keepGif !== '1') {
    const b = await loadBrand(req.query.brand);
    const gif = assetPath(b, ref);
    try {
      await gifToMp4(gif);
      await fs.rm(gif, { force: true });
      return { ref: ref.replace(/\.gif$/i, '.mp4') };
    } catch { /* a still GIF or an odd file: keep it as an image */ }
  }
  return { ref };
}));

app.delete('/api/brand/:id/asset', api(async (req) => ({ removed: await deleteAsset(req.params.id, req.query.ref) })));

app.get('/api/images/status', api(async req => imageStatus(await getSettings(), req.query.fresh === '1')));
app.get('/api/higgsfield/models', api(() => higgsfieldModels()));
app.post('/api/higgsfield/connect', api(req => connectHiggsfield(req.socket.localPort)));
app.post('/api/higgsfield/disconnect', api(() => disconnectHiggsfield()));
app.get('/api/higgsfield/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await finishHiggsfield(req.query); res.redirect(303, '/?higgsfield=connected'); }
  catch (e) { res.status(400).type('text').send(e.message); }
});
for (const [route, run] of [['prepare', (b, options) => prepareBackground(b, options)], ['generate', (b, options) => generateBackground(b.id, { ...options, acceptedCost: b.acceptedCost === true })]]) {
  app.post(`/api/background/${route}`, api(async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    return run(req.body, { signal: controller.signal });
  }));
}

// ── Preview + captions ──────────────────────────────────────────────────────

app.post('/api/preview', async (req, res) => {
  try {
    let { brand, brandId, ...rest } = req.body;
    // The brand editor previews unsaved edits by sending the whole brand object.
    if (brand && typeof brand === 'object') {
      const base = await loadBrand(brandId);
      brand = { ...base, ...brand, id: base.id, dir: base.dir, assets: base.assets };
    }
    res.type('html').send(await composeAd({ ...rest, brand, assets: 'http' }));
  } catch (e) {
    res.status(400).type('html').send(`<body style="font:15px system-ui;padding:24px;color:#c33;background:#fff">${e.message.replace(/</g, '&lt;')}</body>`);
  }
});

app.post('/api/captions', api(async (req) => buildCaptions(await loadBrand(req.body.brand), req.body.content, req.body.platforms)));

// ── Export jobs (run in the background; the page polls for progress) ────────

const jobs = new Map();

function startJob(work) {
  // recent: the last few finished stills, so the editor can show work coming together while it renders.
  const job = { id: randomUUID(), status: 'running', done: 0, total: 0, current: '', recent: [], startedAt: Date.now(), result: null, error: null };
  jobs.set(job.id, job);
  const onProgress = (done, total, j) => {
    Object.assign(job, { done, total, current: `${j.ad ? `${j.ad} · ` : ''}${j.file}` });
    if (j.kind === 'image' && j.path) job.recent = [...job.recent, toUrl(j.path)].slice(-10);
  };
  work(onProgress)
    .then((result) => Object.assign(job, { status: 'done', result, finishedAt: Date.now() }))
    .catch((e) => Object.assign(job, { status: 'error', error: e.message, finishedAt: Date.now() }));
  return job;
}

app.post('/api/jobs', api(async (req) => {
  const { mode, brand, campaign, content, variants, rows, templates, palettes, formats, scale, type, video, gif, still, id, design, imagesOnly } = req.body;
  const common = { brand, campaign: campaign || 'my-campaign', templates, palettes, formats, scale: scale || undefined, type, video, gif, still: still !== false, imagesOnly: !!imagesOnly };
  // Keep the exact editor design next to the files, so the export can be reopened and changed later.
  const keepDesign = (dir) => design && !imagesOnly && fs.writeFile(path.join(dir, 'design.json'), JSON.stringify({ brand, design, savedAt: Date.now() }, null, 2)).catch(() => {});
  const job = startJob(async (onProgress) => {
    if (mode === 'carousel') {
      const r = await generateCarouselDesign({ brand, design: { ...design, output: { ...design.output, type, scale: scale || 1, video, gif, still: still !== false } }, generate, onProgress });
      return { dir: path.relative(ROOT, r.dir), absDir: r.dir, total: r.total, ads: r.manifests.map(withUrls) };
    }
    if (mode === 'bulk') {
      const r = await generateBatch({ ...common, rows, shared: content, onProgress });
      await keepDesign(r.dir);
      return { dir: path.relative(ROOT, r.dir), absDir: r.dir, csv: toUrl(r.csv), total: r.total, ads: r.manifests.map(withUrls) };
    }
    const m = await generate({ ...common, id, content, variants, onProgress });
    await keepDesign(m.dir);
    return { dir: path.relative(ROOT, m.dir), absDir: m.dir, total: m.files.length, ads: [withUrls(m)] };
  });
  return { id: job.id };
}));

// Video mode: trim / crop / speed / mute a brand clip into output/<brand>/videos (optionally also
// saved back to the brand's media so it can be used as a background).
app.post('/api/video/trim', api(async (req) => {
  const { brand: brandId, ref, name, start, end, aspect, focusX, mute, speed, saveToBrand } = req.body;
  const b = await loadBrand(brandId);
  const src = assetPath(b, ref);
  const base = `${slugifyName(name || path.basename(ref).replace(/\.[^.]+$/, ''))}-${aspect && aspect !== 'original' ? aspect.replace(':', 'x') : 'cut'}`;
  const dir = path.join(OUTPUT_DIR, b.id, 'videos');
  const job = startJob(async (onProgress) => {
    await fs.mkdir(dir, { recursive: true });
    let out = path.join(dir, `${base}.mp4`);
    for (let n = 2; await fs.access(out).then(() => true, () => false); n++) out = path.join(dir, `${base}-${n}.mp4`);
    await trimVideo(src, out, { start, end, aspect, focusX, mute, speed });
    onProgress(1, 1, { file: path.basename(out), kind: 'video', path: out });
    let assetRef = null;
    if (saveToBrand) assetRef = await saveAsset(b.id, path.basename(out), await fs.readFile(out));
    return {
      dir: path.relative(ROOT, dir), absDir: dir, total: 1, assetRef,
      ads: [{ id: 'videos', files: [{ file: path.basename(out), url: toUrl(out), kind: 'video', format: aspect || 'original' }] }],
    };
  });
  return { id: job.id };
}));
const slugifyName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'clip';

app.get('/api/jobs/:id', api(async (req) => {
  const job = jobs.get(req.params.id);
  if (!job) throw new Error('No such job');
  return job;
}));

// Open an output folder in the OS file manager (only folders inside output/).
app.post('/api/open', api(async (req) => {
  const target = path.resolve(ROOT, req.body.path);
  if (target !== OUTPUT_DIR && !target.startsWith(OUTPUT_DIR + path.sep)) throw new Error('Can only open folders inside output/');
  await fs.mkdir(target, { recursive: true });
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [target], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
}));

// Recent export folders (campaigns) with a preview image each.
app.get('/api/exports', api(async () => {
  const out = [];
  let brands = [];
  try { brands = await fs.readdir(OUTPUT_DIR, { withFileTypes: true }); } catch { return []; }
  for (const b of brands.filter((d) => d.isDirectory())) {
    const bdir = path.join(OUTPUT_DIR, b.name);
    for (const c of (await fs.readdir(bdir, { withFileTypes: true })).filter((d) => d.isDirectory())) {
      const cdir = path.join(bdir, c.name);
      const ads = (await fs.readdir(cdir, { withFileTypes: true })).filter((d) => d.isDirectory());
      let thumb = null;
      let files = 0;
      for (const a of ads) {
        try {
          const m = JSON.parse(await fs.readFile(path.join(cdir, a.name, 'manifest.json'), 'utf8'));
          files += m.files.length;
          thumb ??= m.files.find((f) => f.kind !== 'video')?.path;
        } catch { /* not an ad folder */ }
      }
      const stat = await fs.stat(cdir);
      let csv = null;
      try { await fs.access(path.join(cdir, 'campaign.csv')); csv = toUrl(path.join(cdir, 'campaign.csv')); } catch { /* single-ad export */ }
      out.push({ brand: b.name, campaign: c.name, dir: path.relative(ROOT, cdir), ads: ads.length, files, thumb: thumb && toUrl(thumb), csv, modified: stat.mtimeMs });
    }
  }
  return out.sort((a, b) => b.modified - a.modified);
}));

/**
 * Reopen an export in the builder: the exact design saved with it (design.json), or, for older
 * exports and ones Claude rendered in the background, one rebuilt from the manifests.
 */
app.get('/api/exports/design', api(async (req) => {
  const dir = path.resolve(ROOT, String(req.query.dir ?? ''));
  if (!dir.startsWith(OUTPUT_DIR + path.sep)) throw new Error('That is not an export folder');
  const subdirs = async (d) => (await fs.readdir(d, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name));
  const readJson = async (f) => JSON.parse(await fs.readFile(f, 'utf8'));
  let saved = null;
  for (const d of [dir, ...(await subdirs(dir))]) {
    const j = await readJson(path.join(d, 'design.json')).catch(() => null);
    if (j?.design && (!saved || j.savedAt > saved.savedAt)) saved = j;
  }
  if (saved) return { brand: saved.brand, design: saved.design, from: 'saved' };
  const manifests = (await Promise.all((await subdirs(dir)).map((d) => readJson(path.join(d, 'manifest.json')).catch(() => null)))).filter(Boolean)
    .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  if (!manifests.length) throw new Error('No ads found in this export');
  const m = manifests[0];
  const shared = { templates: m.templates, palettes: m.palettes, formats: m.formats, campaign: m.campaign };
  const bulk = manifests.length > 1 && await fs.access(path.join(dir, 'campaign.csv')).then(() => true, () => false);
  const design = bulk
    ? { mode: 'bulk', content: {}, rows: manifests.reverse().map((x) => x.copy?.[0] ?? {}), ...shared }
    : { mode: 'single', content: m.copy?.[0] ?? {}, variants: (m.copy ?? []).slice(1).map((c) => c.headline).filter(Boolean), ...shared };
  return { brand: m.brand, design, from: 'manifest' };
}));

// ── Saved campaigns (catalogs) ──────────────────────────────────────────────

app.get('/api/catalogs', api(() => listCatalogs()));
app.get('/api/catalog/:name', api(async (req) => { const { file, ...c } = await loadCatalog(req.params.name); return c; }));
app.put('/api/catalog/:name', api(async (req) => ({ file: await saveCatalog(req.params.name, req.body) })));
app.post('/api/catalog/:name/item', api((req) => upsertItem(req.params.name, req.body.item, req.body)));
app.delete('/api/catalog/:name/item/:id', api(async (req) => { await removeItem(req.params.name, req.params.id); return { ok: true }; }));
app.post('/api/catalog/:name/render', api(async (req) => {
  const job = startJob(async (onProgress) => {
    const ms = await renderCatalog(req.params.name, { only: req.body.only, onProgress: (id, d, t, j) => onProgress(d, t, { ...j, ad: id }) });
    return { dir: path.relative(ROOT, path.dirname(ms[0].dir)), absDir: path.dirname(ms[0].dir), total: ms.reduce((s, m) => s + m.files.length, 0), ads: ms.map(withUrls) };
  });
  return { id: job.id };
}));

// ── Live updates (Server-Sent Events) ───────────────────────────────────────
// Editors subscribe here. When Claude (MCP or chat) edits the workspace or a brand changes on
// disk, open editors refresh without a reload.

const clients = new Set();
app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write('retry: 2000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});
const broadcast = (data) => { for (const c of clients) c.write(`data: ${JSON.stringify(data)}\n\n`); };

function watchDir(dir, opts, onChange) {
  // Debounce per file, so a change to one file (e.g. the activity log) never swallows another (the workspace).
  const timers = new Map();
  fs.mkdir(dir, { recursive: true }).then(() => {
    try {
      watch(dir, opts, (_e, file) => {
        const f = String(file ?? '');
        clearTimeout(timers.get(f));
        timers.set(f, setTimeout(() => { timers.delete(f); onChange(f); }, 150));
      });
    } catch (e) { console.warn(`Not watching ${dir}: ${e.message}`); }
  });
}
watchDir(DATA_DIR, {}, async (file) => {
  if (file.startsWith('activity.json')) return broadcast({ type: 'activity' });
  if (!file.startsWith('workspace.json')) return;
  const ws = await getWorkspace();
  if (ws) broadcast({ type: 'workspace', source: ws.source, actor: ws.actor, view: ws.view, updatedAt: ws.updatedAt });
});
watchDir(BRANDS_DIR, { recursive: true }, (file) => { if (!file.includes('.cache')) broadcast({ type: 'meta' }); });
watchDir(CATALOG_DIR, {}, () => broadcast({ type: 'catalogs' }));
watchDir(PLANNER_DIR, {}, (f) => broadcast({ type: 'planner', brand: f.replace(/.json.*$/, '') }));
watchDir(TEMPLATES_DIR, {}, () => broadcast({ type: 'meta' })); // custom templates added / edited

// ── Shared workspace (what's open in the editor) ────────────────────────────

app.get('/api/workspace', api(async () => (await getWorkspace()) ?? {}));
// What connected AIs (Claude, ChatGPT…) have been doing, newest last.
app.get('/api/activity', api(() => getActivity()));
app.put('/api/workspace', api(async (req) => {
  const { brand, design, focus, source } = req.body;
  const ws = await setWorkspace({ brand, design, focus, source });
  return { updatedAt: ws.updatedAt };
}));

// ── Settings ────────────────────────────────────────────────────────────────

const settingsView = async (s, fresh = false) => {
  const [claudeCode, codex] = await Promise.all([
    claudeCodeStatus({ fresh, override: s.claude.codePath }),
    codexStatus({ fresh, override: s.codex.codePath }),
  ]);
  return { ...publicSettings(s), claudeCode, codexStatus: codex };
};
app.get('/api/settings', api(async (req) => settingsView(await getSettings(), req.query.fresh === '1')));
app.put('/api/settings', api(async (req) => settingsView(await saveSettings(req.body))));
app.post('/api/claude-code/login', api(async () => { startClaudeLogin((await getSettings()).claude.codePath); return { ok: true }; }));
app.post('/api/codex/login', api(async () => startCodexLogin((await getSettings()).codex.codePath)));

// ── Assistant chat (streams newline-delimited JSON events) ─────────────────────

app.post('/api/chat', async (req, res) => {
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
  const emit = (e) => res.write(`${JSON.stringify(e)}\n`);
  try {
    const s = await getSettings();
    const run = { codex: runCodexChat, api: runChat, 'claude-code': runClaudeCodeChat }[s.assistant.provider];
    if (!run) throw new Error('Choose an assistant connection in Settings.');
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    await run({ conversationId: req.body.conversationId, text: req.body.text, emit, settings: s, signal: controller.signal });
  } catch (e) {
    emit({ type: 'error', message: chatErrorMessage(e) });
    emit({ type: 'done' });
  }
  res.end();
});
app.post('/api/chat/reset', api(async (req) => { resetChat(req.body.conversationId); resetClaudeCodeChat(req.body.conversationId); resetCodexChat(req.body.conversationId); return { ok: true }; }));

app.post('/api/captions/ai', async (req, res) => {
  try { res.json(await writeCaptions(req.body)); } catch (e) { res.status(400).json({ error: chatErrorMessage(e) }); }
});

// AI copywriting in the Words step: returns copy only, never touches the design.
app.post('/api/copy', async (req, res) => {
  try { res.json(await writeCopy(req.body)); } catch (e) { res.status(400).json({ error: chatErrorMessage(e) }); }
});

/**
 * Start the editor server. Binds to localhost by default: the API can open folders, accept
 * uploads and store settings (incl. an API key), so it must not be reachable from the network.
 * Set HOST=0.0.0.0 only if you understand that. Port 0 picks a free port (used by the desktop app).
 */
export function startServer({ port = PORT, host = process.env.HOST ?? '127.0.0.1' } = {}) {
  ensureWorkspace();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve({ server, port: server.address().port }));
    server.on('error', reject);
  });
}

// Run directly (`npm start` / `node src/server.js`), as opposed to being imported by the desktop app.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { server, port } = await startServer();
  console.log(`Content Chef editor → http://localhost:${port}`);
  const shutdown = async () => { server.close(); await closeBrowser(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
