// ChatGPT account integration through the official Codex CLI. Credentials remain in Codex.
// Each run uses an empty working directory and its own config, sharing only Codex's login.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { mcpLaunch } from './core/launch.js';
import { requestImages } from './ai-images.js';

const SYSTEM = `You are the ChatGPT assistant inside Content Chef, a studio for on-brand social posts and ads. Work through Content Chef's MCP tools. Use get_editor to see the user's current design and update_editor to change it live. Read the tool server's instructions for templates, animation and copy markup. Be brief and concrete. Ask before exporting more than 60 files or overwriting a brand's palettes. Do not use shell commands or edit files directly.`;
const MISSING = 'Codex was not found. Install Codex CLI or set its executable path in Settings → AI assistant.';
const SIGN_IN = 'Sign in with ChatGPT in Settings → AI assistant, then press Check again.';

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** Discover native, npm and desktop installations without invoking a shell. */
export function findCodex(override) {
  if (override) return isFile(override) ? override : null;
  const names = process.platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (dir && isFile(p)) return p;
    }
  }
  const direct = [
    path.join(os.homedir(), '.local', 'bin', names[0]),
    path.join(os.homedir(), '.npm-global', 'bin', names[0]),
    '/Applications/Codex.app/Contents/Resources/codex',
    path.join(os.homedir(), 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
  ];
  if (process.platform === 'win32') {
    direct.push(path.join(process.env.APPDATA ?? '', 'npm', 'codex.cmd'));
    const base = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
    try {
      const dirs = fs.readdirSync(base).sort((a, b) => fs.statSync(path.join(base, b)).mtimeMs - fs.statSync(path.join(base, a)).mtimeMs);
      direct.push(...dirs.map((d) => path.join(base, d, 'codex.exe')));
    } catch { /* desktop not installed */ }
  }
  return direct.find(isFile) ?? null;
}

export function codexEnv(source = process.env) {
  const env = { ...source };
  // Keep CODEX_HOME (including OS keychain auth); don't reuse the parent session or API keys.
  for (const k of Object.keys(env)) {
    if ((k.startsWith('CODEX_') && k !== 'CODEX_HOME') || k === 'OPENAI_API_KEY' || k === 'OPENAI_BASE_URL' || k === 'ELECTRON_RUN_AS_NODE') delete env[k];
  }
  return env;
}

