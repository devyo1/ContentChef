import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A separate process/test file keeps all disk writes out of the user's real settings.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'content-chef-settings-test-'));
process.env.CONTENT_CHEF_HOME = home;
const { getSettings, saveSettings, publicSettings, normalizeSettings } = await import('../src/core/settings.js');
after(() => fs.rm(home, { recursive: true, force: true }));

test('fresh installs use Codex; existing Claude connections retain their provider and key', () => {
  assert.equal(normalizeSettings().assistant.provider, 'codex');
  for (const provider of ['api', 'claude-code']) {
    const result = normalizeSettings({ claude: { provider, apiKey: 'test-only' } });
    assert.equal(result.assistant.provider, provider);
    assert.equal(result.claude.apiKey, 'test-only');
  }
});

test('provider switches preserve other settings and never expose the stored API key', async () => {
  await saveSettings({ theme: 'dark', claude: { apiKey: 'test-only', model: 'old-model' }, assistant: { provider: 'api' } });
  await saveSettings({ assistant: { provider: 'codex' }, codex: { model: ' custom-model ' } });
  await saveSettings({ codex: { codePath: ' C:\\Program Files\\Codex\\codex.exe ' } });
  const saved = await getSettings();
  assert.equal(saved.theme, 'dark');
  assert.equal(saved.assistant.provider, 'codex');
  assert.equal(saved.codex.model, 'custom-model');
  assert.equal(saved.codex.codePath, 'C:\\Program Files\\Codex\\codex.exe');
  assert.equal(saved.claude.apiKey, 'test-only');
  const view = publicSettings(saved);
  assert.equal(view.claude.apiKey, undefined);
  assert.equal(view.claude.hasApiKey, true);
  assert.ok(!JSON.stringify(view).includes('test-only'));
  await assert.rejects(saveSettings({ assistant: { provider: 'unknown' } }), /Unknown assistant/);
  await assert.rejects(saveSettings({ codex: { model: {} } }), /must be text/);
  assert.equal((await getSettings()).codex.model, 'custom-model');
});
