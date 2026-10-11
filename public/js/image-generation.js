import { html, useState, useEffect, useRef, api, useApp, Field, Modal, toast, brandAssetUrl } from './lib.js';

export function ImageConnection({ status, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    // Open synchronously so browsers don't block the OAuth tab after the API request.
    const tab = window.open('about:blank', '_blank');
    setBusy(true);
    try { const { url } = await api('POST', '/api/higgsfield/connect'); if (tab) { tab.opener = null; tab.location.href = url; } else window.location.assign(url); }
    catch (e) { tab?.close(); toast(e.message, 'err'); }
    finally { setBusy(false); }
  };
  return html`<div class="image-connection">
    <p class="small">${status?.message || 'Checking Higgsfield…'}</p>
    <div class="row">
      <button class="btn soft" disabled=${busy} onClick=${connect}>${busy ? 'Opening…' : status?.ready ? 'Reconnect Higgsfield' : 'Connect Higgsfield'}</button>
      <button class="btn" onClick=${onRefresh}>Check connection</button>
      ${status?.ready && html`<button class="btn ghost" onClick=${async () => { await api('POST', '/api/higgsfield/disconnect'); onRefresh(); }}>Disconnect</button>`}
    </div>
    <p class="hint">Sign in with Higgsfield in your browser. Works with ChatGPT or Claude. Your connection stays on this computer.</p>
  </div>`;
}

export function ImageSettings() {
  const { settings, saveSettings } = useApp();
  const [status, setStatus] = useState(null);
  const refresh = () => api('GET', '/api/images/status?fresh=1').then(setStatus).catch(e => toast(e.message, 'err'));
  useEffect(() => { refresh(); }, []);
  return html`<section class="card">
    <h3>Image generation</h3>
    <p>Choose where backgrounds are generated. Your main assistant still shapes the brief and brand direction.</p>
    <${Field} label="Default image provider">
      <select value=${settings.images?.provider ?? 'auto'} onChange=${e => saveSettings({ images: { provider: e.target.value } })}>
        <option value="auto">Automatic: ChatGPT native, Higgsfield for Claude</option>
        <option value="chatgpt">ChatGPT native</option>
        <option value="higgsfield">Higgsfield (with any assistant)</option>
      </select>
    <//>
    <p class="small">${status?.chatgpt?.message || 'Checking ChatGPT image support…'}</p>
    <${ImageConnection} status=${status?.higgsfield} onRefresh=${refresh} />
  </section>`;
}

