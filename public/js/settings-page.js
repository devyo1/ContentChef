// Settings: appearance, assistant connections, export defaults and MCP clients.
import { html, useState, api, useApp, Field, Segmented, toast } from './lib.js';
import { assistantProvider } from './assistant.js';

const MODELS = [
  ['claude-opus-5', 'Claude Opus 5 (recommended)'],
  ['claude-sonnet-5', 'Claude Sonnet 5 (faster, cheaper)'],
  ['claude-haiku-4-5', 'Claude Haiku 4.5 (fastest)'],
  ['claude-fable-5-1', 'Claude Fable 5.1 (most capable)'],
];

function Cmd({ text }) {
  return html`<div class="cmd"><code>${text}</code>
    <button class="btn small" onClick=${() => navigator.clipboard.writeText(text).then(() => toast('Copied'))}>Copy</button></div>`;
}

export function SettingsPage() {
  const { settings, saveSettings, refreshSettings, meta } = useApp();
  const [key, setKey] = useState('');
  const c = settings.claude;
  const cc = settings.claudeCode ?? {};
  const provider = assistantProvider(settings);
  const cx = settings.codex ?? {};
  const cs = settings.codexStatus ?? {};
  const [signingIn, setSigningIn] = useState(false);
  const signInCodex = async () => {
    setSigningIn(true);
    try {
      await api('POST', '/api/codex/login');
      toast('Finish signing in in your browser, then press Check again');
    } catch (e) { toast(e.message, 'err'); }
    finally { setSigningIn(false); }
  };
  const signIn = async () => {
    await api('POST', '/api/claude-code/login');
    toast('Finish signing in in the window that opened, then press Check again');
  };
  // The server knows exactly how to launch the MCP server on this machine (node or the desktop app).
  const m = meta.mcp;
  const q = (s) => `"${s}"`;
  const envFlags = Object.entries(m.env ?? {}).map(([k, v]) => `-e ${k}=${q(v)}`).join(' ');
  const codeCmd = `claude mcp add content-chef ${envFlags} -- ${q(m.command)} ${m.args.map(q).join(' ')}`;
  const codexEnv = Object.entries(m.env ?? {}).map(([k, v]) => `--env ${q(`${k}=${v}`)}`).join(' ');
  const codexCmd = `codex mcp add content-chef ${codexEnv} -- ${q(m.command)} ${m.args.map(q).join(' ')}`;
  const desktopJson = JSON.stringify({ mcpServers: { 'content-chef': m } }, null, 2);

  const saveKey = async () => {
    await saveSettings({ claude: { apiKey: key.trim() } });
    setKey('');
    toast(key.trim() ? 'API key saved' : 'API key removed');
  };

  return html`
    <div class="page"><div class="page-inner">
      <div class="page-head"><div><h2>Settings</h2><p class="muted">Stored on this computer in <code>data/settings.json</code>.</p></div></div>
      <div class="settings">
        <section class="card">
          <h3>Appearance</h3><p>Choose how Content Chef looks.</p>
          <${Field} label="Theme">
            <${Segmented} value=${settings.theme} onChange=${(theme) => saveSettings({ theme })}
              options=${[{ value: 'system', label: '◐ Match system' }, { value: 'light', label: '☀ Light' }, { value: 'dark', label: '☾ Dark' }]} />
          <//>
        </section>

        <section class="card">
          <h3>AI assistant</h3>
          <p>Choose who helps with your designs, copy and captions. Your assistant can see your design, change it live, generate palettes and export.</p>
          <${Field} label="Connect with">
            <select value=${provider} onChange=${(e) => saveSettings({ assistant: { provider: e.target.value } })}>
              <option value="codex">My ChatGPT account (via Codex)</option>
              <option value="claude-code">My Claude account (via Claude Code)</option>
              <option value="api">Anthropic API key</option>
            </select>
          <//>
          ${provider === 'codex' ? html`
            <div class="row" style=${{ marginBottom: '10px' }}>
              <span class=${`status-dot ${cs.loggedIn ? 'ok' : ''}`}></span>
              <span class="small">${!cs.installed ? 'Codex not found' : cs.loggedIn ? 'Signed in with ChatGPT' : 'Not signed in with ChatGPT yet'}</span>
            </div>
            <p class="small muted">Uses your ChatGPT account through Codex on this computer. No API key needed; usage counts against your plan's Codex limits.</p>
            ${!cs.installed && html`<p class="small">Install <a href="https://developers.openai.com/codex/cli" target="_blank" rel="noopener">Codex CLI</a>, then press Check again.</p><${Cmd} text="npm install -g @openai/codex" />`}
            ${cs.error && html`<p class="small muted">${cs.error}</p>`}
            <div class="row">
              ${cs.installed && !cs.loggedIn && html`<button class="btn primary" disabled=${signingIn} onClick=${signInCodex}>${signingIn ? 'Opening sign-in…' : 'Sign in with ChatGPT'}</button>`}
              <button class="btn" onClick=${() => refreshSettings().then((s) => toast(s.codexStatus.loggedIn ? 'Signed in ✓' : 'Not signed in yet')).catch((e) => toast(e.message, 'err'))}>Check again</button>
            </div>
            <div style=${{ height: '12px' }}></div>
            <${Field} label="Model" hint="Leave blank for Codex's default, or enter a model available to your ChatGPT account.">
              <input value=${cx.model ?? ''} placeholder="Codex default" onChange=${(e) => saveSettings({ codex: { model: e.target.value } })} />
            <//>
            <${Field} label="Codex executable path (optional)" hint="Detected automatically. Set this only if Codex is installed somewhere else.">
              <input value=${cx.codePath ?? ''} placeholder="Automatic" onChange=${(e) => saveSettings({ codex: { codePath: e.target.value } })} />
            <//>`
          : provider === 'claude-code' ? html`
            <div class="row" style=${{ marginBottom: '10px' }}>
              <span class=${`status-dot ${cc.loggedIn ? 'ok' : ''}`}></span>
              <span class="small">${!cc.installed ? 'Claude Code not found' : cc.loggedIn ? `Signed in${cc.email ? ` as ${cc.email}` : ''}` : 'Not signed in yet'}</span>
            </div>
            <p class="small muted">Runs the Claude Code that ships with the Claude desktop app, on this computer, with only Content Chef's tools enabled (no file or shell access). Usage counts against your Claude plan.</p>
            ${!cc.installed && html`<p class="small">Install the <a href="https://claude.ai/download" target="_blank">Claude desktop app</a> (it includes Claude Code), then press Check again.</p>`}
            <div class="row">
              ${cc.installed && !cc.loggedIn && html`<button class="btn primary" onClick=${signIn}>Sign in with Claude</button>`}
              <button class="btn" onClick=${() => refreshSettings().then((s) => toast(s.claudeCode.loggedIn ? 'Signed in ✓' : 'Not signed in yet'))}>Check again</button>
            </div>
            <div style=${{ height: '12px' }}></div>
            <${Field} label="Model">
              <select value=${c.codeModel} onChange=${(e) => saveSettings({ claude: { codeModel: e.target.value } })}>
                <option value="">Default (your Claude Code setting)</option>
                <option value="opus">Opus</option>
                <option value="sonnet">Sonnet (faster)</option>
                <option value="haiku">Haiku (fastest)</option>
              </select>
            <//>`
          : html`
            <div class="row" style=${{ marginBottom: '10px' }}>
              <span class=${`status-dot ${c.hasApiKey ? 'ok' : ''}`}></span>
              <span class="small">${c.hasApiKey ? `Connected · key from ${c.keySource}` : 'Not connected'}</span>
            </div>
            <${Field} label="Anthropic API key" hint="console.anthropic.com → API keys">
              <div class="row nowrap">
                <input type="password" autocomplete="off" value=${key} placeholder=${c.keySource === 'settings' ? '•••••••• (saved, paste a new key to replace)' : 'sk-ant-…'} onInput=${(e) => setKey(e.target.value)} />
                <button class="btn primary" disabled=${!key.trim()} onClick=${saveKey}>Save key</button>
                ${c.keySource === 'settings' && html`<button class="btn ghost" onClick=${() => saveSettings({ claude: { apiKey: '' } }).then(() => toast('API key removed'))}>Remove</button>`}
              </div>
            <//>
            <div class="two">
              <${Field} label="Model">
                <select value=${c.model} onChange=${(e) => saveSettings({ claude: { model: e.target.value } })}>
                  ${MODELS.map(([id, label]) => html`<option value=${id}>${label}</option>`)}
                </select>
              <//>
              <${Field} label="Thinking">
                <${Segmented} value=${c.effort} onChange=${(effort) => saveSettings({ claude: { effort } })}
                  options=${[{ value: 'low', label: 'Quick' }, { value: 'medium', label: 'Balanced' }, { value: 'high', label: 'Thorough' }]} />
              <//>
            </div>`}
        </section>

        <section class="card">
          <h3>Use Content Chef from other AI apps</h3>
          <p>Content Chef is also an MCP connector. Codex, Claude Desktop, Claude Code or another MCP client can use the same tools. Changes show up here live.</p>
          <h5>Codex</h5>
          <${Cmd} text=${codexCmd} />
          <h5>Claude Code</h5>
          <${Cmd} text=${codeCmd} />
          <h5>Claude Desktop</h5>
          <p class="small muted">Settings → Developer → Edit config, add this to <code>claude_desktop_config.json</code>, then restart Claude Desktop:</p>
          <${Cmd} text=${desktopJson} />
        </section>

        <section class="card">
          <h3>Export defaults</h3><p>Starting settings for new designs.</p>
          <div class="two">
            <${Field} label="File type">
              <${Segmented} value=${settings.export.type} onChange=${(type) => saveSettings({ export: { type } })} options=${[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }]} />
            <//>
            <${Field} label="Sharpness">
              <${Segmented} value=${settings.export.scale} onChange=${(scale) => saveSettings({ export: { scale } })} options=${[{ value: 1, label: 'Platform size' }, { value: 2, label: 'Extra sharp 2×' }]} />
            <//>
          </div>
          <button class="btn" onClick=${() => api('POST', '/api/open', { path: 'output' })}>Open export folder</button>
        </section>
        <p class="made-by">Content Chef · made by <a href="https://realcitymedia.com" target="_blank" rel="noopener">RealCityMedia</a></p>
      </div>
    </div></div>`;
}
