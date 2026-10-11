import { html, useState, useEffect, useRef, api, store, useApp, AdFrame, Field, toast, uploadFile } from './lib.js';
import { Icon } from './icons.js';
import { assistantName, assistantReady } from './assistant.js';
import { BackgroundGenerator } from './image-generation.js';

const roleName = { hook: 'Opening hook', story: 'The story', cta: 'Final call to action' };
const requestFor = (carousel, slide, index, meta) => ({ brand: carousel.brand, template: 'carousel-slide', palette: slide.palette, format: carousel.format, formatInfo: meta.formats[carousel.format],
  content: { ...slide.content, slideNumber: index + 1, slideCount: carousel.slides.length, slideRole: slide.role } });

function CarouselSetup({ onCreated, onCancel }) {
  const { brand, settings } = useApp();
  const key = `carousel.brief.${brand.id}`;
  const [form, setForm] = useState(() => store.get(key, { prompt: '', count: 6, cta: 'Learn more', format: 'ig-portrait', palette: Object.keys(brand.palettes)[0] }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
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
    try { onCreated(await api('POST', '/api/carousels', { brand: brand.id, ...form }, { signal: controller.current.signal })); }
    catch (e) { setError(e.name === 'AbortError' ? 'Creation cancelled. Your brief is kept here.' : e.message); }
    finally { setBusy(false); }
  };
  return html`<form class="carousel-setup panel-card" onSubmit=${submit}>
    <div class="carousel-intro"><span class="carousel-emblem"><${Icon} name="layers" size=${28} /></span><h2>One story. One swipe at a time.</h2><p class="muted">Give ${assistantName(settings)} an idea. Get a connected sequence that opens with a hook and ends with your call to action.</p></div>
    ${error && html`<p class="brand-import-error" role="alert">${error}</p>`}
    <fieldset disabled=${busy}>
      <${Field} label="What story should these slides tell?"><textarea ref=${briefRef} required rows="4" maxLength="3000" value=${form.prompt} onInput=${e => change({ prompt: e.target.value })} placeholder="For example: explain why professional property photography helps listings stand out. Teach local agents three practical ideas, then invite them to book a shoot." /><//>
      <div class="two"><${Field} label="Number of slides" hint="Includes the hook and final CTA"><input type="number" required min="2" max="20" value=${form.count} onInput=${e => change({ count: Number(e.target.value) })} /><//><${Field} label="Slide size"><select value=${form.format} onChange=${e => change({ format: e.target.value })}><option value="ig-portrait">Portrait · 4:5</option><option value="ig-square">Square · 1:1</option><option value="linkedin-sq">LinkedIn square · 1:1</option></select><//></div>
      <${Field} label="Final call to action"><input required maxLength="100" value=${form.cta} onInput=${e => change({ cta: e.target.value })} placeholder="Book your shoot" /><//>
      <${Field} label="Brand colourway"><select value=${form.palette} onChange=${e => change({ palette: e.target.value })}>${Object.keys(brand.palettes).map(p => html`<option value=${p}>${p}</option>`)}</select><//>
    </fieldset>
    <div class="carousel-story-map"><span>01 / Hook</span><span>→</span><span>Build the story</span><span>→</span><span>Final CTA</span></div>
    ${busy ? html`<div class="carousel-building" role="status"><span class="spin"></span><div><strong>Writing your ${form.count}-slide story…</strong><p>Your assistant is connecting the ideas and shaping the final CTA. This can take a few minutes.</p></div><button type="button" class="btn" onClick=${() => controller.current?.abort()}>Cancel</button></div>` : html`<div class="row end">${onCancel && html`<button type="button" class="btn" onClick=${onCancel}>Back to carousel</button>`}<button class="btn primary" disabled=${!assistantReady(settings) || !form.prompt.trim() || !form.cta.trim()}><${Icon} name="sparkles" />Build carousel</button></div>`}
    ${!assistantReady(settings) && html`<p class="small muted">Connect your assistant in Settings to create a carousel.</p>`}
    <p class="small muted">Every slide can be edited separately afterwards. Creation saves your carousel; it does not publish or export it.</p>
  </form>`;
}

function SlideEditor({ carousel, index, onSaved, leaveRef, onBusy }) {
  const { brand, meta, settings, reload } = useApp();
  const original = carousel.slides[index];
  const key = `carousel.draft.${carousel.id}.${original.id}`;
  const cached = useRef(store.get(key));
  const compatible = cached.current && JSON.stringify(cached.current.base) === JSON.stringify(original);
  const [draft, setDraft] = useState(() => compatible ? cached.current.slide : original);
  const [recovery, setRecovery] = useState(() => cached.current && !compatible ? cached.current : null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [instruction, setInstruction] = useState(''), [suggestion, setSuggestion] = useState(null);
  const [imageModal, setImageModal] = useState(false);
  const aiRef = useRef(null);
  const controller = useRef(null), frameRef = useRef(null);
  const [previewWidth, setPreviewWidth] = useState(400);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  useEffect(() => {
    if (dirty) store.set(key, { base: original, slide: draft });
    else if (!recovery) try { localStorage.removeItem(`adgen.${key}`); } catch {}
  }, [draft, original, recovery]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(Math.max(120, Math.min(460, entry.contentRect.width - 32))));
    observer.observe(frameRef.current); return () => observer.disconnect();
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const focus = () => { aiRef.current?.scrollIntoView({ block: 'center' }); aiRef.current?.focus({ preventScroll: true }); };
    addEventListener('chef:carousel-ai', focus); return () => removeEventListener('chef:carousel-ai', focus);
  }, []);
  useEffect(() => { onBusy(!!busy); return () => onBusy(false); }, [busy]);
  const patch = (values) => { setDraft(d => ({ ...d, content: { ...d.content, ...values } })); setSuggestion(null); };
  const save = async () => {
    if (!dirty) return carousel;
    setBusy('Saving slide…'); setError('');
    try {
      const saved = await api('PUT', `/api/carousels/${carousel.id}/slides/${original.id}`, { revision: carousel.revision, palette: draft.palette, content: draft.content });
      setDraft(saved.slides[index]); onSaved(saved); setRecovery(null);
      try { localStorage.removeItem(`adgen.${key}`); } catch {}
      return saved;
    } catch (e) { setError(e.message); throw e; }
    finally { setBusy(''); }
  };
  leaveRef.current = save;
  const refine = async () => {
    if (busy || !instruction.trim()) return;
    try {
      const current = await save();
      setBusy(`Rewriting slide ${index + 1}…`); setError(''); setSuggestion(null);
      controller.current = new AbortController();
      const result = await api('POST', `/api/carousels/${carousel.id}/slides/${original.id}/refine`, { revision: current.revision, prompt: instruction }, { signal: controller.current.signal });
      setSuggestion(result.content);
    } catch (e) { setError(e.name === 'AbortError' ? 'Rewrite cancelled. Your slide is unchanged.' : e.message); }
    finally { setBusy(''); }
  };
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy('Uploading image…'); setError('');
    try { const result = await uploadFile(brand.id, file); patch({ background: result.ref }); await reload(); }
    catch (e) { setError(e.message); } finally { setBusy(''); e.target.value = ''; }
  };
  return html`<section class="carousel-editor">
    <div class="carousel-canvas" ref=${frameRef}>
      <div class="carousel-canvas-label"><span>Slide ${index + 1} of ${carousel.slides.length}</span><b>${roleName[original.role]}</b></div>
      <${AdFrame} still req=${requestFor(carousel, suggestion ? { ...draft, content: suggestion } : draft, index, meta)} fit=${{ width: previewWidth, height: 560 }} />
      <p class="small muted">${suggestion ? 'Previewing the AI suggestion. Apply it to keep it.' : 'Your edits affect this slide only.'}</p>
    </div>
    <div class="carousel-slide-controls panel-card">
      <div class="row between"><h3>Edit slide ${index + 1}</h3><span class="small muted">${dirty ? 'Unsaved changes' : 'Saved'}</span></div>
      ${error && html`<p class="brand-import-error" role="alert">${error}</p>`}
      ${recovery && html`<div class="brand-import-error">This slide changed since your local draft. <button class="btn small" disabled=${!!busy} onClick=${() => { setDraft(recovery.slide); setRecovery(null); }}>Restore local draft</button><button class="btn small" onClick=${() => setRecovery(null)}>Keep saved version</button></div>`}
      <fieldset disabled=${!!busy || !!suggestion}>
        <${Field} label="Eyebrow"><input maxLength="80" value=${draft.content.eyebrow} onInput=${e => patch({ eyebrow: e.target.value })} /><//>
        <${Field} label="Headline"><textarea rows="2" maxLength="110" value=${draft.content.headline} onInput=${e => patch({ headline: e.target.value })} /><//>
        <${Field} label="Supporting line"><textarea rows="2" maxLength="220" value=${draft.content.subhead} onInput=${e => patch({ subhead: e.target.value })} /><//>
        <${Field} label="Body"><textarea rows="4" maxLength="800" value=${draft.content.body} onInput=${e => patch({ body: e.target.value })} /><//>
        ${original.role === 'cta' && html`<${Field} label="Call to action"><input required maxLength="100" value=${draft.content.cta} onInput=${e => patch({ cta: e.target.value })} /><//>`}
        <${Field} label="Small print or destination"><input maxLength="180" value=${draft.content.footnote} placeholder="e.g. yourbrand.com/book" onInput=${e => patch({ footnote: e.target.value })} /><//>
        <details class="carousel-look"><summary>Look & background</summary>
          <div class="two"><${Field} label="Colourway"><select value=${draft.palette} onChange=${e => setDraft(d => ({ ...d, palette: e.target.value }))}>${Object.keys(brand.palettes).map(p => html`<option value=${p}>${p}</option>`)}</select><//><${Field} label="Alignment"><select value=${draft.content.align} onChange=${e => patch({ align: e.target.value })}><option value="left">Left</option><option value="center">Centre</option></select><//></div>
          <${Field} label="Background style"><select value=${draft.content.bgStyle} onChange=${e => patch({ bgStyle: e.target.value })}>${['solid', 'gradient', 'aurora', 'grid', 'dots', 'spotlight'].map(p => html`<option value=${p}>${p}</option>`)}</select><//>
          <${Field} label="Background image"><select value=${draft.content.background} onChange=${e => patch({ background: e.target.value })}><option value="">No image</option>${brand.assets.filter(a => /\.(png|jpe?g|webp|avif)$/i.test(a)).map(a => html`<option value=${a}>${a.split('/').pop()}</option>`)}</select><//>
          <div class="row"><label class="btn small carousel-upload">Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange=${upload} /></label><button type="button" class="btn small" onClick=${() => setImageModal(true)}><${Icon} name="sparkles" />Create image with AI</button></div>
        </details>
      </fieldset>
      <div class="row end carousel-save"><button class="btn primary" disabled=${!!busy || !dirty || !!suggestion || !draft.content.headline.trim() || (original.role === 'cta' && !draft.content.cta.trim())} onClick=${() => save().catch(() => {})}>Save slide</button></div>
      <section class="carousel-ai"><h3><${Icon} name="sparkles" />Refine just this slide</h3><p class="small muted">${assistantName(settings)} sees the whole sequence for context and rewrites only slide ${index + 1}.</p>
        <textarea ref=${aiRef} aria-label="Instructions for this slide" rows="2" maxLength="2000" disabled=${!!busy} value=${instruction} onInput=${e => setInstruction(e.target.value)} placeholder="Make the headline punchier and the explanation more concrete." />
        ${busy && html`<p class="row small" role="status"><span class="spin"></span>${busy}${busy.startsWith('Rewriting') && html`<button class="btn small" onClick=${() => controller.current?.abort()}>Cancel</button>`}</p>`}
        ${suggestion ? html`<div class="carousel-suggestion"><p class="small">The preview shows the suggested copy. Other slides are unchanged.</p><div class="row"><button class="btn primary" onClick=${() => { setDraft(d => ({ ...d, content: suggestion })); setSuggestion(null); }}>Apply suggestion</button><button class="btn" onClick=${() => setSuggestion(null)}>Discard</button></div></div>` : html`<button class="btn" disabled=${!!busy || !instruction.trim() || !assistantReady(settings)} onClick=${refine}>Rewrite slide ${index + 1}</button>`}
      </section>
    </div>
    ${imageModal && html`<${BackgroundGenerator} brand=${brand} content=${draft.content} palette=${draft.palette} onClose=${() => setImageModal(false)} onApply=${async ref => { patch({ background: ref }); setImageModal(false); await reload(); }} />`}
  </section>`;
}

export function CarouselPage() {
  const { brand, meta } = useApp();
  const [list, setList] = useState([]), [carousel, setCarousel] = useState(null);
  const [setup, setSetup] = useState(false), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0), [busy, setBusy] = useState(false), [switching, setSwitching] = useState(false);
  const [error, setError] = useState(''), [job, setJob] = useState(null);
  const leaveRef = useRef(null), lock = useRef(false);
  const stripRef = useRef(null);
  const loadList = () => api('GET', `/api/carousels?brand=${encodeURIComponent(brand.id)}`).then(setList);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const items = await api('GET', `/api/carousels?brand=${encodeURIComponent(brand.id)}`);
        if (!live) return; setList(items);
        const id = items.find(c => c.id === store.get(`carousel.selected.${brand.id}`))?.id ?? items[0]?.id;
        if (id) { const c = await api('GET', `/api/carousels/${id}`); if (live) { setCarousel(c); setSelected(Math.max(0, Math.min(c.slides.length - 1, Number(store.get(`carousel.slide.${c.id}`, 0)) || 0))); } }
        else setSetup(true);
      } catch (e) { if (live) setError(e.message); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!carousel) return;
    store.set(`carousel.selected.${brand.id}`, carousel.id);
    store.set(`carousel.slide.${carousel.id}`, selected);
    const strip = stripRef.current, thumb = strip?.children[selected];
    if (thumb) strip.scrollLeft = thumb.offsetLeft - strip.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2;
  }, [carousel?.id, selected, setup]);
  useEffect(() => {
    if (job?.status !== 'running') return;
    let live = true;
    const timer = setInterval(async () => {
      try { const next = await api('GET', `/api/jobs/${job.id}`); if (live) setJob(next); }
      catch (e) { if (live) setJob(j => ({ ...j, status: 'error', error: e.message })); }
    }, 1000);
    return () => { live = false; clearInterval(timer); };
  }, [job?.id, job?.status]);
  const transition = async (fn) => {
    if (lock.current || busy) return;
    lock.current = true; setSwitching(true); setError('');
    try { if (!setup) await leaveRef.current?.(); await fn(); }
    catch (e) { setError(e.message); }
    finally { lock.current = false; setSwitching(false); }
  };
  const open = async (id) => { const c = await api('GET', `/api/carousels/${id}`); setCarousel(c); setSelected(Math.max(0, Math.min(c.slides.length - 1, Number(store.get(`carousel.slide.${c.id}`, 0)) || 0))); setSetup(false); setJob(null); };
  const created = (c) => { setCarousel(c); setSelected(0); setSetup(false); setJob(null); loadList().catch(() => {}); };
  const exportAll = () => transition(async () => {
    const result = await api('POST', `/api/carousels/${carousel.id}/export`, {});
    setJob({ id: result.id, status: 'running', done: 0, total: carousel.slides.length });
  });
  if (loading) return html`<div class="page"><p class="muted">Loading carousels…</p></div>`;
  return html`<div class="page"><div class="page-inner carousel-page">
    <div class="page-head"><div><h2>Carousel builder</h2><p class="muted">A story in sequence. Every slide is yours to shape.</p></div><div class="row">
      ${list.length > 0 && html`<select aria-label="Saved carousels" disabled=${busy || switching} value=${carousel?.id || ''} onChange=${e => transition(() => open(e.target.value))}>${list.map(c => html`<option value=${c.id}>${c.title} · ${c.count} slides</option>`)}</select>`}
      ${!setup && html`<button class="btn" disabled=${busy || switching} onClick=${() => transition(() => setSetup(true))}><${Icon} name="plus" />New carousel</button>`}
    </div></div>
    ${error && html`<p class="brand-import-error" role="alert">${error}</p>`}
    ${setup ? html`<${CarouselSetup} onCreated=${created} onCancel=${carousel ? () => setSetup(false) : null} />` : carousel && html`
      <div class="carousel-project"><div><h3>${carousel.title}</h3><p class="small muted">${carousel.slides.length} slides · ${meta.formats[carousel.format].width} × ${meta.formats[carousel.format].height} · Saved on this computer</p></div><button class="btn primary" disabled=${busy || switching || job?.status === 'running'} onClick=${exportAll}><${Icon} name="download" />Export all slides</button></div>
      ${job?.status === 'running' && html`<div class="carousel-export" role="status"><div class="progress"><div style=${{ width: `${job.done / job.total * 100}%` }}></div></div><p class="small">Rendering slide ${Math.min(job.done + 1, job.total)} of ${job.total}…</p></div>`}
      ${job?.status === 'error' && html`<p class="brand-import-error" role="alert">${job.error}</p>`}
      ${job?.status === 'done' && html`<div class="carousel-downloads"><div class="row between"><strong>All ${job.result.total} slides are ready in reading order.</strong><button class="btn small" onClick=${() => api('POST', '/api/open', { path: job.result.dir }).catch(e => toast(e.message, 'err'))}>Open folder</button></div><div class="row">${job.result.files.map(f => html`<a class="btn small" href=${f.url} download>${f.name}</a>`)}</div></div>`}
      <div class="carousel-filmstrip" ref=${stripRef} aria-label="Carousel slides">${carousel.slides.map((slide, index) => html`<button key=${slide.id} class=${`carousel-thumb ${selected === index ? 'selected' : ''}`} aria-label=${`Edit slide ${index + 1}: ${roleName[slide.role]}`} aria-pressed=${selected === index} disabled=${busy || switching} onClick=${() => transition(() => setSelected(index))}>
        <${AdFrame} still req=${requestFor(carousel, slide, index, meta)} fit=${{ width: 132, height: 154 }} /><span><b>${String(index + 1).padStart(2, '0')}</b>${roleName[slide.role]}</span>
      </button>`)}</div>
      <${SlideEditor} key=${`${carousel.id}:${carousel.slides[selected].id}`} carousel=${carousel} index=${selected} onSaved=${c => { setCarousel(c); loadList().catch(() => {}); }} leaveRef=${leaveRef} onBusy=${setBusy} />
    `}
  </div></div>`;
}
