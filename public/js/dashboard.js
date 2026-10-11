// Dashboard: every brand at a glance (with a live preview of what you last made for it),
// saved campaigns and recent exports, in one grid.
import { html, useState, useEffect, api, store, useApp, AdFrame, plural, toast } from './lib.js';
import { Icon } from './icons.js';

const ago = (ms) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

/** What to show for a brand: the design last worked on in this browser, else a simple sample. */
function brandPreview(brand, meta) {
  const saved = store.get(`design.${brand.id}`);
  const known = new Set(meta.templates.map((t) => t.id));
  const template = [].concat(saved?.templates ?? brand.defaults?.templates ?? []).find((t) => known.has(t)) ?? 'headline';
  const palette = [].concat(saved?.palettes ?? []).find((p) => brand.palettes[p]) ?? Object.keys(brand.palettes)[0];
  const content = saved?.content?.headline
    ? { ...saved.content, animation: 'none', effects: undefined, ctaFx: undefined }
    : { eyebrow: brand.handle || brand.name, headline: brand.tagline ? `${brand.tagline}` : 'Say it *big*.', cta: 'Shop now' };
  return { template, palette, content, edited: !!saved?.content?.headline };
}

export function DashboardPage() {
  const { meta, pickBrand, setTab, openNewBrand, setPending } = useApp();
  // Load an export's design back into the builder (exact design if saved with it, else rebuilt).
  const reopen = async (e) => {
    try {
      const r = await api('GET', `/api/exports/design?dir=${encodeURIComponent(e.dir)}`);
      if (!meta.brands.some((b) => b.id === r.brand)) throw new Error(`The brand "${r.brand}" no longer exists`);
      setPending({ brand: r.brand, design: r.design });
      pickBrand(r.brand);
      setTab('create');
      toast(r.from === 'saved' ? `Opened "${e.campaign}" in the builder` : `Opened "${e.campaign}" (rebuilt from the export)`);
    } catch (err) { toast(err.message, 'err'); }
  };
  const [cats, setCats] = useState(null);
  const [exportsList, setExports] = useState(null);
  useEffect(() => {
    api('GET', '/api/catalogs').then(setCats).catch(() => setCats([]));
    api('GET', '/api/exports').then(setExports).catch(() => setExports([]));
  }, []);
  const go = (id, tab) => { pickBrand(id); setTab(tab); };
  const fmt = meta.formats['ig-portrait'];
  return html`
    <div class="page"><div class="page-inner dash">
      <div class="dash-head">
        <div><h2>Dashboard</h2><p class="muted">${plural(meta.brands.length, 'brand')} · ${plural(cats?.length ?? 0, 'saved campaign')} · ${plural(exportsList?.length ?? 0, 'export')}</p></div>
        <button class="btn primary" onClick=${openNewBrand}><${Icon} name="plus" size=${15} /> New brand</button>
      </div>

      <h4>Brands</h4>
      <div class="dash-grid">
        ${meta.brands.map((b) => {
          const pv = brandPreview(b, meta);
          const campaigns = (cats ?? []).filter((c) => c.brand === b.id).length;
          const exps = (exportsList ?? []).filter((e) => e.brand === b.id);
          return html`
            <div class="dash-card" key=${b.id}>
              <button type="button" class="dash-preview" onClick=${() => go(b.id, 'create')} title="Open in Create">
                <${AdFrame} still req=${{ brand: b.id, template: pv.template, palette: pv.palette, format: 'ig-portrait', formatInfo: fmt, content: pv.content }} fit=${{ width: 200, height: 250 }} />
              </button>
              <div class="dash-info">
                <div class="row between nowrap"><b class="ellipsis">${b.name}</b><span class="swatch-row">${Object.values(b.palettes).slice(0, 5).map((p, i) => html`<i key=${i} style=${{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.accent} 50%)` }}></i>`)}</span></div>
                <small class="muted ellipsis">${b.tagline || b.handle || ' '}</small>
                <small class="faint">${plural(Object.keys(b.palettes).length, 'colourway')} · ${plural(b.assets.filter((a) => !/logo/i.test(a)).length, 'photo/video')} · ${plural(campaigns, 'campaign')}${exps[0] ? ` · exported ${ago(exps[0].modified)}` : ''}</small>
                <div class="row">
                  <button class="btn small primary" onClick=${() => go(b.id, 'create')}><${Icon} name="sparkles" size=${13} /> Create</button>
                  <button class="btn small" onClick=${() => go(b.id, 'brands')}>Brand kit</button>
                </div>
              </div>
            </div>`;
        })}
        <button type="button" class="dash-card dash-new" onClick=${openNewBrand}><${Icon} name="plus" size=${26} /><span>New brand</span></button>
      </div>

      <h4>Saved campaigns</h4>
      ${cats === null ? html`<p class="muted">Loading…</p>` : cats.length === 0
        ? html`<p class="muted small">Nothing saved yet. In Create, press <b>Save for later</b> to keep a campaign here.</p>`
        : html`<div class="dash-list">${cats.map((c) => html`
            <button type="button" class="dash-row" key=${c.name} onClick=${() => { pickBrand(c.brand); setTab('saved'); }}>
              <span class="dash-dot"><${Icon} name="folder" size=${15} /></span>
              <span class="grow ellipsis"><b>${c.campaign ?? c.name}</b> <span class="muted small">· ${meta.brands.find((b) => b.id === c.brand)?.name ?? c.brand}</span></span>
              <span class="muted small">${plural(c.items.length, 'ad')}</span>
            </button>`)}</div>`}

      <h4>Recent exports</h4>
      ${exportsList === null ? html`<p class="muted">Loading…</p>` : exportsList.length === 0
        ? html`<p class="muted small">No exports yet.</p>`
        : html`<div class="dash-exports">${exportsList.slice(0, 12).map((e) => html`
            <div class="dash-export" key=${e.dir}>
              <button type="button" class="dash-export-pic" onClick=${() => reopen(e)} title="Open in the builder to reuse or change it">
                ${e.thumb ? html`<img src=${e.thumb} loading="lazy" />` : html`<span class="noimg"><${Icon} name="film" /></span>`}
              </button>
              <b class="ellipsis">${e.campaign}</b>
              <small class="muted">${meta.brands.find((b) => b.id === e.brand)?.name ?? e.brand} · ${plural(e.files, 'file')} · ${ago(e.modified)}</small>
              <div class="row nowrap">
                ${e.ads > 0 && html`<button class="btn small primary grow" onClick=${() => reopen(e)}><${Icon} name="sparkles" size=${13} /> Edit in builder</button>`}
                <button class="icon-btn" title="Open folder" onClick=${() => api('POST', '/api/open', { path: e.dir })}><${Icon} name="folder" size=${15} /></button>
              </div>
            </div>`)}</div>`}
    </div></div>`;
}
