// Chat through Claude Code (your Claude account — no API key). Each message runs the local
// `claude` CLI headlessly with Content Chef's MCP server attached and ONLY Content Chef's tools enabled
// (no shell, no file access). Conversations continue via Claude Code's session ids.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { DATA_DIR, mcpLaunch } from './core/index.js';

const SYSTEM = `You are the assistant built into Content Chef, a tool for making on-brand social ads. You only have Content Chef's tools (prefixed mcp__content-chef__). The user is looking at the Content Chef editor: use get_editor to see what they see and update_editor to change it (their screen updates live). Read the tool server's instructions for templates, animations, effects and copy markup. Be brief: the user sees your tool activity and the images you get back. After a change, say in a sentence or two what you changed and offer one next step. Ask before exporting more than ~60 files or overwriting existing palettes.`;

/** Find the Claude Code executable: settings override, PATH, or the copy bundled with Claude Desktop. */
export function findClaude(override) {
  if (override && fs.existsSync(override)) return override;
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of process.platform === 'win32' ? [exe, 'claude.cmd'] : [exe]) {
      const p = path.join(dir, name);
      if (dir && fs.existsSync(p)) return p;
    }
  }
  for (const bundles of claudeBundleDirs()) {
    // Layouts seen: <version>/claude(.exe) and <version>/<build-id>/claude(.exe). Newest version wins.
    try {
      const versions = fs.readdirSync(bundles).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const v of versions) {
        const dir = path.join(bundles, v);
        if (fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
        for (const sub of fs.readdirSync(dir)) {
          const p = path.join(dir, sub, exe);
          if (fs.existsSync(p)) return p;
        }
      }
    } catch { /* not installed there */ }
  }
  return null;
}

/**
 * Where the Claude desktop app keeps its copy of Claude Code. On Windows the Store/MSIX build
 * of Claude keeps its AppData in a private package folder that other apps (like Content Chef
 * started from the Start menu) can't see through %APPDATA%, so look there directly too.
 */
function claudeBundleDirs() {
  if (process.platform !== 'win32') return [path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code')];
  const dirs = [path.join(process.env.APPDATA ?? '', 'Claude', 'claude-code')];
  const pkgs = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Packages');
  try {
    for (const p of fs.readdirSync(pkgs)) {
      if (/^(Anthropic\.)?Claude_/i.test(p)) dirs.push(path.join(pkgs, p, 'LocalCache', 'Roaming', 'Claude', 'claude-code'));
    }
  } catch { /* no Store apps */ }
  return dirs;
}

/**
 * Environment for the child CLI. If Content Chef itself was launched from inside a Claude Code
 * session, drop that session's variables so the child uses its own login, not the parent's.
 */
export function childEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_AGENT_SDK_VERSION' || k === 'CLAUDE_PID' || k === 'ANTHROPIC_BASE_URL') delete env[k];
  }
  return env;
}

/** Claude Code output that means "you need to (re)sign in": missing login, expired or revoked session. */
export const AUTH_ERROR = /not logged in|\/login|failed to authenticate|oauth|session expired|could not be refreshed|invalid api key|unauthori[sz]ed|\b401\b/i;
export const SIGN_IN_MESSAGE = 'Your Claude sign-in is missing or has expired. Press "Sign in with Claude" (one time, opens your browser), then try again.';

let statusCache = null;
export async function claudeCodeStatus({ fresh = false, override } = {}) {
  if (!fresh && statusCache && Date.now() - statusCache.at < 30000) return statusCache.value;
  const exe = findClaude(override);
  let value;
  if (!exe) value = { installed: false, loggedIn: false };
  else {
    value = await new Promise((resolve) => {
      execFile(exe, ['auth', 'status'], { env: childEnv(), timeout: 20000, windowsHide: true }, (_err, stdout) => {
        try {
          const s = JSON.parse(stdout);
          resolve({ installed: true, path: exe, loggedIn: !!s.loggedIn, authMethod: s.authMethod, email: s.email ?? s.account?.email });
        } catch {
          resolve({ installed: true, path: exe, loggedIn: false, error: 'Could not read Claude Code status' });
        }
      });
    });
  }
  statusCache = { at: Date.now(), value };
  return value;
}

