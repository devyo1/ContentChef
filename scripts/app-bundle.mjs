#!/usr/bin/env node
// Builds the quick-update bundle (just Content Chef's own code) for this version and, with
// --upload, attaches it to the version's GitHub release (draft or published) next to the installers.
// Installs on the same Electron + libraries download this instead of the full installer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, runtimeKey, MANIFEST, REPO } from '../electron/quick-update.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const electron = JSON.parse(await fs.readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const { bundle, name, manifest } = await buildBundle(root, { version: pkg.version, runtime: runtimeKey(pkg, electron) });
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
await fs.writeFile(path.join(root, 'dist', name), bundle);
await fs.writeFile(path.join(root, 'dist', MANIFEST), JSON.stringify(manifest, null, 2));
console.log(`Quick-update bundle: ${name} (${(bundle.length / 1024).toFixed(0)} KB, ${manifest.files} files, runtime ${manifest.runtime})`);

if (process.argv.includes('--upload')) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required to upload');
  const gh = (url, init = {}) => fetch(url.startsWith('http') ? url : `https://api.github.com/repos/${REPO}${url}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'content-chef-release', ...init.headers } });
  // Drafts aren't found by tag, so look through the recent releases.
  const tag = `v${pkg.version}`;
  let release;
  for (let i = 0; i < 20 && !release; i++) {
    release = (await (await gh('/releases?per_page=30')).json()).find((r) => r.tag_name === tag);
    if (!release) await new Promise((r) => setTimeout(r, 15_000)); // another job may still be creating it
  }
  if (!release) throw new Error(`No release for ${tag}`);
  for (const [file, type] of [[name, 'application/gzip'], [MANIFEST, 'application/json']]) {
    const old = release.assets.find((a) => a.name === file);
    if (old) await gh(`/releases/assets/${old.id}`, { method: 'DELETE' });
    const body = await fs.readFile(path.join(root, 'dist', file));
    const res = await gh(release.upload_url.replace(/\{.*\}$/, `?name=${encodeURIComponent(file)}`), { method: 'POST', body, headers: { 'content-type': type } });
    if (!res.ok) throw new Error(`Upload of ${file} failed: ${res.status} ${await res.text()}`);
    console.log(`Uploaded ${file} to ${tag}`);
  }
}