export function BackgroundGenerator({ brand, palette, content, onApply, onClose }) {
  const { settings } = useApp();
  const [provider, setProvider] = useState(settings.images?.provider === 'higgsfield' ? 'higgsfield' : settings.images?.provider === 'chatgpt' || settings.assistant.provider === 'codex' ? 'chatgpt' : 'higgsfield');
  const [prompt, setPrompt] = useState(brand.strategy?.brief || content.headline?.replace(/[*_|]/g, '') || '');
  const [website, setWebsite] = useState('');
  const [ratio, setRatio] = useState('1:1');
  const [model, setModel] = useState(settings.images?.model || 'gpt_image_2_5');
  const [billing, setBilling] = useState('credits');
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [result, setResult] = useState(null);
  const controller = useRef(null);
  const refresh = () => api('GET', '/api/images/status?fresh=1').then(setStatus).catch(e => setError(e.message));
  useEffect(() => { refresh(); return () => controller.current?.abort(); }, []);
  useEffect(() => {
    if (provider === 'higgsfield' && status?.higgsfield?.ready) api('GET', '/api/higgsfield/models').then(setModels).catch(e => setError(e.message));
  }, [provider, status?.higgsfield?.ready]);
  const change = (set, value) => { set(value); setDraft(null); setResult(null); setError(''); };
  const run = async () => {
    controller.current = new AbortController();
    const options = { signal: controller.current.signal };
    setError(''); setResult(null);
    try {
      let brief = draft;
      if (!brief) {
        setBusy(website ? 'Studying your website and preparing the image…' : 'Preparing your image…');
        brief = await api('POST', '/api/background/prepare', { brand: brand.id, palette, prompt, website, provider, model, ratio, billing }, options);
        setDraft(brief);
        if (provider === 'higgsfield') return;
      }
      setBusy('Generating your background. This can take a few minutes…'); setDraft(null);
      setResult(await api('POST', '/api/background/generate', { id: brief.id, acceptedCost: provider === 'higgsfield' }, options));
    } catch (e) { setError(e.name === 'AbortError' ? 'Stopped waiting. A submitted image may still finish in your provider’s library.' : e.message); }
    finally { setBusy(''); }
  };
  const selectedModel = models.find(m => m.id === model);
  return html`<${Modal} title="Create an AI background" onClose=${onClose} wide>
    <p class="muted">Start with an idea, a website, or your saved brand direction. Review the image before adding it to your design.</p>
    <fieldset disabled=${!!busy} class="image-controls">
      <div class="two">
        <${Field} label="Image provider"><select value=${provider} onChange=${e => change(setProvider, e.target.value)}>
          <option value="chatgpt">ChatGPT native</option><option value="higgsfield">Higgsfield</option>
        </select><//>
        <${Field} label="Shape"><select value=${ratio} onChange=${e => change(setRatio, e.target.value)}>
          <option value="1:1">Square · 1:1</option><option value="4:5">Portrait · 4:5</option><option value="9:16">Story · 9:16</option><option value="16:9">Landscape · 16:9</option>
        </select><//>
      </div>
      ${provider === 'higgsfield' && html`<div class="two">
        <${Field} label="Higgsfield model"><select value=${model} onChange=${e => { change(setModel, e.target.value); setBilling('credits'); }}>
          ${!models.some(m => m.id === model) && html`<option value=${model}>${model}</option>`}
          ${models.map(m => html`<option value=${m.id}>${m.name}</option>`)}
        </select><//>
        <${Field} label="Use"><select value=${billing} onChange=${e => change(setBilling, e.target.value)}>
          <option value="credits">Higgsfield credits</option>${selectedModel?.supportsUnlim && html`<option value="unlimited">Unlimited allowance</option>`}
        </select><//>
      </div>`}
      <${Field} label="What should the background show?" hint="Leave blank to use your brand direction.">
        <textarea rows="3" value=${prompt} placeholder="Warm studio lighting, textured ivory paper and coral shapes. Leave room for a headline." onInput=${e => change(setPrompt, e.target.value)} />
      <//>
      <${Field} label="Website inspiration (optional)" hint="We’ll examine the page and interpret its look, materials and themes.">
        <input value=${website} placeholder="example.com" onInput=${e => change(setWebsite, e.target.value)} />
      <//>
    </fieldset>
    ${provider === 'higgsfield' && !status?.higgsfield?.ready && html`<${ImageConnection} status=${status?.higgsfield} onRefresh=${refresh} />`}
    ${provider === 'chatgpt' && html`<p class="hint">${status?.chatgpt?.message || 'Checking your ChatGPT connection…'} · Uses your Codex image allowance.</p>`}
    ${draft && provider === 'higgsfield' && html`<div class="card"><p><strong>${draft.cost ? `${draft.cost.credits} Higgsfield credits` : billing === 'unlimited' ? 'Use your unlimited allowance' : 'Cost unavailable'}</strong> · one image</p><details><summary>View the image prompt</summary><p class="small">${draft.prompt}</p></details></div>`}
    ${draft?.warnings?.map(w => html`<p class="hint">${w}</p>`)}
    ${busy && html`<p role="status">${busy}</p>`}
    ${error && html`<p class="image-error" role="alert">${error}</p>`}
    ${result && html`<img class="generated-background-preview" src=${brandAssetUrl(brand.id, result.ref)} alt="Generated background ready to use" />`}
    <div class="row between" style=${{ marginTop: '16px' }}>
      <button class="btn ghost" onClick=${busy ? () => controller.current?.abort() : onClose}>${busy ? 'Stop waiting' : 'Close'}</button>
      ${result ? html`<button class="btn primary" onClick=${() => onApply(result.ref)}>Use this background</button>` : html`<button class="btn primary" disabled=${!!busy || !status?.[provider]?.ready || (draft && provider === 'higgsfield' && billing === 'credits' && !draft.cost)} onClick=${run}>${busy ? 'Working…' : provider === 'higgsfield' && !draft ? 'Prepare & check cost' : 'Generate background'}</button>`}
    </div>
  <//>`;
}
