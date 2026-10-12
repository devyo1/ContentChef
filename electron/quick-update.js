// Quick updates: most releases only change Content Chef's own code (electron/, src/, public/,
// examples/), not the Electron runtime or the bundled libraries. For those, the launcher downloads
// a small bundle of just that code from the GitHub release, checks it, swaps it in and restarts in
// seconds, with no installer. When the runtime or libraries change, the full installer is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

export const REPO = 'devyo1/ContentChef';
export const MANIFEST = 'app-update.json';
// What a bundle may contain (relative to the app folder). node_modules is never touched.
export const MANAGED = ['electron', 'src', 'public', 'examples', 'build/icon.png', 'package.json'];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const newer = (a, b) => {
  const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};

/** Identifies the runtime a bundle needs: the Electron version and the declared libraries. */
export function runtimeKey(pkg, electronVersion) {
  const deps = Object.fromEntries(Object.entries(pkg.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  return sha256(JSON.stringify({ electron: String(electronVersion).replace(/^[^\d]*/, ''), deps })).slice(0, 16);
}

const allowed = (rel) => {
  const p = rel.split('\\').join('/');
  if (p.startsWith('/') || p.split('/').some((s) => s === '..' || s === '')) return false;
  return MANAGED.some((m) => p === m || p.startsWith(`${m}/`));
};

/** Build a bundle (gzipped JSON of base64 files) + manifest from an app folder. Used by the release workflow. */
export async function buildBundle(appDir, { version, runtime }) {
  const files = {};
  const walk = async (rel) => {
    const abs = path.join(appDir, rel);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) return;
    if (st.isDirectory()) { for (const e of await fs.readdir(abs)) await walk(path.posix.join(rel, e)); return; }
    if (!rel.endsWith('.map')) files[rel] = (await fs.readFile(abs)).toString('base64');
  };
  for (const m of MANAGED) await walk(m);
  const bundle = gzipSync(Buffer.from(JSON.stringify({ version, files })), { level: 9 });
  const name = `Content-Chef-${version}-app.json.gz`;
  return { bundle, name, manifest: { version, runtime, bundle: name, sha256: sha256(bundle), size: bundle.length, files: Object.keys(files).length } };
}

/**
 * Is a quick update available? Looks at the latest published release; returns
 * { version, url, sha256, size } when its bundle is newer and fits this runtime, else null.
 */
export async function findQuickUpdate({ currentVersion, runtime, fetchImpl = fetch, repo = REPO, feed }) {
  // feed: another "latest release" address (CONTENT_CHEF_UPDATE_FEED), for testing a release before publishing it.
  const res = await fetchImpl(feed || `https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'content-chef' } });
  if (!res.ok) return null;
  const rel = await res.json();
  const asset = (n) => rel.assets?.find((a) => a.name === n);
  const m = asset(MANIFEST);
  if (!m) return null;
  const manifest = await (await fetchImpl(m.browser_download_url, { headers: { 'user-agent': 'content-chef' } })).json();
  if (!newer(manifest.version, currentVersion) || manifest.runtime !== runtime) return null;
  const b = asset(manifest.bundle);
  return b ? { version: manifest.version, url: b.browser_download_url, sha256: manifest.sha256, size: manifest.size } : null;
}

/** Download and verify a bundle, and stage its files in `stageDir` (ready to apply). */
export async function stageQuickUpdate(update, stageDir, { fetchImpl = fetch, onProgress = () => {} } = {}) {
  const res = await fetchImpl(update.url, { headers: { 'user-agent': 'content-chef' } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const chunks = []; let got = 0;
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(Buffer.from(value)); got += value.length; onProgress(Math.min(99, (got / (update.size || got)) * 100)); }
  } else chunks.push(Buffer.from(await res.arrayBuffer()));
  const buf = Buffer.concat(chunks);
  if (sha256(buf) !== update.sha256) throw new Error('The update download was damaged. Try again.');
  const { version, files } = JSON.parse(gunzipSync(buf).toString('utf8'));
  if (version !== update.version || !files?.['package.json']) throw new Error('The update bundle is incomplete.');
  await fs.rm(stageDir, { recursive: true, force: true });
  for (const [rel, b64] of Object.entries(files)) {
    if (!allowed(rel)) throw new Error(`Unexpected file in update: ${rel}`);
    const out = path.join(stageDir, rel);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, Buffer.from(b64, 'base64'));
  }
  await fs.writeFile(path.join(stageDir, '.ready'), JSON.stringify({ version, files: Object.keys(files) }));
  onProgress(100);
  return { version };
}

const listFiles = async (root, rel = '') => {
  const out = [];
  for (const e of await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => [])) {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) out.push(...await listFiles(root, r)); else out.push(r);
  }
  return out;
};

/**
 * Swap the staged code into the app folder. Everything it replaces or removes is backed up first
 * and restored if anything fails, so a half-applied update can't leave the app broken.
 */
export async function applyQuickUpdate(stageDir, appDir, backupDir) {
  const ready = JSON.parse(await fs.readFile(path.join(stageDir, '.ready'), 'utf8'));
  const incoming = new Set(ready.files);
  const current = (await Promise.all(MANAGED.map(async (m) => {
    const st = await fs.stat(path.join(appDir, m)).catch(() => null);
    if (!st) return [];
    return st.isDirectory() ? (await listFiles(path.join(appDir, m))).map((f) => `${m}/${f}`) : [m];
  }))).flat();
  await fs.rm(backupDir, { recursive: true, force: true });
  const touched = [...new Set([...current, ...incoming])];
  const existed = new Set(current);
  for (const rel of current) {
    await fs.mkdir(path.dirname(path.join(backupDir, rel)), { recursive: true });
    await fs.copyFile(path.join(appDir, rel), path.join(backupDir, rel));
  }
  try {
    for (const rel of incoming) {
      await fs.mkdir(path.dirname(path.join(appDir, rel)), { recursive: true });
      await fs.copyFile(path.join(stageDir, rel), path.join(appDir, rel));
    }
    for (const rel of current) if (!incoming.has(rel)) await fs.rm(path.join(appDir, rel), { force: true });
  } catch (e) {
    for (const rel of touched) {
      if (existed.has(rel)) await fs.copyFile(path.join(backupDir, rel), path.join(appDir, rel)).catch(() => {});
      else await fs.rm(path.join(appDir, rel), { force: true }).catch(() => {});
    }
    throw new Error(`Could not apply the update (${e.message}). Nothing was changed.`);
  }
  await fs.rm(stageDir, { recursive: true, force: true });
  return { version: ready.version };
}

/** Can this install update itself in place? (Not for read-only installs such as AppImage.) */
export async function canQuickUpdate(appDir) {
  try { await fs.access(path.join(appDir, 'package.json'), fs.constants.W_OK); return !process.env.APPIMAGE; } catch { return false; }
}
