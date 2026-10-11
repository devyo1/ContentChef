import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('ChatGPT MCP edits keep actor, canvas view, activity and explicit export requirements', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'content-chef-mcp-test-'));
  const client = new Client({ name: 'codex', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.resolve(import.meta.dirname, '../src/mcp.js')],
    env: { ...process.env, CONTENT_CHEF_HOME: home, CONTENT_CHEF_ACTOR: 'ChatGPT (chat)' },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const call = (name, args = {}) => client.callTool({ name, arguments: args });
    const json = (result) => JSON.parse(result.content.find((c) => c.type === 'text').text);
    const brands = json(await call('list_brands'));
    assert.ok(brands.length);
    const result = await call('update_editor', {
      brand: brands[0].id, content: { headline: 'Merged editor check' },
      variants: ['Another headline'], view: 'canvas', show: false,
    });
    assert.ok(!result.isError);
    const workspace = JSON.parse(await fs.readFile(path.join(home, 'data/workspace.json'), 'utf8'));
    assert.equal(workspace.source, 'assistant');
    assert.equal(workspace.actor, 'ChatGPT (chat)');
    assert.equal(workspace.view, 'canvas');
    const snapshot = json(await call('get_editor', { image: false }));
    assert.equal(snapshot.lastEditedBy, 'ChatGPT (chat)');
    assert.equal(snapshot.design.content.headline, 'Merged editor check');
    assert.deepEqual(snapshot.design.variants, ['Another headline']);
    const activity = JSON.parse(await fs.readFile(path.join(home, 'data/activity.json'), 'utf8'));
    assert.ok(activity.some((e) => e.tool === 'update_editor' && e.who === 'ChatGPT (chat)' && e.status === 'done'));
    const denied = await call('export_editor', { include_sheet: false });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /confirmed_by_user/);
    const { tools } = await client.listTools();
    for (const name of ['export_editor', 'generate_ads', 'generate_bulk', 'render_catalog']) {
      assert.ok(tools.find((t) => t.name === name).inputSchema.required.includes('confirmed_by_user'));
    }
    assert.deepEqual(await fs.readdir(path.join(home, 'output')), []);
    const emptyCarousel = await call('update_editor', { mode: 'carousel', show: false });
    assert.equal(emptyCarousel.isError, true);
    assert.match(emptyCarousel.content[0].text, /Build or open a carousel/);
    const slides = Array.from({ length: 3 }, (_, i) => ({ id: `slide-${i}`, content: { headline: `Slide ${i + 1}`, cta: i === 2 ? 'Contact us' : '', slideNumber: i + 1, slideCount: 3, slideRole: i === 0 ? 'hook' : i === 2 ? 'cta' : 'story' }, templates: ['headline'], palettes: workspace.design.palettes }));
    const design = { ...workspace.design, mode: 'carousel', slides, slideIndex: 0, content: slides[0].content, templates: slides[0].templates, variants: [] };
    await fs.writeFile(path.join(home, 'data/workspace.json'), JSON.stringify({ ...workspace, design }));
    const updated = await call('update_editor', { focus: { row: 1 }, content: { headline: 'AI changed the selected slide', align: 'center' }, templates: ['insight'], show: false });
    assert.ok(!updated.isError);
    const sequence = json(await call('get_editor', { image: false }));
    assert.equal(sequence.design.mode, 'carousel');
    assert.equal(sequence.design.slideIndex, 1);
    assert.equal(sequence.design.slides[1].content.headline, 'AI changed the selected slide');
    assert.equal(sequence.design.slides[1].templates[0], 'insight');
    assert.deepEqual(sequence.design.slides[0].content, slides[0].content);
    assert.deepEqual(sequence.design.slides[2], slides[2]);
    await call('update_editor', { mode: 'single', content: { headline: 'Separate single ad' }, show: false });
    await call('update_editor', { mode: 'carousel', show: false });
    const reopened = json(await call('get_editor', { image: false }));
    assert.equal(reopened.design.content.headline, 'AI changed the selected slide');
    assert.deepEqual(reopened.design.slides[2], slides[2]);
  } finally {
    await client.close();
    await fs.rm(home, { recursive: true, force: true });
  }
});
