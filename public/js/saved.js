// "Saved & exports" page: saved campaigns (re-open or re-render) and recent export folders.
import { html, useState, useEffect, api, useApp, toast, plural, clean } from './lib.js';

const COPY_KEYS = ['headline', 'eyebrow', 'subhead', 'cta', 'offer', 'attribution', 'rating', 'footnote', 'badge', 'time', 'date'];
const expandFormats = (meta, f) => [].concat(f ?? []).flatMap((x) => meta.groups[x] ?? [x]);

export function SavedPage() {
  const { meta, pickBrand, setTab, setPending } = useApp();
  const [cats, setCats] = useState(null);
  const [exportsList, setExports] = useState(null);
  const [open, setOpen] = useState(null);
  const [cat, setCat] = useState(null);
  const [job, setJob] = useState(null);

  const load = async () => {
    setCats(await api('GET', '/api/catalogs'));
    setExports(await api('GET', '/api/exports'));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (open) api('GET', `/api/catalog/${encodeURIComponent(open)}`).then(setCat); else setCat(null); }, [open]);
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setInterval(async () => {
      const j = await api('GET', `/api/jobs/${job.id}`);
      setJob(j);
      if (j.status === 'done') { toast(`Rendered ${plural(j.result.total, 'file')}`); load(); }
      if (j.status === 'error') toast(j.error, 'err');
    }, 700);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  const settings = (c, item = {}) => ({
    templates: [].concat(item.templates ?? item.template ?? c.defaults?.templates ?? []),
    palettes: [].concat(item.palettes ?? item.palette ?? c.defaults?.palettes ?? []),
    formats: expandFormats(meta, item.formats ?? item.format ?? c.defaults?.formats ?? 'social'),
    campaign: c.campaign ?? open,
  });
  const openItem = (item) => {
    const headlines = [].concat(item.headline ?? []);
    const content = { ...(cat.defaults?.content ?? {}) };
    for (const [k, v] of Object.entries(item)) if (!['id', 'templates', 'template', 'palettes', 'palette', 'formats', 'format', 'variants', 'captions'].includes(k)) content[k] = v;
    content.headline = headlines[0];
    const design = { mode: 'single', content, variants: [...headlines.slice(1), ...(item.variants ?? []).map((v) => v.headline).filter(Boolean)], captions: item.captions ?? {}, ...settings(cat, item) };
    setPending({ brand: cat.brand, design });
    pickBrand(cat.brand);
    setTab('create');
  };
  const openAll = () => {
    const rows = cat.items.map((i) => Object.fromEntries(COPY_KEYS.filter((k) => i[k] != null).map((k) => [k, Array.isArray(i[k]) ? i[k][0] : i[k]])));
    setPending({ brand: cat.brand, design: { mode: 'bulk', rows, content: cat.defaults?.content ?? {}, ...settings(cat) } });
    pickBrand(cat.brand);
    setTab('create');
  };
  const render = async (only) => {
    try {
      const r = await api('POST', `/api/catalog/${encodeURIComponent(open)}/render`, { only });
      setJob({ id: r.id, status: 'running', done: 0, total: 0 });
    } catch (e) { toast(e.message, 'err'); }
  };
  const del = async (id) => {
    if (!confirm(`Remove “${id}” from this campaign?`)) return;
    await api('DELETE', `/api/catalog/${encodeURIComponent(open)}/item/${encodeURIComponent(id)}`);
    setCat(await api('GET', `/api/catalog/${encodeURIComponent(open)}`));
    load();
  };
  const brandName = (id) => meta.brands.find((b) => b.id === id)?.name ?? id;

  return html`
    <div class="page"><div class="page-inner">
      <div class="page-head"><div><h2>Saved & exports</h2><p class="muted">Re-open saved campaigns, re-render them, or find past exports.</p></div></div>
      <div class="saved-page">
      <section class="saved-col">
        <h2>Saved campaigns</h2>
        <p class="muted">Ads you saved with “Save for later”. Re-open to edit, or re-render anytime.</p>
        ${cats === null ? html`<p class="muted">Loading…</p>` : !cats.length ? html`<div class="empty-card">Nothing saved yet.<br />On the Create page, use <b>☆ Save for later</b>.</div>` : html`
          <div class="cat-list">
            ${cats.map((c) => html`
              <button key=${c.name} class=${`cat-row ${open === c.name ? 'on' : ''}`} onClick=${() => setOpen(open === c.name ? null : c.name)}>
                <b>${c.name}</b><span class="muted">${brandName(c.brand)} · ${plural(c.items?.length ?? 0, 'ad')}</span>
              </button>`)}
          </div>`}
        ${cat && html`
          <div class="cat-detail">
            <div class="row between">
              <h3>${open}</h3>
              <div class="row">
                <button class="btn small" onClick=${openAll}>Open all in editor</button>
                <button class="btn small primary" disabled=${job?.status === 'running'} onClick=${() => render()}>Render all</button>
              </div>
            </div>
            ${job?.status === 'running' && html`<div class="progress"><div style=${{ width: `${job.total ? (job.done / job.total) * 100 : 3}%` }}></div></div><p class="muted small">${job.current ?? 'Starting…'}</p>`}
            ${job?.status === 'done' && html`<div class="done-box"><span>✓ ${plural(job.result.total, 'file')} ready</span><button class="btn small" onClick=${() => api('POST', '/api/open', { path: job.result.dir })}>Open folder</button></div>`}
            <div class="cat-items">
              ${cat.items.map((it) => html`
                <div class="cat-item" key=${it.id}>
                  <b>${clean([].concat(it.offer ?? it.headline ?? '')[0])}</b>
                  <span class="muted small">${[].concat(it.headline ?? []).length > 1 ? `${[].concat(it.headline).length} headline versions · ` : ''}${it.id}</span>
                  <div class="row">
                    <button class="btn small" onClick=${() => openItem(it)}>Edit</button>
                    <button class="btn small ghost" onClick=${() => render([it.id])}>Render</button>
                    <button class="btn small ghost danger" onClick=${() => del(it.id)}>Delete</button>
                  </div>
                </div>`)}
            </div>
          </div>`}
      </section>

      <section class="saved-col wide">
        <div class="row between"><h2>Recent exports</h2>
          <button class="btn small" onClick=${() => api('POST', '/api/open', { path: 'output' })}>Open output folder</button></div>
        ${exportsList === null ? html`<p class="muted">Loading…</p>` : !exportsList.length ? html`<div class="empty-card">No exports yet.</div>` : html`
          <div class="export-grid">
            ${exportsList.map((x) => html`
              <div class="export-card" key=${x.dir}>
                <div class="export-thumb">${x.thumb ? html`<img src=${x.thumb} loading="lazy" />` : html`<span>▶</span>`}</div>
                <div class="export-meta">
                  <b>${x.campaign}</b>
                  <span class="muted small">${brandName(x.brand)} · ${plural(x.ads, 'ad')} · ${plural(x.files, 'file')}</span>
                  <span class="muted small">${new Date(x.modified).toLocaleString()}</span>
                  <div class="row">
                    <button class="btn small" onClick=${() => api('POST', '/api/open', { path: x.dir })}>Open</button>
                    ${x.csv && html`<a class="btn small ghost" href=${x.csv} download>CSV</a>`}
                  </div>
                </div>
              </div>`)}
          </div>`}
      </section>
      </div>
    </div></div>`;
}
