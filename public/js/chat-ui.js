// Floating Claude assistant (bottom-right). Streams replies from /api/chat; Claude works on the
// same editor through tools, so changes it makes appear on screen as it goes.
import { html, useState, useEffect, useRef, api, store, useApp, Modal, toast } from './lib.js';
import { Icon } from './icons.js';

const TOOL_LABELS = {
  get_editor: 'Looking at your design', update_editor: 'Updating the editor', export_editor: 'Exporting',
  preview_ad: 'Rendering a preview', generate_ads: 'Rendering ads', generate_bulk: 'Rendering a bulk campaign',
  generate_palettes: 'Generating palettes', save_brand: 'Saving brand', add_library_palette: 'Adding a palette',
  list_brands: 'Checking brands', get_brand: 'Reading brand', build_captions: 'Writing captions', view_export: 'Viewing exports',
  list_exports: 'Listing exports', list_templates: 'Checking templates', list_styles: 'Checking styles', list_formats: 'Checking sizes',
  list_fonts: 'Browsing fonts', list_palette_library: 'Browsing colour library', save_campaign: 'Saving campaign',
  add_catalog_item: 'Saving to campaign', render_catalog: 'Rendering campaign', add_brand_asset: 'Adding media',
};
const SUGGESTIONS = [
  'Look at my current ad and suggest 3 improvements',
  'Write 10 headline variations and put them in bulk mode',
  'Make a liquid glass version with a fresh colour palette',
  'Turn this into a 6-second typewriter video for Stories',
  'Write Instagram and LinkedIn captions in my brand voice',
];

/**
 * One-click Claude sign-in (Claude Code): opens the sign-in window, then checks every few seconds
 * until the login lands, so chat starts working without restarting anything.
 */
function SignInButton() {
  const { refreshSettings } = useApp();
  const [waiting, setWaiting] = useState(false);
  const start = async () => {
    try { await api('POST', '/api/claude-code/login'); } catch (e) { toast(e.message, 'err'); return; }
    setWaiting(true);
    const until = Date.now() + 5 * 60 * 1000;
    const check = async () => {
      const s = await refreshSettings().catch(() => null);
      if (s?.claudeCode?.loggedIn) { setWaiting(false); toast('Signed in. Claude is ready.'); return; }
      if (Date.now() < until) setTimeout(check, 3000); else setWaiting(false);
    };
    setTimeout(check, 4000);
  };
  return waiting
    ? html`<div class="signin-wait"><span class="spin"></span>Finish signing in in the window that opened (it uses your browser). This updates by itself.</div>`
    : html`<button class="btn primary" onClick=${start}>Sign in with Claude</button>`;
}

const newId = () => (crypto.randomUUID?.() ?? String(Math.random())).slice(0, 18);
// Keep stored history light: drop large images from older messages.
const persistable = (msgs) => msgs.slice(-60).map((m, i, a) => (m.images && i < a.length - 6 ? { ...m, images: [] } : m));

