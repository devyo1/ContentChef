import { html, useState, useEffect, useRef, store, useApp, Field } from './lib.js';
import { Icon } from './icons.js';
import { assistantName, assistantReady } from './assistant.js';
import { readBrandProgress } from './brand-progress.js';
import { BrandBuildProgress } from './brand-build-progress.js';

export function CarouselSetup({ onCreated, onCancel }) {
  const { brand, settings } = useApp();
  const key = `carousel.brief.${brand.id}`;
  const [form, setForm] = useState(() => ({ ctaMode: 'manual', website: '', ...store.get(key, { prompt: '', count: 6, cta: 'Learn more', format: 'ig-portrait', palette: Object.keys(brand.palettes)[0] }) }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [progress, setProgress] = useState({ stage: 'reading', detail: 'Connecting to your website…' });
  const controller = useRef(null);
  const briefRef = useRef(null);
  useEffect(() => { store.set(key, form); }, [form]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const focus = () => briefRef.current?.focus();
    addEventListener('chef:carousel-ai', focus); return () => removeEventListener('chef:carousel-ai', focus);
  }, []);
  const change = (patch) => setForm((f) => ({ ...f, ...patch }));
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); controller.current = new AbortController();
    setProgress({ stage: form.website.trim() ? 'reading' : 'design', detail: form.website.trim() ? 'Connecting to your website…' : 'Planning your carousel story…' });
    try {
      const response = await fetch('/api/carousels', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ brand: brand.id, ...form }), signal: controller.current.signal });
      onCreated(await readBrandProgress(response, setProgress));
    }
    catch (e) { setError(e.name === 'AbortError' ? 'Creation cancelled. Your brief is kept here.' : e.message); }
    finally { setBusy(false); }
  };
  return html`<form class="carousel-setup panel-card" onSubmit=${submit}>
    <div class="carousel-intro"><span class="carousel-emblem"><${Icon} name="layers" size=${28} /></span><h2>One story. One swipe at a time.</h2><p class="muted">Give ${assistantName(settings)} an idea or a website to study. Edit the resulting slides in the full builder.</p></div>
    ${error && html`<p class="brand-import-error" role="alert">${error}</p>`}
    <fieldset disabled=${busy}>
      <${Field} label="Website to study" hint="optional"><input value=${form.website} maxLength="2048" onInput=${e => change({ website: e.target.value })} placeholder="yourbrand.com" /><//>
      <${Field} label="What story should these slides tell?"><textarea ref=${briefRef} required rows="4" maxLength="3000" value=${form.prompt} onInput=${e => change({ prompt: e.target.value })} placeholder="For example: explain why professional property photography helps listings stand out. Teach local agents three practical ideas, then invite them to book a shoot." /><//>
      <div class="two"><${Field} label="Number of slides" hint="Includes the hook and final CTA"><input type="number" required min="2" max="20" value=${form.count} onInput=${e => change({ count: Number(e.target.value) })} /><//><${Field} label="Slide size"><select value=${form.format} onChange=${e => change({ format: e.target.value })}><option value="ig-portrait">Portrait · 4:5</option><option value="ig-square">Square · 1:1</option><option value="linkedin-sq">LinkedIn square · 1:1</option></select><//></div>
      <div class="carousel-cta-field">
        <div class="carousel-cta-heading"><span class="field-label" id="carousel-cta-label">Final call to action</span><div class="seg mini carousel-cta-modes" role="group" aria-labelledby="carousel-cta-label">
          <button type="button" class=${form.ctaMode === 'manual' ? 'on' : ''} aria-pressed=${form.ctaMode === 'manual'} onClick=${() => change({ ctaMode: 'manual' })}>Write my own</button>
          <button type="button" class=${form.ctaMode === 'dynamic' ? 'on' : ''} aria-pressed=${form.ctaMode === 'dynamic'} aria-label="Dynamic — AI-powered CTA" onClick=${() => change({ ctaMode: 'dynamic' })}><${Icon} name="sparkles" size=${13} />Dynamic</button>
        </div></div>
        ${form.ctaMode === 'dynamic' ? html`<div class="carousel-cta-dynamic"><span class="carousel-cta-spark"><${Icon} name="sparkles" size=${18} /></span><div><strong>Let ${assistantName(settings)} find the right next step</strong><p>AI will tailor the final CTA to your story and audience. You can edit it afterwards.</p></div></div>` : html`<input aria-labelledby="carousel-cta-label" required maxLength="100" value=${form.cta} onInput=${e => change({ cta: e.target.value })} placeholder="Book your shoot" />`}
      </div>
      <${Field} label="Brand colourway"><select value=${form.palette} onChange=${e => change({ palette: e.target.value })}>${Object.keys(brand.palettes).map(p => html`<option value=${p}>${p}</option>`)}</select><//>
    </fieldset>
    <div class="carousel-story-map"><span>01 / Hook</span><span>→</span><span>Build the story</span><span>→</span><span>Final CTA</span></div>
    ${busy ? html`<${BrandBuildProgress} heading=${`Building your ${form.count}-slide story`} progress=${progress} stages=${[...(form.website.trim() ? [['reading', 'Read the website'], ['visuals', 'Study screenshots'], ['styles', 'Gather brand details']] : []), ['design', 'Write the story & CTA'], ['review', 'Prepare editable slides']]} onCancel=${() => controller.current?.abort()} />` : html`<div class="row end">${onCancel && html`<button type="button" class="btn" onClick=${onCancel}>Back to carousel</button>`}<button class="btn primary" disabled=${!assistantReady(settings) || !form.prompt.trim() || (form.ctaMode !== 'dynamic' && !form.cta.trim())}><${Icon} name="sparkles" />Build carousel</button></div>`}
    ${!assistantReady(settings) && html`<p class="small muted">Connect your assistant in Settings to create a carousel.</p>`}
    <p class="small muted">${form.website.trim() ? 'We scan public pages, styles and screenshots and send them to your connected AI. ' : ''}Every slide opens in the main builder for individual editing. Nothing is published automatically.</p>
  </form>`;
}
