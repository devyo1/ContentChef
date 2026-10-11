import { html, useState, useEffect, useRef, api, Modal, Field } from './lib.js';
import { Icon } from './icons.js';
import { assistantName, assistantReady } from './assistant.js';
import { readBrandProgress } from './brand-progress.js';
import { BrandBuildProgress } from './brand-build-progress.js';

export function NewBrandModal({ settings, onClose, onCreated }) {
  const [mode, setMode] = useState('website');
  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [logo, setLogo] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!draft) return;
    const specs = [...new Set(Object.values(draft.brand.fonts).map((font) => font.google))];
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${specs.map((spec) => `family=${spec}`).join('&')}&display=swap`;
    document.head.append(link);
    return () => link.remove();
  }, [draft?.draftId]);
  const ready = assistantReady(settings);
  const patch = (p) => setProposal((current) => ({ ...current, ...p }));
  const generate = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setCancelled(false);
    setProgress({ stage: 'reading', detail: 'Connecting to your website…' });
    request.current = new AbortController();
    try {
      const response = await fetch('/api/brand-import/draft', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ url: url.trim(), prompt: prompt.trim() }), signal: request.current.signal });
      const r = await readBrandProgress(response, setProgress);
      setDraft(r);
      // The preview uses the same validated font and palette values that will be saved.
      setProposal({ ...r.proposal, palette: r.brand.palettes.website, displayFont: r.brand.fonts.display.family, bodyFont: r.brand.fonts.body.family });
      setLogo(-1);
    } catch (e) { if (e.name !== 'AbortError') setError(e.message); else setCancelled(true); }
    finally { setBusy(false); setProgress(null); }
  };
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const b = draft ? await api('POST', '/api/brand-import/create', { draftId: draft.draftId, proposal, logoIndex: logo })
        : await api('PUT', '/api/brand/_new', { name: name.trim() });
      await onCreated(b.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const selectedLogo = draft?.logos.find((l) => l.index === logo);
  return html`
      <${Modal} title=${draft ? 'Your new brand direction' : 'Create your brand'} wide=${!!draft} onClose=${onClose}>
      ${error && html`<p class="brand-import-error" role="alert">${error}</p>`}
      ${!draft ? html`
        <div class="seg brand-import-modes">
          <button type="button" disabled=${busy} class=${mode === 'website' ? 'on' : ''} onClick=${() => { setMode('website'); setError(''); }}>From my website</button>
          <button type="button" disabled=${busy} class=${mode === 'manual' ? 'on' : ''} onClick=${() => { setMode('manual'); setError(''); }}>Start manually</button>
        </div>
        ${mode === 'website' ? html`
          <p class="muted">Give ${assistantName(settings)} your website and an idea. Your connected assistant will study screenshots, page content and styles, then design a brand inspired by the site’s themes, imagery and personality.</p>
          <form onSubmit=${generate}>
            <${Field} label="Your website"><input autofocus required value=${url} disabled=${busy} placeholder="yourbrand.com" onInput=${(e) => setUrl(e.target.value)} /><//>
            <${Field} label="What should your brand feel like, and who is it for?" hint="optional">
              <textarea rows="4" maxLength="3000" value=${prompt} disabled=${busy} onInput=${(e) => setPrompt(e.target.value)} placeholder="For example: use the cinematic, editorial feel of our website to create a fresh brand for ads. Reach local business owners. Keep the warmth, but make the typography bolder." />
            <//>
            <div class="brand-import-includes"><span>Visual website study</span><span>Creative direction</span><span>Palettes & typography</span><span>Imagery & voice</span></div>
            ${!ready && html`<p class="brand-import-error">Connect your assistant in Settings → AI assistant first, or start manually.</p>`}
            ${progress && html`<${BrandBuildProgress} progress=${progress} onCancel=${() => request.current?.abort()} />`}
            ${cancelled && html`<p class="small muted" role="status">Build cancelled. Your website and brief are ready whenever you want to try again.</p>`}
            ${!progress && html`<div class="row end"><button type="submit" class="btn primary" disabled=${busy || !url.trim() || !ready}><${Icon} name="sparkles" size=${15} />Build my brand</button></div>`}
            <p class="small muted">Reads the public page and up to two related business pages. Screenshots, relevant website content and your brief are sent to your connected AI. Review the direction before saving.</p>
          </form>` : html`
          <form onSubmit=${save}>
            <${Field} label="Brand name"><input autofocus required value=${name} disabled=${busy} onInput=${(e) => setName(e.target.value)} placeholder="e.g. Northside Coffee" /><//>
            <p class="muted">Start with a blank kit, then choose fonts, colours and a logo.</p>
            <div class="row end"><button type="submit" class="btn primary" disabled=${busy || !name.trim()}>${busy ? 'Creating…' : 'Create brand'}</button></div>
          </form>`}
      ` : html`
        <p class="muted">A designed starting point inspired by your website. Review the creative direction, compare the colourways and keep what fits.</p>
        ${proposal.alternatePalettes?.length > 0 && html`<section class="brand-colourway-review"><h3>One brand, different settings</h3><p class="small muted">These complementary colourways are saved with your brand. You can adjust them in Brand kit.</p><div class="brand-colourway-grid">${[{ name: 'Primary', palette: proposal.palette }, ...proposal.alternatePalettes.map((alt) => ({ ...alt, palette: draft.brand.palettes[alt.name] }))].map(({ name, palette: p }) => html`<article style=${{ background: p.bg, color: p.fg }}><small>${name}</small><strong style=${{ fontFamily: `'${proposal.displayFont}', sans-serif`, fontWeight: draft.brand.fonts.display.weight }}>${proposal.tagline || proposal.name}</strong><p style=${{ color: p.muted, fontFamily: `'${proposal.bodyFont}', sans-serif` }}>${proposal.name}</p><span style=${{ background: p.ctaBg, color: p.ctaText, borderRadius: draft.brand.style.radius }}>Learn more</span></article>`)}</div></section>`}
        ${proposal.direction && html`<details class="brand-direction">
          <summary>The idea behind your brand</summary>
          <${Field} label="Creative direction"><textarea rows="3" value=${proposal.direction.concept} onInput=${(e) => patch({ direction: { ...proposal.direction, concept: e.target.value } })} /><//>
          <div class="brand-direction-grid"><div><h4>From your website</h4><ul>${proposal.direction.siteThemes.map((theme) => html`<li>${theme}</li>`)}</ul><p><strong>Keep:</strong> ${proposal.direction.keep}</p><p><strong>Evolve:</strong> ${proposal.direction.evolve}</p></div>
          <div><${Field} label="Photography & imagery"><textarea rows="3" value=${proposal.direction.imagery} onInput=${(e) => patch({ direction: { ...proposal.direction, imagery: e.target.value } })} /><//>
          <${Field} label="Composition & layout"><textarea rows="3" value=${proposal.direction.layout} onInput=${(e) => patch({ direction: { ...proposal.direction, layout: e.target.value } })} /><//></div></div>
        </details>`}
        <div class="brand-import-review">
          <div>
            <${Field} label="Brand name"><input value=${proposal.name} maxLength="100" onInput=${(e) => patch({ name: e.target.value })} /><//>
            <${Field} label="Tagline"><input value=${proposal.tagline} maxLength="160" onInput=${(e) => patch({ tagline: e.target.value })} /><//>
            <${Field} label="What you offer"><textarea rows="3" maxLength="1200" value=${proposal.description} onInput=${(e) => patch({ description: e.target.value })} /><//>
            <${Field} label="Who you want to reach"><textarea rows="3" maxLength="1200" value=${proposal.audience} onInput=${(e) => patch({ audience: e.target.value })} /><//>
            <${Field} label="Brand voice"><textarea rows="3" maxLength="1200" value=${proposal.voice} onInput=${(e) => patch({ voice: e.target.value })} /><//>
          </div>
          <div>
            <div class="brand-import-preview" style=${{ background: proposal.palette.bg, color: proposal.palette.fg, fontFamily: `'${proposal.bodyFont}', sans-serif` }}>
              ${selectedLogo ? html`<img class="brand-import-logo" src=${selectedLogo.preview} alt=${proposal.name} />` : html`<small>${proposal.name}</small>`}
              <strong style=${{ fontFamily: `'${proposal.displayFont}', sans-serif`, fontWeight: draft.brand.fonts.display.weight, letterSpacing: draft.brand.style.headlineTracking, lineHeight: draft.brand.style.headlineLeading, textTransform: proposal.headlineCase === 'upper' ? 'uppercase' : 'none' }}>${proposal.tagline || proposal.name}</strong>
              <p>Your next story starts here.</p>
              <span class="brand-import-cta" style=${{ background: proposal.palette.ctaBg, color: proposal.palette.ctaText, borderRadius: proposal.buttonShape === 'pill' ? '999px' : proposal.buttonShape === 'rounded' ? '10px' : '0' }}>Learn more</span>
            </div>
            <div class="brand-import-swatches">${Object.entries(proposal.palette).filter(([k]) => ['bg','fg','accent','ctaBg'].includes(k)).map(([k, color]) => html`<label><input type="color" aria-label=${`Palette ${k}`} value=${color} onInput=${(e) => patch({ palette: { ...proposal.palette, [k]: e.target.value } })} /><small>${color}</small></label>`)}</div>
            <p class="small muted">${proposal.displayFont} · ${proposal.bodyFont}</p>
            ${draft.logos.length > 0 && html`<${Field} label="Logo"><select value=${logo} onChange=${(e) => setLogo(Number(e.target.value))}><option value="-1">Use the brand name</option>${draft.logos.map((l) => html`<option value=${l.index}>${l.label} (${l.index + 1})</option>`)}</select><//>`}
            <p class="small">${proposal.reasoning}</p>
          </div>
        </div>
        <details class="brand-import-notes"><summary>What we found & suggested</summary>
          <p class="small">${draft.references?.length || 0} website screenshots supplied to your connected assistant.</p>
          ${draft.references?.length > 0 && html`<div class="brand-reference-grid">${draft.references.map((ref) => html`<figure><img src=${ref.preview} alt=${ref.label} loading="lazy" /><figcaption>${ref.label}</figcaption></figure>`)}</div>`}
          <p class="small">Detected fonts: ${draft.detected.fonts.join(', ') || 'None'}</p>
          <p class="small">Detected colours: ${draft.detected.colors.map((c) => c.value).slice(0, 10).join(', ') || 'None'}</p>
          ${draft.notes.length > 0 && html`<ul>${draft.notes.map((note) => html`<li class="small">${note}</li>`)}</ul>`}
          <p class="small">Read ${draft.sources.length} page / stylesheet sources. <a href=${draft.sources[0]} target="_blank" rel="noopener">View website</a></p>
        </details>
        <div class="row between brand-import-actions">
          <button class="btn" disabled=${busy} onClick=${() => { setDraft(null); setError(''); }}>Edit brief & try again</button>
          <button class="btn primary" disabled=${busy || !proposal.name.trim()} onClick=${save}>${busy ? 'Creating…' : 'Create brand & fine-tune'}</button>
        </div>
      `}
    <//>`;
}
