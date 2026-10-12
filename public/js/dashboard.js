// Dashboard, organised around your work: quick actions, the design you're in the middle of,
// everything you've made recently (exports, carousels, saved campaigns), then your brands.
import { html, useState, useEffect, api, store, useApp, AdFrame, plural, toast } from './lib.js';
import { Icon } from './icons.js';
import { carouselToDesign } from './carousel-design.js';

const ago = (ms) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const plain = (s) => String(s ?? '').replace(/[*_|]/g, ' ').replace(/\s+/g, ' ').trim();
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const KIND = { export: ['download', 'Export'], carousel: ['layers', 'Carousel'], campaign: ['folder', 'Saved campaign'] };

/** The design you were last working on for a brand (newest of this browser's copy and the shared one). */
function currentDesign(brandId, workspace) {
  const local = store.get(`design.${brandId}`);
  const localAt = store.get(`designAt.${brandId}`, 0);
  if (workspace?.brand === brandId && workspace.design && (workspace.updatedAt ?? 0) >= localAt) return { design: workspace.design, focus: workspace.focus ?? {}, at: workspace.updatedAt };
  return local ? { design: local, focus: store.get(`focus.${brandId}`, {}), at: localAt } : null;
}

export function DashboardPage() {
  const { meta, brand, pickBrand, setTab, openNewBrand, setPending, workspace } = useApp();
  const [cats, setCats] = useState(null);
  const [exportsList, setExports] = useState(null);
  const [carousels, setCarousels] = useState(null);
  useEffect(() => {
    api('GET', '/api/catalogs').then(setCats).catch(() => setCats([]));
    api('GET', '/api/exports').then(setExports).catch(() => setExports([]));
    Promise.all(meta.brands.map((b) => api('GET', `/api/carousels?brand=${encodeURIComponent(b.id)}`).then((l) => l.map((c) => ({ ...c, brand: b.id }))).catch(() => [])))
      .then((ls) => setCarousels(ls.flat())).catch(() => setCarousels([]));
  }, []);
  const brandName = (id) => meta.brands.find((b) => b.id === id)?.name ?? id;
  const openDesign = (brandId, design, msg) => {
    setPending({ brand: brandId, design });
    pickBrand(brandId);
    setTab('create');
    if (msg) toast(msg);
  };

  // Quick actions open Create in the right mode, keeping the copy you already have.
  const cur = currentDesign(brand.id, workspace);
  const startMode = (mode) => {
    const d = cur?.design ?? {};
    if (mode === 'carousel' && !d.slides?.length) {
      return openDesign(brand.id, { ...d, mode, variants: [], templates: ['carousel-slide'], formats: [d.formats?.[0] || 'ig-portrait'], carousel: {}, slides: [] });
    }
    return openDesign(brand.id, { ...d, mode });
  };

  // Everything recent in one list, newest first.
  const reopenExport = async (e) => {
    try {
      const r = await api('GET', `/api/exports/design?dir=${encodeURIComponent(e.dir)}`);
      if (!meta.brands.some((b) => b.id === r.brand)) throw new Error(`The brand "${r.brand}" no longer exists`);
      openDesign(r.brand, r.design, r.from === 'saved' ? `Opened "${e.campaign}" in the builder` : `Opened "${e.campaign}" (rebuilt from the export)`);
    } catch (err) { toast(err.message, 'err'); }
  };
  const openCarousel = async (c) => {
    try { openDesign(c.brand, carouselToDesign(await api('GET', `/api/carousels/${c.id}`)), `Opened carousel "${c.title}"`); } catch (err) { toast(err.message, 'err'); }
  };
  const loading = exportsList === null || carousels === null || cats === null;
  const recent = loading ? [] : [
    ...exportsList.filter((e) => e.ads > 0).map((e) => ({ kind: 'export', key: `e:${e.dir}`, title: e.campaign, brand: e.brand, at: e.modified, thumb: e.thumb, meta: plural(e.files, 'file'), open: () => reopenExport(e), folder: () => api('POST', '/api/open', { path: e.dir }) })),
    ...carousels.map((c) => ({ kind: 'carousel', key: `c:${c.id}`, title: c.title, brand: c.brand, at: c.updatedAt, meta: plural(c.count, 'slide'), open: () => openCarousel(c) })),
    ...cats.map((c) => ({ kind: 'campaign', key: `s:${c.name}`, title: c.campaign ?? c.name, brand: c.brand, at: 0, meta: plural(c.items.length, 'ad'), open: () => { pickBrand(c.brand); setTab('saved'); } })),
  ].sort((a, b) => b.at - a.at).slice(0, 12);

  const fmtId = cur?.focus?.format && meta.formats[cur.focus.format] ? cur.focus.format : cur?.design?.formats?.[0] ?? 'ig-square';
  const curContent = cur?.design && (cur.design.mode === 'carousel' && cur.design.slides?.length
    ? cur.design.slides[cur.design.slideIndex ?? 0]?.content
    : cur.design.mode === 'bulk' ? { ...cur.design.content, ...(cur.design.rows ?? []).find((r) => (r.headline ?? '').trim()) } : cur.design.content);
  const known = new Set(meta.templates.map((t) => t.id));
  const curTemplate = [cur?.focus?.template, ...(cur?.design?.templates ?? [])].find((t) => known.has(t)) ?? 'headline';
  const curPalette = [cur?.focus?.palette, ...(cur?.design?.palettes ?? [])].find((p) => brand.palettes[p]) ?? Object.keys(brand.palettes)[0];
  const modeLabel = { single: 'One ad', bulk: 'Bulk ads', carousel: 'Carousel' }[cur?.design?.mode] ?? 'One ad';

  return html`
    <div class="page"><div class="page-inner dash">
      <div class="dash-head">
        <div><h2>${greeting()}</h2><p class="muted">What are we cooking for ${brand.name} today?</p></div>
      </div>

      <div class="dash-actions">
        <button class="dash-action" onClick=${() => startMode('single')}><span class="ic"><${Icon} name="sparkles" /></span><b>Create an ad</b><small>One message in every size</small></button>
        <button class="dash-action" onClick=${() => startMode('carousel')}><span class="ic"><${Icon} name="layers" /></span><b>Build a carousel</b><small>A story across slides</small></button>
        <button class="dash-action" onClick=${() => startMode('bulk')}><span class="ic"><${Icon} name="grid" /></span><b>Bulk ads</b><small>Many messages at once</small></button>
        <button class="dash-action" onClick=${() => setTab('video')}><span class="ic"><${Icon} name="film" /></span><b>Edit a video</b><small>Trim and crop clips</small></button>
      </div>

      ${cur?.design && html`
        <h4>Continue where you left off</h4>
        <div class="dash-continue">
          <button type="button" class="dash-continue-pic" onClick=${() => setTab('create')} title="Continue editing">
            <${AdFrame} still req=${{ brand: brand.id, template: curTemplate, palette: curPalette, format: fmtId, formatInfo: meta.formats[fmtId], content: { ...curContent, animation: 'none', effects: undefined, ctaFx: undefined } }} fit=${{ width: 260, height: 220 }} />
          </button>
          <div class="dash-continue-info">
            <span class="dash-kind"><${Icon} name="sparkles" size=${12} /> ${modeLabel} · ${brand.name}</span>
            <h3 class="ellipsis">${plain(curContent?.headline) || 'Untitled design'}</h3>
            <p class="muted small">${plural(cur.design.templates?.length ?? 1, 'template')} · ${plural(cur.design.palettes?.length ?? 1, 'colourway')} · ${plural(cur.design.formats?.length ?? 0, 'size')}${cur.at ? ` · edited ${ago(cur.at)}` : ''}</p>
            <div class="row"><button class="btn primary" onClick=${() => setTab('create')}><${Icon} name="sparkles" size=${14} /> Continue editing</button></div>
          </div>
        </div>`}

      <h4>Recent work</h4>
      ${loading ? html`<p class="muted">Loading…</p>` : recent.length === 0
        ? html`<p class="muted small">Nothing yet. Exports, carousels and saved campaigns show up here so you can reopen and reuse them.</p>`
        : html`<div class="dash-exports">${recent.map((w) => html`
            <div class="dash-export" key=${w.key}>
              <button type="button" class="dash-export-pic" onClick=${w.open} title="Open in the builder">
                ${w.thumb ? html`<img src=${w.thumb} loading="lazy" />` : html`<span class="noimg kind-${w.kind}"><${Icon} name=${KIND[w.kind][0]} size=${22} /></span>`}
              </button>
              <span class="dash-kind"><${Icon} name=${KIND[w.kind][0]} size=${11} /> ${KIND[w.kind][1]}</span>
              <b class="ellipsis">${w.title}</b>
              <small class="muted ellipsis">${brandName(w.brand)} · ${w.meta}${w.at ? ` · ${ago(w.at)}` : ''}</small>
              <div class="row nowrap">
                <button class="btn small primary grow" onClick=${w.open}>${w.kind === 'campaign' ? 'Open' : 'Edit in builder'}</button>
                ${w.folder && html`<button class="icon-btn" title="Open folder" onClick=${w.folder}><${Icon} name="folder" size=${15} /></button>`}
              </div>
            </div>`)}</div>`}

      <h4 class="h-row">Brands <span class="push"><button class="btn small soft" onClick=${openNewBrand}><${Icon} name="plus" size=${14} /> New brand</button></span></h4>
      <div class="dash-brands">
        ${meta.brands.map((b) => html`
          <div class="dash-brand ${b.id === brand.id ? 'on' : ''}" key=${b.id}>
            <span class="dash-brand-mark" style=${{ background: Object.values(b.palettes)[0]?.accent }}>${b.name.trim()[0]}</span>
            <div class="grow">
              <b class="ellipsis">${b.name}</b>
              <span class="swatch-row">${Object.values(b.palettes).slice(0, 6).map((p, i) => html`<i key=${i} style=${{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.accent} 50%)` }}></i>`)}</span>
            </div>
            <div class="row nowrap">
              <button class="btn small primary" onClick=${() => { pickBrand(b.id); setTab('create'); }}>Create</button>
              <button class="btn small" onClick=${() => { pickBrand(b.id); setTab('brands'); }}>Brand kit</button>
            </div>
          </div>`)}
      </div>
    </div></div>`;
}