/** Open a terminal window running `claude auth login` (browser sign-in with your Claude account). */
export function startClaudeLogin(override) {
  const exe = findClaude(override);
  if (!exe) throw new Error('Claude Code was not found. Install the Claude desktop app or Claude Code.');
  statusCache = null;
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '"Claude sign-in"', 'cmd', '/k', `"${exe}" auth login`], { env: childEnv(), detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('osascript', ['-e', `tell application "Terminal" to do script "'${exe}' auth login"`], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('x-terminal-emulator', ['-e', exe, 'auth', 'login'], { env: childEnv(), detached: true, stdio: 'ignore' }).unref();
  }
}

function mcpConfigFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, 'mcp-config.json');
  const config = { mcpServers: { 'content-chef': mcpLaunch() } };
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

const sessions = new Map(); // conversationId → Claude Code session id
export function resetClaudeCodeChat(id) { sessions.delete(id); }

const PREFIX = 'mcp__content-chef__';
const short = (name) => (name?.startsWith(PREFIX) ? name.slice(PREFIX.length) : name);

/** Same event protocol as src/chat.js: text / tool / tool_result / error / done. */
export async function runClaudeCodeChat({ conversationId, text, emit, settings }) {
  const exe = findClaude(settings.claude.codePath);
  if (!exe) throw new Error('Claude Code was not found. Install the Claude desktop app (it includes Claude Code), or switch to an API key in Settings.');
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--mcp-config', mcpConfigFile(), '--strict-mcp-config',
    '--tools', '', // no built-in tools (shell, files, web): Content Chef's tools only
    '--allowedTools', 'mcp__content-chef',
    '--append-system-prompt', SYSTEM,
  ];
  if (settings.claude.codeModel) args.push('--model', settings.claude.codeModel);
  const prev = sessions.get(conversationId);
  if (prev) args.push('--resume', prev);

  const child = spawn(exe, args, { cwd: DATA_DIR, env: childEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(text);
  let streamedText = false;
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });

  const handle = (e) => {
    if (e.session_id) sessions.set(conversationId, e.session_id);
    if (e.type === 'stream_event' && e.event?.type === 'content_block_delta' && e.event.delta?.type === 'text_delta') {
      streamedText = true;
      emit({ type: 'text', delta: e.event.delta.text });
    } else if (e.type === 'assistant') {
      for (const b of e.message?.content ?? []) {
        // The CLI's own sign-in errors arrive as assistant text; the result event replaces them with a friendlier error.
        if (b.type === 'text' && !streamedText && !/^(Not logged in|Failed to authenticate|Invalid API key)/i.test(b.text)) emit({ type: 'text', delta: b.text });
        if (b.type === 'tool_use') emit({ type: 'tool', id: b.id, name: short(b.name), input: b.input });
      }
    } else if (e.type === 'user') {
      for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
        if (b.type !== 'tool_result') continue;
        const parts = Array.isArray(b.content) ? b.content : [{ type: 'text', text: String(b.content ?? '') }];
        emit({
          type: 'tool_result', id: b.tool_use_id, ok: !b.is_error,
          summary: (parts.find((p) => p.type === 'text')?.text ?? '').slice(0, 280),
          images: parts.filter((p) => p.type === 'image' && p.source?.data).map((p) => `data:${p.source.media_type};base64,${p.source.data}`),
        });
      }
    } else if (e.type === 'result' && e.is_error) {
      const msg = String(e.result ?? e.subtype ?? 'Claude Code reported an error');
      if (AUTH_ERROR.test(msg)) {
        statusCache = null; // so the editor re-checks and shows the sign-in button
        emit({ type: 'error', message: SIGN_IN_MESSAGE, signIn: true });
      } else emit({ type: 'error', message: msg });
    }
  };

  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch { /* non-JSON log line */ }
    }
  });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0 && !streamedText && stderr.trim()) emit({ type: 'error', message: `Claude Code exited (${code}): ${stderr.trim().slice(-300)}` });
  emit({ type: 'done' });
}
