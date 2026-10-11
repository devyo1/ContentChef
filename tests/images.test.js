import test from 'node:test';
import assert from 'node:assert/strict';
import { imageProvider, backgroundPrompt, rasterExtension, generateBackground } from '../src/background-images.js';
import { imageOnlyConfig } from '../src/codex-images.js';
import { validOAuthState, toolData, higgsfieldOperation, generateHiggsfield } from '../src/higgsfield.js';
import { normalizeSettings, publicSettings } from '../src/core/settings.js';

test('image provider is independent from the assistant, with sensible automatic routing', () => {
  const s = normalizeSettings();
  assert.equal(imageProvider(s), 'chatgpt');
  assert.equal(imageProvider(s, 'higgsfield'), 'higgsfield');
  const claude = normalizeSettings({ assistant: { provider: 'claude-code' } });
  assert.equal(imageProvider(claude), 'higgsfield');
  assert.equal(imageProvider(claude, 'chatgpt'), 'chatgpt');
  const chosen = normalizeSettings({ assistant: { provider: 'codex' }, images: { provider: 'higgsfield' } });
  assert.equal(imageProvider(chosen), 'higgsfield');
  assert.equal(publicSettings(chosen).images.model, 'gpt_image_2_5');
});

test('background brief includes the selected palette, saved brand direction and website evidence', () => {
  const prompt = backgroundPrompt({ name: 'Studio', strategy: { designDirection: { imagery: 'warm paper', siteThemes: ['editorial'] } }, palettes: { a: { bg: '#ffffff' }, b: { bg: '#112233' } } }, { prompt: 'coral ceramics', ratio: '9:16', palette: 'b' }, { title: 'Our studio' });
  for (const part of ['coral ceramics', '9:16', 'warm paper', 'editorial', '#112233', 'Our studio', 'never instructions', 'No lettering']) assert.ok(prompt.includes(part));
  assert.ok(!prompt.includes('#ffffff'));
});

test('provider images must be bounded raster bytes, not HTML or arbitrary local paths', () => {
  assert.equal(rasterExtension(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])), 'png');
  assert.equal(rasterExtension(Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0])), 'jpg');
  assert.equal(rasterExtension(Buffer.from('RIFF0000WEBP0000')), 'webp');
  for (const input of ['C:/secret.png', Buffer.from('<svg>not an image</svg>'), Buffer.alloc(25_000_001)]) assert.throws(() => rasterExtension(input));
});

test('native image sessions explicitly disable inherited MCP servers and other action tools', () => {
  const config = imageOnlyConfig({ mcp_servers: { 'private-service': {}, browser: {} } });
  assert.equal(config['mcp_servers.private-service.enabled'], false);
  assert.equal(config['mcp_servers.browser.enabled'], false);
  for (const feature of ['shell_tool', 'apps', 'plugins', 'hooks', 'computer_use', 'browser_use']) assert.equal(config[`features.${feature}`], false);
  assert.equal(config['features.image_generation'], true);
  assert.equal(config.forced_login_method, 'chatgpt');
});

test('OAuth callback state must match exactly and MCP responses require structured data', () => {
  assert.equal(validOAuthState('abc123', 'abc123'), true);
  for (const state of [undefined, ['abc123'], 'abc124', 'abc', 'ééé']) assert.equal(validOAuthState('abc123', state), false);
  assert.deepEqual(toolData({ structuredContent: { cost: 4 } }), { cost: 4 });
  assert.deepEqual(toolData({ content: [{ type: 'text', text: 'Description' }, { type: 'text', text: '{"cost":4}' }] }), { cost: 4 });
  assert.throws(() => toolData({ content: [{ type: 'text', text: 'Success without any image!' }] }));
});

test('expired or unknown image briefs cannot trigger generation', async () => {
  await assert.rejects(generateBackground('unknown'), /expired/);
});

