#!/usr/bin/env node
import path from 'node:path';
import {
  renderCatalog, generate, listBrands, listCatalogs, describeTemplates, FORMATS, FORMAT_GROUPS, closeBrowser, ROOT, ensureWorkspace,
} from './core/index.js';

ensureWorkspace();

const HELP = `
content-chef — brand-aware content generator

  content-chef render <catalog> [--only id,id] [--scale 2] [--jpg]
      Render a catalog (name in catalog/ or path to a .json file).

  content-chef quick --brand <id> --headline "..." [--subhead ..] [--cta ..] [--eyebrow ..]
              [--offer ..] [--background assets/x.jpg] [--templates a,b] [--palettes a,b]
              [--formats social|all|ig-square,story] [--campaign name] [--scale 2] [--jpg]
      Render a one-off ad without a catalog.

  content-chef brands | templates | formats | catalogs
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

function progress(label) {
  return (...a) => {
    const [id, done, total, job] = a.length === 4 ? a : [label, ...a];
    process.stdout.write(`\r  ${id}: ${done}/${total}  ${job.file}`.padEnd(100));
    if (done === total) process.stdout.write('\n');
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, target] = args._;
  const renderOpts = {
    scale: args.scale ? Number(args.scale) : undefined,
    type: args.jpg ? 'jpeg' : 'png',
  };

  switch (cmd) {
    case 'render': {
      if (!target) throw new Error('Usage: content-chef render <catalog>');
      const t0 = Date.now();
      const manifests = await renderCatalog(target, { only: list(args.only), ...renderOpts, onProgress: progress() });
      const n = manifests.reduce((s, m) => s + m.files.length, 0);
      console.log(`\n✓ ${n} images in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      for (const m of manifests) console.log(`  ${path.relative(ROOT, m.dir)}`);
      break;
    }
    case 'quick': {
      if (!args.brand || !args.headline) throw new Error('quick needs --brand and --headline');
      const content = {};
      for (const k of ['eyebrow', 'headline', 'subhead', 'cta', 'offer', 'background', 'footnote', 'attribution', 'align']) {
        if (typeof args[k] === 'string') content[k] = args[k];
      }
      const m = await generate({
        brand: args.brand, campaign: args.campaign ?? 'quick', content,
        templates: list(args.templates), palettes: list(args.palettes), formats: list(args.formats),
        ...renderOpts, onProgress: progress(args.brand),
      });
      console.log(`✓ ${m.files.length} images → ${path.relative(ROOT, m.dir)}`);
      break;
    }
    case 'brands':
      for (const b of await listBrands()) console.log(`${b.id.padEnd(22)} ${b.name}  [palettes: ${Object.keys(b.palettes).join(', ')}]`);
      break;
    case 'templates':
      for (const t of describeTemplates()) console.log(`${t.id.padEnd(10)} ${t.description}`);
      break;
    case 'formats':
      for (const [id, f] of Object.entries(FORMATS)) console.log(`${id.padEnd(14)} ${`${f.width}×${f.height}`.padEnd(11)} ${f.label}`);
      console.log(`\nGroups: ${Object.entries(FORMAT_GROUPS).map(([g, v]) => `${g} (${v.length})`).join(', ')}`);
      break;
    case 'catalogs':
      for (const c of await listCatalogs()) console.log(`${c.name.padEnd(24)} ${c.brand ?? ''} / ${c.campaign ?? ''}  (${c.items?.length ?? 0} items)`);
      break;
    default:
      console.log(HELP);
  }
}

main()
  .catch((e) => { console.error(`\n✗ ${e.message}`); process.exitCode = 1; })
  .finally(closeBrowser);
