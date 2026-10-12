import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { runtimeKey, buildBundle, findQuickUpdate, stageQuickUpdate, applyQuickUpdate } from '../electron/quick-update.js';
import { createUpdater } from '../electron/updater.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'cc-quick-'));
const write = async (root, rel, text) => { await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true }); await fs.writeFile(path.join(root, rel), text); };
const read = (root, rel) => fs.readFile(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.access(path.join(root, rel)).then(() => true, () => false);

async function fakeRelease({ version, runtime, files }) {
  const src = await tmp();
  for (const [rel, text] of Object.entries(files)) await write(src, rel, text);
  const { bundle, name, manifest } = await buildBundle(src, { version, runtime });
  const urls = { manifest: 'https://dl/app-update.json', bundle: `https://dl/${name}` };
  const fetchImpl = async (url) => {
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify({ assets: [{ name: 'app-update.json', browser_download_url: urls.manifest }, { name, browser_download_url: urls.bundle }] }));
    if (url === urls.manifest) return new Response(JSON.stringify(manifest));
    if (url === urls.bundle) return new Response(bundle);
    return new Response('', { status: 404 });
  };
  return { fetchImpl, manifest };
}

test('runtimeKey changes with Electron or the libraries, not with the order they are listed', () => {
  const a = runtimeKey({ dependencies: { express: '^4', zod: '^3' } }, '44.7.0');
  assert.equal(a, runtimeKey({ dependencies: { zod: '^3', express: '^4' } }, 'v44.7.0'));
  assert.notEqual(a, runtimeKey({ dependencies: { express: '^5', zod: '^3' } }, '44.7.0'));
  assert.notEqual(a, runtimeKey({ dependencies: { express: '^4', zod: '^3' } }, '45.0.0'));
});

test('a quick update is offered only when newer and built for this runtime', async () => {
  const files = { 'package.json': '{"version":"0.4.0"}', 'src/a.js': 'new' };
  const { fetchImpl } = await fakeRelease({ version: '0.4.0', runtime: 'r1', files });
  assert.equal((await findQuickUpdate({ currentVersion: '0.3.3', runtime: 'r1', fetchImpl })).version, '0.4.0');
  assert.equal(await findQuickUpdate({ currentVersion: '0.3.3', runtime: 'other', fetchImpl }), null); // needs the full installer
  assert.equal(await findQuickUpdate({ currentVersion: '0.4.0', runtime: 'r1', fetchImpl }), null);
  assert.equal(await findQuickUpdate({ currentVersion: '0.10.0', runtime: 'r1', fetchImpl }), null);
});

test('stage + apply swaps the code, removes deleted files and never touches node_modules or user data', async () => {
  const app = await tmp(); const user = await tmp();
  await write(app, 'package.json', '{"version":"0.3.3"}');
  await write(app, 'src/a.js', 'old'); await write(app, 'src/gone.js', 'old');
  await write(app, 'node_modules/x/index.js', 'lib');
  const { fetchImpl } = await fakeRelease({ version: '0.4.0', runtime: 'r', files: { 'package.json': '{"version":"0.4.0"}', 'src/a.js': 'new', 'public/new.css': 'css' } });
  const u = await findQuickUpdate({ currentVersion: '0.3.3', runtime: 'r', fetchImpl });
  const seen = [];
  await stageQuickUpdate(u, path.join(user, 'stage'), { fetchImpl, onProgress: (p) => seen.push(p) });
  assert.equal(seen.at(-1), 100);
  assert.equal(await read(app, 'src/a.js'), 'old'); // nothing changes until applied
  await applyQuickUpdate(path.join(user, 'stage'), app, path.join(user, 'backup'));
  assert.equal(await read(app, 'src/a.js'), 'new');
  assert.equal(await read(app, 'public/new.css'), 'css');
  assert.equal(JSON.parse(await read(app, 'package.json')).version, '0.4.0');
  assert.equal(await exists(app, 'src/gone.js'), false);
  assert.equal(await read(app, 'node_modules/x/index.js'), 'lib');
  assert.equal(await exists(user, 'stage'), false);
});

test('a damaged download or a bundle with unexpected paths is refused', async () => {
  const user = await tmp();
  const { fetchImpl, manifest } = await fakeRelease({ version: '0.4.0', runtime: 'r', files: { 'package.json': '{}' } });
  const u = await findQuickUpdate({ currentVersion: '0.3.0', runtime: 'r', fetchImpl });
  await assert.rejects(stageQuickUpdate({ ...u, sha256: 'bad' }, path.join(user, 's'), { fetchImpl }), /damaged/);
  const evil = gzipSync(Buffer.from(JSON.stringify({ version: '0.4.0', files: { 'package.json': 'e30=', '../outside.js': 'eA==' } })));
  const evilFetch = async () => new Response(evil);
  await assert.rejects(stageQuickUpdate({ version: '0.4.0', url: 'x', sha256: createHash('sha256').update(evil).digest('hex'), size: evil.length }, path.join(user, 's2'), { fetchImpl: evilFetch }), /Unexpected file/);
  assert.equal(manifest.files, 1);
});

test('if applying fails part-way, the previous version is restored', async () => {
  const app = await tmp(); const user = await tmp();
  await write(app, 'package.json', 'v1'); await write(app, 'src/a.js', 'old');
  const stage = path.join(user, 'stage');
  await write(stage, 'package.json', 'v2'); await write(stage, 'src/a.js', 'new');
  await fs.writeFile(path.join(stage, '.ready'), JSON.stringify({ version: '2', files: ['package.json', 'src/a.js', 'src/missing.js'] }));
  await assert.rejects(applyQuickUpdate(stage, app, path.join(user, 'backup')), /Nothing was changed/);
  assert.equal(await read(app, 'package.json'), 'v1');
  assert.equal(await read(app, 'src/a.js'), 'old');
});

test('the launcher prefers a quick update, and falls back to the installer when there is none', async () => {
  const driver = new EventEmitter();
  let fullChecks = 0;
  driver.checkForUpdates = async () => { fullChecks++; driver.emit('update-not-available'); };
  driver.quitAndInstall = () => { throw new Error('installer must not run for a quick update'); };
  const calls = [];
  let offer = { version: '0.4.0' };
  const quick = { find: async () => offer, stage: async (_u, p) => { p(50); calls.push('stage'); }, apply: async () => calls.push('apply'), relaunch: () => calls.push('relaunch') };
  const c = createUpdater({ updater: driver, packaged: true, version: '0.3.3', quick });
  try {
    await c.check();
    assert.deepEqual([c.status().phase, c.status().kind, fullChecks], ['ready', 'quick', 0]);
    assert.equal(c.install(), true);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(calls, ['stage', 'apply', 'relaunch']);
  } finally { c.dispose(); }
  offer = null;
  const c2 = createUpdater({ updater: driver, packaged: true, version: '0.3.3', quick });
  try { await c2.check(); assert.equal(c2.status().phase, 'current'); assert.equal(fullChecks, 1); } finally { c2.dispose(); }
});