export function ChatWidget() {
  const { settings, setTab, refreshSettings } = useApp();
  const [open, setOpen] = useState(store.get('chat.open', false));
  const [convId, setConvId] = useState(store.get('chat.id', null) ?? newId());
  const [msgs, setMsgs] = useState(store.get('chat.msgs', []));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const bodyRef = useRef();
  const viaApi = settings?.claude?.provider === 'api';
  const hasKey = viaApi ? settings?.claude?.hasApiKey : settings?.claudeCode?.loggedIn;
  useEffect(() => { if (open && !hasKey) refreshSettings(); }, [open]);

  useEffect(() => store.set('chat.open', open), [open]);
  useEffect(() => store.set('chat.id', convId), [convId]);
  useEffect(() => { if (!busy) store.set('chat.msgs', persistable(msgs)); }, [msgs, busy]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, open]);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: t }, { role: 'assistant', text: '' }]);
    // Apply streamed events to the message list. Text goes into the latest assistant bubble;
    // tool calls get their own rows, and text after a tool call starts a fresh bubble.
    const apply = (e) => setMsgs((m) => {
      const out = [...m];
      const last = out[out.length - 1];
      if (e.type === 'text') {
        if (last?.role === 'assistant') out[out.length - 1] = { ...last, text: last.text + e.delta };
        else out.push({ role: 'assistant', text: e.delta });
      } else if (e.type === 'tool') {
        if (last?.role === 'assistant' && !last.text.trim()) out.pop();
        out.push({ role: 'tool', id: e.id, name: e.name, status: 'running' });
      } else if (e.type === 'tool_result') {
        const i = out.findIndex((x) => x.role === 'tool' && x.id === e.id);
        if (i >= 0) out[i] = { ...out[i], status: e.ok ? 'ok' : 'error', summary: e.summary, images: e.images };
      } else if (e.type === 'error') {
        out.push({ role: 'error', text: e.message, signIn: !!e.signIn });
      }
      return out;
    });
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: convId, text: t }) });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) apply(JSON.parse(line));
        }
      }
    } catch (e) {
      apply({ type: 'error', message: `Connection problem: ${e.message}` });
    } finally {
      setMsgs((m) => m.filter((x, i) => !(x.role === 'assistant' && !x.text.trim() && i === m.length - 1)));
      setBusy(false);
    }
  };

  const reset = async () => {
    await api('POST', '/api/chat/reset', { conversationId: convId }).catch(() => {});
    setConvId(newId());
    setMsgs([]);
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    addEventListener('chef:chat', toggle);
    return () => removeEventListener('chef:chat', toggle);
  }, []);
  if (!open) return null;
  return html`
    <div class="chat">
      <div class="chat-head">
        <span class="spark"><${Icon} name="sparkles" size=${15} stroke=${2} /></span>
        <div class="grow"><b>Claude</b><small>${busy ? 'Working…' : 'Edits your design live'}</small></div>
        <button class="icon-btn" title="New conversation" onClick=${reset}><${Icon} name="replay" /></button>
        <button class="icon-btn" title="Close" onClick=${() => setOpen(false)}><${Icon} name="x" /></button>
      </div>
      <div class="chat-body" ref=${bodyRef}>
        ${!hasKey && html`
          <div class="chat-empty">
            <b>Connect Claude</b>
            <span>${viaApi
              ? 'Add your Anthropic API key in Settings to chat with Claude here.'
              : settings?.claudeCode?.installed
                ? 'Your Claude sign-in is missing or expired. Sign in with your Claude account (one time, no API key) to chat here.'
                : "Claude Code wasn't found. Install the Claude desktop app, or use an API key."} Claude can see and edit your ads, generate palettes, write copy and export.</span>
            <div class="row" style=${{ justifyContent: 'center' }}>
              ${!viaApi && settings?.claudeCode?.installed && html`<${SignInButton} />`}
              <button class="btn" onClick=${() => setTab('settings')}>Settings</button>
            </div>
          </div>`}
        ${hasKey && !msgs.length && html`
          <div class="chat-empty">
            <span>Ask for anything: copy ideas, new looks, colour palettes, bulk variations, videos. Claude sees what you see and changes it directly.</span>
            <div class="suggest">${SUGGESTIONS.map((s) => html`<button onClick=${() => send(s)}>${s}</button>`)}</div>
          </div>`}
        ${msgs.map((m, i) => {
          if (m.role === 'tool') {
            return html`<div class="toolcall" key=${i}>
              <div class="tc-head">${m.status === 'running' ? html`<span class="spin"></span>` : m.status === 'ok' ? '✓' : '⚠'}
                <span>${TOOL_LABELS[m.name] ?? m.name}</span><span class="grow"></span><b>${m.name}</b></div>
              ${m.status === 'error' && m.summary && html`<div class="small">${m.summary}</div>`}
              ${(m.images ?? []).map((src, j) => html`<img key=${j} src=${src} onClick=${() => setZoom(src)} />`)}
            </div>`;
          }
          return html`<div class=${`msg ${m.role}`} key=${i}>${m.text || (busy && i === msgs.length - 1 ? html`<span class="typing"><i></i><i></i><i></i></span>` : '')}
            ${m.signIn && i === msgs.length - 1 && html`<div style=${{ marginTop: '8px' }}><${SignInButton} /></div>`}</div>`;
        })}
      </div>
      <div class="chat-input">
        <textarea rows="1" value=${input} disabled=${!hasKey} placeholder=${busy ? 'Claude is working…' : 'Ask Claude to change your ad…'}
          onInput=${(e) => setInput(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
        <button class="btn primary" disabled=${busy || !input.trim() || !hasKey} onClick=${() => send()} title="Send"><${Icon} name="send" /></button>
      </div>
      ${zoom && html`<${Modal} title="Preview" wide onClose=${() => setZoom(null)}><img src=${zoom} style=${{ maxWidth: '100%', display: 'block', margin: '0 auto' }} /><//>`}
    </div>`;
}
