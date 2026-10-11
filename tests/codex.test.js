import test from 'node:test';
import assert from 'node:assert/strict';
import { codexArgs, codexEventHandler, runCodexProcess, findCodex, codexErrorMessage, codexEnv } from '../src/codex.js';
import { assistantName, assistantReady, assistantProvider } from '../public/js/assistant.js';

const settings = { codex: { model: '', codePath: '' } };

test('Codex chat and resume isolate config while registering only Content Chef', () => {
  for (const session of [undefined, 'test-session']) {
    const args = codexArgs({ settings, session });
    assert.ok(args.includes('--ignore-user-config'));
    assert.ok(args.includes('read-only'));
    assert.ok(args.includes('features.shell_tool=false'));
    assert.ok(args.includes('features.apps=false'));
    assert.ok(args.includes('forced_login_method="chatgpt"'));
    assert.ok(args.includes('mcp_servers.content-chef.required=true'));
    assert.ok(args.includes('mcp_servers.content-chef.default_tools_approval_mode="approve"'));
    assert.ok(args.includes('mcp_servers.content-chef.env.CONTENT_CHEF_ACTOR="ChatGPT (chat)"'));
    assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
    if (session) assert.deepEqual(args.slice(-3), ['resume', session, '-']);
    const command = args.find((a) => a.startsWith('mcp_servers.content-chef.command='));
    assert.equal(JSON.parse(command.slice(command.indexOf('=') + 1)), process.execPath);
  }
});

test('copywriting is ephemeral, schema-constrained, and has no Content Chef tools', () => {
  const args = codexArgs({ settings, tools: false, schemaFile: 'C:\\copy test\\schema.json' });
  assert.ok(args.includes('--ephemeral'));
  assert.equal(args[args.indexOf('--output-schema') + 1], 'C:\\copy test\\schema.json');
  assert.ok(!args.some((a) => a.startsWith('mcp_servers.')));
});

test('visual brand requests attach screenshots as separate CLI arguments without enabling tools', () => {
  const images = ['C:\\temporary folder\\website-1.jpg', 'C:\\temporary folder\\website-2.png'];
  const args = codexArgs({ settings, tools: false, schemaFile: 'schema.json', images });
  assert.deepEqual(args.filter((_, i) => args[i - 1] === '--image'), images);
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('features.shell_tool=false'));
  assert.ok(!args.some((arg) => arg.startsWith('mcp_servers.')));
});

test('Codex events preserve tool activity, images, failures and assistant replies', () => {
  const emitted = [], sessions = [];
  const events = codexEventHandler({ emit: (e) => emitted.push(e), onSession: (id) => sessions.push(id) });
  events.handle({ type: 'thread.started', thread_id: 'abc' });
  const call = { id: 'tool-1', type: 'mcp_tool_call', server: 'content-chef', tool: 'preview_ad', arguments: {}, status: 'in_progress' };
  events.handle({ type: 'item.started', item: call });
  events.handle({ type: 'item.updated', item: call });
  events.handle({ type: 'item.completed', item: { ...call, status: 'completed', result: { content: [{ type: 'text', text: 'Preview' }, { type: 'image', data: 'YWJj', mimeType: 'image/png' }] } } });
  events.handle({ type: 'item.completed', item: { id: 'text', type: 'agent_message', text: 'Here it is.' } });
  events.handle({ type: 'item.completed', item: { ...call, id: 'tool-2', status: 'failed', error: { message: 'Missing brand' } } });
  events.handle({ type: 'turn.completed' });
  assert.deepEqual(sessions, ['abc']);
  assert.equal(emitted.filter((e) => e.type === 'tool' && e.id === 'tool-1').length, 1);
  assert.deepEqual(emitted[1].images, ['data:image/png;base64,YWJj']);
  assert.equal(emitted[1].ok, true);
  assert.equal(emitted[2].delta, 'Here it is.');
  assert.equal(emitted.at(-1).ok, false);
  assert.equal(emitted.at(-1).summary, 'Missing brand');
  assert.equal(events.completed, true);
  events.handle({ type: 'turn.failed', error: { message: 'Usage limit reached' } });
  assert.equal(events.failure, 'Usage limit reached');
});

test('MCP error results remain errors even if the call completed', () => {
  const emitted = [];
  const events = codexEventHandler({ emit: (e) => emitted.push(e) });
  events.handle({ type: 'item.completed', item: { id: 'x', type: 'mcp_tool_call', tool: 'get_brand', status: 'completed', result: { isError: true, content: [{ type: 'text', text: 'Not found' }] } } });
  assert.equal(emitted.at(-1).ok, false);
});

test('process parser handles split UTF-8, diagnostics and the final unterminated line', async () => {
  const events = [];
  const code = `process.stdout.write('diagnostic\\n'); const b = Buffer.from(JSON.stringify({type:'text',text:'café ☕'})); const i=b.indexOf(Buffer.from('é'))+1; process.stdout.write(b.subarray(0,i)); setTimeout(()=>process.stdout.end(b.subarray(i)),10);`;
  await runCodexProcess({ exe: process.execPath, args: ['-e', code], cwd: process.cwd(), prompt: 'brief', onEvent: (e) => events.push(e) });
  assert.deepEqual(events, [{ type: 'text', text: 'café ☕' }]);
});

test('process startup errors, exit failures, cancellation and timeout reject cleanly', async () => {
  const run = (extra) => runCodexProcess({ exe: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: process.cwd(), prompt: '', onEvent: () => {}, ...extra });
  await assert.rejects(run({ exe: 'content-chef-no-such-codex-executable' }), /Couldn't start Codex/);
  await assert.rejects(run({ args: ['-e', 'process.stderr.write("Test failure");process.exit(7)'] }), /Test failure/);
  await assert.rejects(run({ timeoutMs: 50 }), /timed out/);
  const controller = new AbortController();
  const pending = run({ signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});

test('invalid configured executable does not silently fall back to another installation', () => {
  assert.equal(findCodex('content-chef-no-such-file'), null);
  assert.equal(findCodex(process.execPath), process.execPath);
});

test('Codex child keeps auth location while dropping parent session and API credentials', () => {
  const env = codexEnv({ CODEX_HOME: 'test-auth-location', CODEX_THREAD_ID: 'parent', CODEX_API_KEY: 'test-only', OPENAI_API_KEY: 'test-only', ELECTRON_RUN_AS_NODE: '1' });
  assert.equal(env.CODEX_HOME, 'test-auth-location');
  for (const key of ['CODEX_THREAD_ID', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'ELECTRON_RUN_AS_NODE']) assert.equal(env[key], undefined);
});

test('connection messages and UI readiness are specific to the selected provider', () => {
  assert.match(codexErrorMessage('401 Unauthorized'), /Sign in with ChatGPT/);
  assert.match(codexErrorMessage("unexpected argument '--ignore-user-config' found"), /Update Codex/);
  assert.equal(assistantName({ assistant: { provider: 'codex' } }), 'ChatGPT');
  assert.equal(assistantReady({ assistant: { provider: 'codex' }, claudeCode: { loggedIn: true } }), false);
  assert.equal(assistantReady({ assistant: { provider: 'codex' }, codexStatus: { loggedIn: true } }), true);
  assert.equal(assistantProvider({ claude: { provider: 'api' } }), 'api');
  assert.equal(assistantName({ assistant: { provider: 'api' } }), 'Claude');
  assert.equal(assistantReady({ assistant: { provider: 'api' }, claude: { hasApiKey: true } }), true);
});