export function codexCommand(exe) {
  if (/\.cmd$/i.test(exe)) {
    const script = path.join(path.dirname(exe), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (!isFile(script)) throw new Error('Cannot locate Codex behind this npm launcher. Set the path to codex.exe in Settings.');
    return { exe: process.execPath, prefix: [script], env: { ...codexEnv(), ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } };
  }
  return { exe, prefix: [], env: codexEnv() };
}

const statusCache = new Map();
let login = null;
export async function codexStatus({ fresh = false, override } = {}) {
  const exe = findCodex(override);
  if (!exe) return { installed: false, loggedIn: false };
  const cached = statusCache.get(exe);
  if (!fresh && cached && Date.now() - cached.at < 30000) return { ...cached.value, loginPending: !!login };
  let cmd;
  try { cmd = codexCommand(exe); }
  catch (err) { return { installed: true, path: exe, loggedIn: false, error: err.message }; }
  const value = await new Promise((resolve) => {
    execFile(cmd.exe, [...cmd.prefix, 'login', 'status'], { env: cmd.env, timeout: 20000, windowsHide: true }, (err, stdout, stderr) => {
      const output = `${stdout}\n${stderr}`;
      const loggedIn = !err && /logged in using chatgpt/i.test(output);
      resolve({ installed: true, path: exe, loggedIn,
        ...(!loggedIn ? { error: /api key/i.test(output) ? 'Codex is using an API key. Sign in with ChatGPT to use your plan.' : SIGN_IN } : {}),
      });
    });
  });
  statusCache.set(exe, { at: Date.now(), value });
  return { ...value, loginPending: !!login };
}

/** Codex opens its browser sign-in flow itself. No credentials pass through the editor. */
export async function startCodexLogin(override) {
  if (login) return { ok: true };
  const exe = findCodex(override);
  if (!exe) throw new Error(MISSING);
  const cmd = codexCommand(exe);
  const child = spawn(cmd.exe, [...cmd.prefix, 'login'], { env: cmd.env, windowsHide: true, stdio: 'ignore' });
  login = child;
  statusCache.clear();
  const timer = setTimeout(() => child.kill(), 5 * 60 * 1000);
  timer.unref();
  child.once('close', () => { clearTimeout(timer); login = null; statusCache.clear(); });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  return { ok: true };
}

// JSON strings are TOML basic strings for the paths/values used here. They are passed as
// individual argv entries, never interpolated into shell commands.
export function codexArgs({ settings, session, schemaFile, images = [], instructions = SYSTEM, tools = true }) {
  const args = ['exec', '--json', '--skip-git-repo-check', '--ignore-user-config', '--color', 'never', '--sandbox', 'read-only'];
  const config = {
    approval_policy: 'never', forced_login_method: 'chatgpt', web_search: 'disabled',
    developer_instructions: instructions, project_doc_max_bytes: 0,
    'features.shell_tool': false, 'features.apps': false, 'features.plugins': false,
    'features.multi_agent': false, 'features.hooks': false,
    'features.browser_use': false, 'features.computer_use': false,
    // Images go through Content Chef's background tools so they are saved to brand assets.
    'features.image_generation': false,
  };
  if (tools) {
    const mcp = mcpLaunch();
    config['mcp_servers.content-chef.command'] = mcp.command;
    config['mcp_servers.content-chef.args'] = mcp.args;
    for (const [k, v] of Object.entries(mcp.env)) config[`mcp_servers.content-chef.env.${k}`] = v;
    config['mcp_servers.content-chef.env.CONTENT_CHEF_ACTOR'] = 'ChatGPT (chat)';
    config['mcp_servers.content-chef.required'] = true;
    // The in-app assistant is authorized to use this app's tools, as with Claude Code.
    config['mcp_servers.content-chef.default_tools_approval_mode'] = 'approve';
    config['mcp_servers.content-chef.tool_timeout_sec'] = 600;
  }
  for (const [k, v] of Object.entries(config)) args.push('-c', `${k}=${JSON.stringify(v)}`);
  if (settings.codex.model) args.push('--model', settings.codex.model);
  if (schemaFile) args.push('--output-schema', schemaFile, '--ephemeral');
  for (const image of images) args.push('--image', image);
  if (session) args.push('resume', session);
  args.push('-');
  return args;
}

/** Adapt Codex JSONL items to the editor's text / tool / tool_result stream. */
export function codexEventHandler({ emit, onSession = () => {} }) {
  const started = new Set();
  let failure = null;
  let completed = false;
  const handle = (e) => {
    if (e.type === 'thread.started') onSession(e.thread_id);
    if (e.type === 'turn.completed') completed = true;
    if (e.type === 'turn.failed' || e.type === 'error') failure = e.error?.message ?? e.message ?? 'Codex could not complete the request.';
    const item = e.item;
    if (!item) return;
    if (e.type === 'item.completed' && item.type === 'agent_message') emit({ type: 'text', delta: item.text ?? '' });
    if (item.type !== 'mcp_tool_call') return;
    if (!started.has(item.id)) {
      started.add(item.id);
      emit({ type: 'tool', id: item.id, name: item.tool, input: item.arguments });
    }
    if (e.type !== 'item.completed') return;
    const result = item.result ?? {};
    const content = result.content ?? [];
    emit({ type: 'tool_result', id: item.id, name: item.tool,
      ok: item.status !== 'failed' && !item.error && !result.isError,
      summary: (item.error?.message ?? content.find((c) => c.type === 'text')?.text ?? '').slice(0, 280),
      images: content.filter((c) => c.type === 'image' && c.data).map((c) => `data:${c.mimeType};base64,${c.data}`),
    });
  };
  return { handle, get failure() { return failure; }, get completed() { return completed; } };
}

export function codexErrorMessage(message) {
  if (/unexpected argument.*ignore-user-config|unknown.*ignore-user-config/i.test(message)) return 'Update Codex CLI to use the ChatGPT connection (this integration requires --ignore-user-config).';
  if (/not logged in|authentication|unauthorized|401|refresh token|login required/i.test(message)) return SIGN_IN;
  return message;
}

/** Run one CLI process with bounded lifetime and streaming UTF-8 JSONL parsing. */
export async function runCodexProcess({ exe, args, cwd, prompt, onEvent, signal, timeoutMs = 10 * 60 * 1000 }) {
  const cmd = codexCommand(exe);
  const child = spawn(cmd.exe, [...cmd.prefix, ...args], { cwd, env: cmd.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', buffer = '', stopped = '';
  const stop = (reason) => { stopped = reason; child.kill(); };
  const abort = () => stop('Request cancelled.');
  const timer = setTimeout(() => stop('Codex timed out. Try a smaller request.'), timeoutMs);
  const line = (s) => {
    let event;
    try { event = JSON.parse(s); } catch { return; } // tolerate CLI diagnostics
    onEvent(event);
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) { line(buffer.slice(0, nl)); buffer = buffer.slice(nl + 1); }
  });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  child.stdin.on('error', () => {}); // Early startup failures also close stdin; report exit below.
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', (err) => reject(new Error(`Couldn't start Codex: ${err.message}`)));
      child.once('close', resolve);
      child.stdin.end(prompt);
    });
    if (buffer.trim()) line(buffer);
    if (stopped) throw new Error(stopped);
    if (code !== 0) throw new Error(codexErrorMessage(stderr.trim() || `Codex exited (${code}).`));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

const sessions = new Map();
const active = new Set();
export function resetCodexChat(id) { sessions.delete(id); }

async function withCodex(settings, work) {
  const status = await codexStatus({ override: settings.codex.codePath });
  if (!status.installed) throw new Error(MISSING);
  if (!status.loggedIn) throw new Error(status.error || SIGN_IN);
  const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), 'content-chef-codex-'));
  try { return await work(status.path, cwd); }
  finally { await fsp.rm(cwd, { recursive: true, force: true }); }
}

export async function runCodexChat({ conversationId, text, emit, settings, signal }) {
  if (typeof conversationId !== 'string' || !conversationId || typeof text !== 'string' || !text.trim()) throw new Error('A conversation and message are required.');
  if (active.has(conversationId)) throw new Error('This conversation is still working. Wait for its reply.');
  active.add(conversationId);
  let session;
  const events = codexEventHandler({ emit, onSession: (id) => { session = id; } });
  try {
    await withCodex(settings, (exe, cwd) => runCodexProcess({ exe, cwd, prompt: text, signal,
      args: codexArgs({ settings, session: sessions.get(conversationId) }), onEvent: events.handle,
    }));
    if (events.failure) throw new Error(codexErrorMessage(events.failure));
    if (!events.completed) throw new Error('Codex stopped before completing the reply. Try again.');
    if (session) sessions.set(conversationId, session);
    emit({ type: 'done' });
  } finally { active.delete(conversationId); }
}

export async function writeWithCodex(settings, req) {
  const shots = requestImages(req.images);
  return withCodex(settings, async (exe, cwd) => {
    const schemaFile = path.join(cwd, 'schema.json');
    await fsp.writeFile(schemaFile, JSON.stringify(req.schema));
    const images = [];
    for (const [index, shot] of shots.entries()) {
      const file = path.join(cwd, `website-${index + 1}.${shot.type === 'image/png' ? 'png' : 'jpg'}`);
      await fsp.writeFile(file, shot.body);
      images.push(file);
    }
    let reply = '';
    const events = codexEventHandler({ emit: (e) => { if (e.type === 'text') reply = e.delta; } });
    await runCodexProcess({ exe, cwd, signal: req.signal,
      args: codexArgs({ settings, schemaFile, images, tools: false,
        instructions: req.system || 'You are the copywriter inside Content Chef. Write only the requested copy as JSON matching the supplied schema. Do not use tools or change any design.' }),
      prompt: req.text, onEvent: events.handle,
    });
    if (events.failure) throw new Error(codexErrorMessage(events.failure));
    if (!events.completed) throw new Error('Codex stopped before completing the copy. Try again.');
    try {
      const out = JSON.parse(reply);
      if (!out || typeof out !== 'object' || Array.isArray(out)) throw new Error('Expected an object');
      return out;
    } catch { throw new Error('ChatGPT did not return usable copy. Try again.'); }
  });
}