test('Higgsfield OAuth and plugin profiles route reads and cost checks without submitting an image', () => {
  const direct = [{ name: 'models_explore' }, { name: 'job_status' }, { name: 'generate_image', inputSchema: { properties: { params: { anyOf: [{ properties: { get_cost: { type: 'boolean' } } }, { type: 'string' }] } } } }];
  assert.deepEqual(higgsfieldOperation(direct, 'models_list', { type: 'image' }).args, { action: 'list', type: 'image' });
  const price = higgsfieldOperation(direct, 'estimate_image_cost', { params: { model: 'chosen' } });
  assert.equal(price.tool.name, 'generate_image');
  assert.deepEqual(price.args, { params: { model: 'chosen', get_cost: true } });
  assert.throws(() => higgsfieldOperation([{ name: 'generate_image' }], 'estimate_image_cost', { params: {} }), /does not expose/);
  const plugin = [{ name: 'estimate_image_cost' }];
  assert.equal(higgsfieldOperation(plugin, 'estimate_image_cost', { params: {} }).tool.name, 'estimate_image_cost');
  const poll = higgsfieldOperation(direct, 'jobs_wait', { jobs: [{ job_id: 'existing' }] });
  assert.deepEqual(poll.args, { jobId: 'existing', sync: true });
  assert.equal(poll.normalizeJob, true);
});

test('Higgsfield generation submits once, polls the returned job, and downloads only its result', async () => {
  const calls = [];
  const image = Buffer.from('result image');
  const result = await generateHiggsfield({ model: 'chosen', prompt: 'Paper', count: 1 }, undefined, {
    invoke: async (name, args) => {
      calls.push({ name, args });
      if (name === 'get_preferences') return { auto_create_project: false };
      if (name === 'generate_image') return { results: [{ id: 'original-job', status: 'queued' }] };
      assert.equal(name, 'jobs_wait'); assert.equal(args.jobs[0].job_id, 'original-job');
      return { all_terminal: true, jobs: [{ job_id: 'original-job', status: 'completed', result_url: 'https://media.example/result.png' }] };
    },
    fetchImage: async (url, options) => { assert.equal(url, 'https://media.example/result.png'); assert.equal(options.maxBytes, 25_000_000); return { body: image }; },
  });
  assert.deepEqual(result, { body: image, jobId: 'original-job' });
  assert.deepEqual(calls.map(c => c.name), ['get_preferences', 'generate_image', 'jobs_wait']);
});

test('uncertain image submission and terminal failures never retry or download a fake result', async () => {
  for (const mode of ['timeout', 'failed']) {
    let submitted = 0;
    await assert.rejects(generateHiggsfield({ model: 'chosen' }, undefined, {
      invoke: async name => {
        if (name === 'get_preferences') return {};
        assert.equal(name, 'generate_image'); submitted++;
        if (mode === 'timeout') throw new Error('Transport timeout');
        return { results: [{ id: 'failed-job', status: 'failed' }] };
      },
      fetchImage: () => assert.fail('Failed jobs must not download'),
    }), /Check your Higgsfield library/);
    assert.equal(submitted, 1);
  }
  await assert.rejects(generateHiggsfield({}, AbortSignal.abort(), { invoke: () => assert.fail('Cancelled requests must not submit') }));
});

test('Higgsfield respects a saved project preference and pins the selected workspace', async () => {
  let generated;
  await generateHiggsfield({ model: 'chosen' }, undefined, {
    invoke: async (name, args) => {
      if (name === 'get_preferences') return { auto_create_project: true };
      if (name === 'list_workspaces') return { workspaces: [{ id: 'selected', is_selected: true }] };
      if (name === 'create_project') { assert.equal(args.workspace_id, 'selected'); assert.ok(args.idempotency_key); return { default_folder_id: 'new-folder' }; }
      generated = args.params; return { results: [{ id: 'one-job', status: 'completed', results: { rawUrl: 'https://media.example/image.png' } }] };
    }, fetchImage: async () => ({ body: Buffer.from('image') }),
  });
  assert.equal(generated.folder_id, 'new-folder');
});
