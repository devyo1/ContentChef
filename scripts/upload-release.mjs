#!/usr/bin/env node
// Attaches every file in a folder to this version's GitHub release, creating it as a draft if it
// doesn't exist yet. Run once, after all platforms have built, so a draft never shows up half-empty.
// Files already on the release are replaced. Usage: GH_TOKEN=… node scripts/upload-release.mjs <dir>
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO } from '../electron/quick-update.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(process.argv[2] ?? 'release-assets');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const tag = `v${version}`;
const token = process.env.GH_TOKEN;
if (!token) throw new Error('GH_TOKEN is required');
const gh = async (url, init = {}) => {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com/repos/${REPO}${url}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'content-chef-release', ...init.headers } });
  if (!res.ok && res.status !== 404) throw new Error(`${init.method ?? 'GET'} ${url}: ${res.status} ${await res.text()}`);
  return res;
};

// Drafts can't be fetched by tag, so look through the recent releases.
let release = (await (await gh('/releases?per_page=50')).json()).find((r) => r.tag_name === tag);
if (!release) {
  release = await (await gh('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, name: version, draft: true }), headers: { 'content-type': 'application/json' } })).json();
  console.log(`Created draft release ${tag}`);
}
const files = (await fs.readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => path.join(e.parentPath ?? e.path, e.name));
const TYPES = { '.yml': 'text/yaml', '.json': 'application/json', '.gz': 'application/gzip', '.exe': 'application/vnd.microsoft.portable-executable', '.dmg': 'application/x-apple-diskimage', '.zip': 'application/zip' };
for (const file of files) {
  const name = path.basename(file);
  const old = release.assets?.find((a) => a.name === name);
  if (old) await gh(`/releases/assets/${old.id}`, { method: 'DELETE' });
  const body = await fs.readFile(file);
  await gh(release.upload_url.replace(/\{.*\}$/, `?name=${encodeURIComponent(name)}`), { method: 'POST', body, headers: { 'content-type': TYPES[path.extname(name)] ?? 'application/octet-stream' } });
  console.log(`Uploaded ${name} (${(body.length / 1048576).toFixed(1)} MB)`);
}
console.log(`${files.length} files on ${tag}${release.draft ? ' (draft: review and publish it)' : ''}`);
