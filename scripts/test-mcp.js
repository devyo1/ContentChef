// Smoke test: start the MCP server over stdio and drive it like an LLM client would.
// Usage: node scripts/test-mcp.js [outdir]   (images returned by tools are saved there)
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const out = process.argv[2] ?? '.';
const client = new Client({ name: 'smoke-test', version: '0.0.1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/mcp.js'] }));
const { tools } = await client.listTools();
console.log(`${tools.length} tools:`, tools.map((t) => t.name).join(', '));

const call = async (label, name, args = {}) => {
  const t0 = Date.now();
  const r = await client.callTool({ name, arguments: args });
  for (const c of r.content) {
    if (c.type === 'text') console.log(`[${label}${r.isError ? ' ERROR' : ''}] ${c.text.replace(/\s+/g, ' ').slice(0, 220)}`);
    else { const f = `${out}/${label}.jpg`; fs.writeFileSync(f, Buffer.from(c.data, 'base64')); console.log(`[${label}] image → ${f}`); }
  }
  console.log(`   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

await call('get_editor', 'get_editor');
await call('update_editor', 'update_editor', {
  mode: 'single',
  content: { eyebrow: 'Made by Claude', headline: 'Hello from *Claude*.', subhead: 'This design was changed over MCP.', cta: 'Nice' },
  templates: ['glass', 'headline'], formats: ['ig-square', 'story'], focus: { template: 'glass', format: 'ig-square' },
});
await call('palettes', 'generate_palettes', { count: 2, mood: 'pastel' });
await call('bad_palette', 'update_editor', { palettes: ['does-not-exist'], show: false });
await client.close();
