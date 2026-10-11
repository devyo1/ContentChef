import { html, useState, useEffect, useRef, api, useApp, Modal, toast } from './lib.js';
import { Icon } from './icons.js';
import { CarouselSetup } from './carousel.js';
import { commitCarousel, carouselToDesign, selectCarouselSlide } from './carousel-design.js';
import { assistantName, assistantReady } from './assistant.js';

export function CarouselBuilderControls({ d, set }) {
  const { brand, settings } = useApp();
  const [modal, setModal] = useState(null), [items, setItems] = useState([]), [chosen, setChosen] = useState('');
  const [prompt, setPrompt] = useState(''), [suggestion, setSuggestion] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef(null);
  const refresh = () => api('GET', `/api/carousels?brand=${encodeURIComponent(brand.id)}`).then(setItems).catch(e => setError(e.message));
  useEffect(() => { refresh(); return () => controller.current?.abort(); }, []);
  useEffect(() => {
    const saved = (e) => { if (e.detail.id === d.carousel?.id) set(prev => ({ campaign: e.detail.title, carousel: { ...prev.carousel, revision: e.detail.revision } })); refresh(); };
    addEventListener('chef:carousel-saved', saved); return () => removeEventListener('chef:carousel-saved', saved);
  }, [d.carousel?.id]);
  const open = c => { set(carouselToDesign(c)); setModal(null); setError(''); refresh(); if (c.warnings?.length) toast(c.warnings.join(' '), 'err'); };
  const close = () => { controller.current?.abort(); setModal(null); setSuggestion(null); setError(''); };
  const rewrite = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true); setError(''); controller.current = new AbortController();
    try {
      const saved = await api('PUT', `/api/carousels/${d.carousel.id}/design`, { revision: d.carousel.revision, design: commitCarousel(d) }, { signal: controller.current.signal });
      set(prev => ({ carousel: { ...prev.carousel, revision: saved.revision } }));
      const result = await api('POST', `/api/carousels/${saved.id}/slides/${d.slides[d.slideIndex].id}/refine`, { revision: saved.revision, prompt }, { signal: controller.current.signal });
      setSuggestion(result.content);
    } catch (e) { if (e.name !== 'AbortError') setError(e.message); }
    finally { setBusy(false); }
  };
  return html`<div class="builder-carousel-controls">
    <div class="row"><button class="btn ai grow" onClick=${() => setModal('build')}><${Icon} name="sparkles" />${d.slides?.length ? 'Build a new carousel' : 'Build from a brief / website'}</button>
      <button class="btn small" onClick=${() => { refresh(); setModal('load'); }}>Saved carousels</button></div>
    ${d.slides?.length > 0 && html`<div class="builder-slide-select"><label class="field"><span class="field-label">Slide to edit</span><select aria-label="Slide to edit" value=${d.slideIndex} onChange=${e => set(prev => selectCarouselSlide(prev, Number(e.target.value)))}>${d.slides.map((s, i) => html`<option value=${i}>${i + 1}. ${s.content.headline || 'Untitled'}${i === d.slides.length - 1 ? ' · CTA' : ''}</option>`)}</select></label>
      <button class="btn small ai wide" disabled=${!assistantReady(settings)} onClick=${() => { setError(''); setSuggestion(null); setModal('refine'); }}><${Icon} name="sparkles" size=${14} />Rewrite slide ${d.slideIndex + 1} with ${assistantName(settings)}</button></div>`}
    ${modal === 'build' && html`<${Modal} title="Build your carousel" wide onClose=${close}><${CarouselSetup} onCreated=${open} onCancel=${close} /><//>`}
    ${modal === 'load' && html`<${Modal} title="Saved carousels" onClose=${close}><p class="muted">Open any saved carousel with the full builder, including carousels made in the earlier editor.</p><select aria-label="Saved carousels" value=${chosen} onChange=${e => setChosen(e.target.value)}><option value="">Choose a carousel</option>${items.map(c => html`<option value=${c.id}>${c.title} · ${c.count} slides</option>`)}</select>${error && html`<p role="alert">${error}</p>`}<div class="row end"><button class="btn primary" disabled=${!chosen} onClick=${async () => { try { open(await api('GET', `/api/carousels/${chosen}`)); } catch(e) { setError(e.message); } }}>Open in builder</button></div><//>`}
    ${modal === 'refine' && html`<${Modal} title=${`Refine slide ${d.slideIndex + 1}`} onClose=${close}><p class="muted">Your assistant uses the whole story for context and rewrites only this slide. Your layout and styling stay editable in the builder.</p>
      <textarea aria-label="Instructions for this slide" rows="3" maxLength="2000" value=${prompt} disabled=${busy} onInput=${e => setPrompt(e.target.value)} placeholder="Make this more concrete and helpful, with a punchier headline." />
      ${error && html`<p class="brand-import-error" role="alert">${error}</p>`}
      ${busy && html`<p class="row" role="status"><span class="spin"></span>Rewriting this slide…</p>`}
      ${suggestion && html`<div class="carousel-suggestion"><strong>${suggestion.headline}</strong><p>${suggestion.subhead}</p><p>${suggestion.body}</p>${suggestion.cta && html`<b>${suggestion.cta}</b>`}</div>`}
      <div class="row end"><button class="btn" onClick=${close}>${suggestion ? 'Discard' : 'Cancel'}</button>${suggestion ? html`<button class="btn primary" onClick=${() => { set(prev => ({ content: { ...prev.content, ...Object.fromEntries(['eyebrow', 'headline', 'subhead', 'body', 'cta'].map(k => [k, suggestion[k]])) } })); close(); }}>Apply to this slide</button>` : html`<button class="btn primary" disabled=${busy || !prompt.trim()} onClick=${rewrite}>Rewrite slide</button>`}</div><//>`}
  </div>`;
}
