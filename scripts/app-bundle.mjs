#!/usr/bin/env node
// Builds the quick-update bundle (just Content Chef's own code) for this version into dist/;
// the release workflow attaches it to the release next to the installers.
// Installs on the same Electron + libraries download this instead of the full installer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, runtimeKey, MANIFEST } from '../electron/quick-update.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const electron = JSON.parse(await fs.readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const { bundle, name, manifest } = await buildBundle(root, { version: pkg.version, runtime: runtimeKey(pkg, electron) });
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
await fs.writeFile(path.join(root, 'dist', name), bundle);
await fs.writeFile(path.join(root, 'dist', MANIFEST), JSON.stringify(manifest, null, 2));
console.log(`Quick-update bundle: ${name} (${(bundle.length / 1024).toFixed(0)} KB, ${manifest.files} files, runtime ${manifest.runtime})`);

