// The "Create ads" page: guided steps (Words → Look → Motion → Sizes), live preview, export.
import {
  html, useState, useEffect, useRef, useMemo, api, store, useApp, AdFrame, Modal, Section, Field, Toggle, Segmented,
  RatioIcon, toast, uploadFile, isVideo, brandAssetUrl, plural, clean, useDebounced, CLIENT_ID,
} from './lib.js';
import { createPortal } from 'preact';
import { BulkTable, BULK_FIELDS } from './bulk.js';
import { PaletteCard, PalettesModal, GeneratorModal, brandForSave, slug } from './palette-ui.js';
import { Icon } from './icons.js';
import { glowColors } from './color.js';
import { assistantName } from './assistant.js';

export const PLATFORM_GROUPS = [
  ['Instagram', ['ig-square', 'ig-portrait', 'story']],
  ['TikTok', ['tiktok']],
  ['Facebook', ['fb-feed', 'fb-square']],
  ['X / Twitter', ['x-post']],
  ['LinkedIn', ['linkedin', 'linkedin-sq']],
  ['Pinterest', ['pinterest']],
  ['YouTube', ['yt-thumb']],
  ['Web banner', ['display-mrec']],
];
const SHORT = {
  'ig-square': 'Square post', 'ig-portrait': 'Portrait post', story: 'Story / Reel', tiktok: 'TikTok video', 'fb-feed': 'Feed / link',
  'fb-square': 'Square post', 'x-post': 'Post image', linkedin: 'Feed post', 'linkedin-sq': 'Square post', pinterest: 'Pin', 'yt-thumb': 'Thumbnail', 'display-mrec': '300×250 ad',
};
const EXTRA_FIELDS = {
  body: { label: 'Body text', placeholder: 'A paragraph of genuinely useful text. Leave a blank line for a new paragraph.', rows: 5, for: 'value posts' },
  points: { label: 'List points', placeholder: 'One point per line\nTitle: detail bolds the title', rows: 5, for: 'List / Notes / Menu / Poll / Chat' },
  stat: { label: 'Big number', placeholder: '73%', for: 'Big Stat' },
  source: { label: 'Source', placeholder: 'Specialty Coffee Association, 2025', for: 'Big Stat' },
  leftTitle: { label: 'Left column title', placeholder: 'Myth', for: 'This vs That' },
  leftPoints: { label: 'Left column points', placeholder: 'One per line', rows: 3, for: 'This vs That' },
  rightTitle: { label: 'Right column title', placeholder: 'Fact', for: 'This vs That' },
  rightPoints: { label: 'Right column points', placeholder: 'One per line', rows: 3, for: 'This vs That' },
  checked: { label: 'Ticked items', placeholder: '0', type: 'number', for: 'Notes' },
  handle: { label: 'Handle', placeholder: '@yourbrand', for: 'value posts' },
  offer: { label: 'Big offer text', placeholder: '30% OFF', for: 'Offer / Ticket / Spotlight' },
  attribution: { label: 'Who said it', placeholder: '— Sam R., verified buyer', for: 'Quote' },
  rating: { label: 'Star rating (1–5)', placeholder: '5', type: 'number', for: 'Quote' },
  badge: { label: 'Bubble badge', placeholder: 'NEW', for: 'Liquid Glass' },
  time: { label: 'Time', placeholder: '7pm – late', for: 'Event / Ticket / Notification' },
  date: { label: 'Date', placeholder: 'Sat 18 Oct', for: 'Event / Ticket / Newspaper / Notification' },
};
const BG_SWATCH = {
  solid: (p) => p.bg,
  gradient: (p) => { const g = glowColors(p); return `linear-gradient(160deg, ${g[0]}, ${g[1]} 48%, ${g[3]})`; },
  aurora: (p) => { const g = glowColors(p); return `radial-gradient(circle at 25% 25%, ${g[0]}, transparent 60%), radial-gradient(circle at 80% 70%, ${g[1]}, transparent 55%), radial-gradient(circle at 30% 95%, ${g[2]}, transparent 55%), ${g[3]}`; },
  spotlight: (p) => `radial-gradient(ellipse at 50% 0%, ${p.accent}, ${p.bg} 70%)`,
  grid: (p) => `linear-gradient(${p.fg}33 1px, transparent 1px) 0 0/8px 8px, linear-gradient(90deg, ${p.fg}33 1px, ${p.bg} 1px) 0 0/8px 8px`,
  dots: (p) => `radial-gradient(${p.fg}55 1.2px, ${p.bg} 1.6px) 0 0/7px 7px`,
};
const ANIM_ICON = { none: 'square', 'fade-up': 'layers', typewriter: 'type', 'word-rise': 'bolt', pop: 'sparkles', wipe: 'film' };
const FX_ICON = { glimmer: 'sparkles', holo: 'wand' };
const isAnimated = (c) => (c.animation ?? 'none') !== 'none' || (c.effects ?? []).length > 0 || !!c.ctaFx || (c.decor ?? []).length > 0 || isVideo(c.background);
// Which content field holds the text of each clickable element (for editing text in the inspector).
const ROLE_TEXT = { headline: 'headline', offer: 'offer', eyebrow: 'eyebrow', subhead: 'subhead', cta: 'cta', attribution: 'attribution', footnote: 'footnote', clock: 'time', body: 'body', points: 'points', stat: 'stat', link: 'cta', handle: 'handle' };

const nonEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
const hasCopy = (r) => (r.headline ?? '').trim() || (r.offer ?? '').trim();

function defaults(brand, meta, settings) {
  const d = brand.defaults ?? {};
  const fm = typeof d.formats === 'string' ? meta.groups[d.formats] : d.formats;
  return {
    mode: 'single',
    content: {
      eyebrow: 'New this season', headline: 'Say it *big*.', subhead: 'One supporting line that sells it.', cta: 'Shop now',
      animation: 'none', duration: 6,
    },
    variants: [],
    rows: [{ headline: 'Your first headline' }, { headline: 'A *second* idea' }, { headline: 'One more angle' }],
    templates: [].concat(d.templates ?? ['headline']).slice(0, 1), // one template by default; "Several" is opt-in
    pick: { templates: 'one', palettes: 'one' },
    palettes: [Object.keys(brand.palettes)[0]],
    formats: fm ?? meta.groups.social,
    campaign: 'my-campaign',
    output: { type: settings?.export?.type ?? 'png', scale: settings?.export?.scale ?? 1, video: false, still: true },
    captions: {},
  };
}

function sanitize(d, brand, meta) {
  const ok = (list, valid, fallback) => { const l = (list ?? []).filter((x) => valid.includes(x)); return l.length ? l : fallback; };
  const pals = Object.keys(brand.palettes);
  return {
    ...d,
    templates: ok(d.templates, meta.templates.map((t) => t.id), ['headline']),
    palettes: ok(d.palettes, pals, [pals[0]]),
    formats: (d.formats ?? []).filter((f) => meta.formats[f]),
    // "Several" whenever more than one is selected (e.g. Claude picked several), else what the user chose.
    pick: Object.fromEntries(['templates', 'palettes'].map((k) => [k, (d[k]?.length ?? 0) > 1 ? 'many' : d.pick?.[k] ?? 'one'])),
    output: { type: 'png', scale: 1, video: false, still: true, ...d.output },
  };
}

/**
 * The design being edited, plus what's in focus. It's kept in three places:
 *  - React state (instant UI),
 *  - localStorage per brand (survives reloads),
 *  - the server workspace (so Claude can see it), which also delivers Claude's edits back here.
 */
function useDesign() {
  const { brand, meta, pending, setPending, settings, workspace } = useApp();
  const key = `design.${brand.id}`;
  const fromWorkspace = workspace?.brand === brand.id && workspace.design;
  const [d, setD] = useState(() => sanitize(
    pending?.brand === brand.id ? { ...defaults(brand, meta, settings), ...pending.design }
      : fromWorkspace ? { ...defaults(brand, meta, settings), ...workspace.design }
        : store.get(key) ?? defaults(brand, meta, settings),
    brand, meta,
  ));
  const [focus, setFocus] = useState(() => (fromWorkspace ? workspace.focus ?? {} : {}));
  const skipSync = useRef(false);
  const seen = useRef(workspace?.updatedAt);

  useEffect(() => { if (pending) setPending(null); }, []);
  useEffect(() => { setD((x) => sanitize(x, brand, meta)); }, [Object.keys(brand.palettes).join()]);
  useEffect(() => { store.set(key, d); }, [d]);

  // Apply edits made elsewhere (Claude, another tab) when the workspace changes.
  useEffect(() => {
    if (!workspace || workspace.updatedAt === seen.current) return;
    seen.current = workspace.updatedAt;
    if (workspace.source === CLIENT_ID || workspace.brand !== brand.id || !workspace.design) return;
    skipSync.current = true;
    setD(sanitize({ ...defaults(brand, meta, settings), ...workspace.design }, brand, meta));
    setFocus(workspace.focus ?? {});
  }, [workspace?.updatedAt]);

  // Publish our edits (debounced) so Claude always sees the current design.
  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return undefined; }
    const t = setTimeout(() => {
      api('PUT', '/api/workspace', { brand: brand.id, design: d, focus, source: CLIENT_ID }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [d, focus]);

  // Undo / redo. Rapid edits (typing, dragging a slider) are grouped into one step.
  const hist = useRef({ past: [], future: [], last: null, burstStart: null, timer: null, applying: false });
  const [, bump] = useState(0);
  const commit = () => {
    const h = hist.current;
    if (!h.timer) return;
    clearTimeout(h.timer);
    h.timer = null;
    h.past.push(h.burstStart);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    bump((n) => n + 1);
  };
  useEffect(() => {
    const h = hist.current;
    if (h.last === null || h.applying) { h.applying = false; h.last = d; return; }
    if (!h.timer) h.burstStart = h.last;
    clearTimeout(h.timer);
    h.timer = setTimeout(commit, 450);
    h.last = d;
  }, [d]);
  const step = (from, to) => {
    commit();
    const h = hist.current;
    if (!h[from].length) return;
    h[to].push(h.last);
    h.applying = true;
    setD(h[from].pop());
    bump((n) => n + 1);
  };
  const history = {
    undo: () => step('past', 'future'),
    redo: () => step('future', 'past'),
    canUndo: hist.current.past.length > 0 || !!hist.current.timer,
    canRedo: hist.current.future.length > 0,
  };
  // Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y. Text fields keep their own native undo.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); history.redo(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const set = (patch) => setD((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  const setContent = (patch) => setD((prev) => ({ ...prev, content: nonEmpty({ ...prev.content, ...patch }) }));
  return [d, set, setContent, focus, setFocus, history];
}

// ── Step 1: Words ────────────────────────────────────────────────────────────

function TextField({ label, hint, value, onInput, placeholder, rows, type }) {
  return html`<${Field} label=${label} hint=${hint}>
    ${rows
      ? html`<textarea rows=${rows} value=${value ?? ''} placeholder=${placeholder} onInput=${(e) => onInput(e.target.value)}></textarea>`
      : html`<input type=${type ?? 'text'} value=${value ?? ''} placeholder=${placeholder} onInput=${(e) => onInput(type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value)} />`}
  <//>`;
}

/**
 * AI copywriting: one click writes copy for the fields the chosen templates use, from the
 * brand voice and current copy; an optional brief steers it. Only ever changes the words.
 */
function WriteWithAssistant({ d, set }) {
  const { brand, settings } = useApp();
  const name = assistantName(settings);
  const bulk = d.mode === 'bulk';
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [versions, setVersions] = useState(null); // null = as many as there are now
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState(null);
  const nVersions = versions ?? d.variants.filter((v) => v.trim()).length;
  const nRows = count ?? Math.max(3, d.rows.filter(hasCopy).length);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api('POST', '/api/copy', {
        brand: brand.id, mode: d.mode, templates: d.templates, content: d.content, prompt: prompt.trim() || undefined,
        rows: bulk ? d.rows.filter(hasCopy).map(nonEmpty) : undefined, versions: bulk ? 0 : nVersions, count: nRows,
      });
      setUndo({ content: d.content, variants: d.variants, rows: d.rows });
      set((prev) => ({
        content: nonEmpty({ ...prev.content, ...r.content }),
        ...(bulk && r.rows?.length ? { rows: r.rows } : {}),
        ...(!bulk && nVersions > 0 ? { variants: r.versions ?? [] } : {}),
      }));
      toast(bulk ? `${name} wrote ${plural(r.rows?.length ?? 0, 'ad')}` : `${name} rewrote your copy`);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  const opts = (list, value, onChange) => html`<div class="seg mini">${list.map((n) => html`<button type="button" class=${n === value ? 'on' : ''} onClick=${() => onChange(n)}>${n}</button>`)}</div>`;
  return html`
    <div class="ai-write">
      <div class="row nowrap">
        <button class="btn ai grow" onClick=${run} disabled=${busy} title="Writes the words only, from your brand's voice and what's there now">
          <${Icon} name="sparkles" size=${15} /> ${busy ? 'Writing…' : prompt.trim() ? 'Write from my brief' : `Write with ${name}`}
        </button>
        <button class="icon-btn ${open ? 'on' : ''}" title="Add a brief" onClick=${() => setOpen(!open)}><span style=${{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : '' }}><${Icon} name="chevron" /></span></button>
        ${undo && !busy && html`<button class="btn small ghost" onClick=${() => { set(undo); setUndo(null); }} title="Put the previous words back"><${Icon} name="reset" size=${13} /> Undo</button>`}
      </div>
      ${open && html`
        <div class="ai-brief">
          <textarea rows="3" value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }}
            placeholder=${bulk ? 'What are these ads about? e.g. "5 reasons to switch to our 6am classes, mention the free first week"' : 'What should it say? e.g. "launching our oat latte, cosy autumn feel, mention £3.20"'}></textarea>
          <div class="row between">
            ${bulk
              ? html`<span class="row nowrap small muted">Ads ${opts([3, 5, 8, 12], nRows, setCount)}</span>`
              : html`<span class="row nowrap small muted">Headline versions ${opts([0, 2, 3, 5], nVersions, setVersions)}</span>`}
            <span class="faint small">Only changes the words</span>
          </div>
        </div>`}
    </div>`;
}

function WordsStep({ d, set, setContent, extras, usedFields }) {
  const c = d.content;
  const bulk = d.mode === 'bulk';
  const count = bulk ? d.rows.filter(hasCopy).length : 1 + d.variants.filter((v) => v.trim()).length;
  return html`
    <${Section} n="1" title="Words" hint=${bulk ? `${plural(count, 'ad')} in your list` : 'What your ad says'}>
      <${Segmented} value=${d.mode} onChange=${(mode) => set({ mode })}
        options=${[{ value: 'single', label: 'One ad' }, { value: 'bulk', label: 'Many ads (bulk)' }]} />
      <${WriteWithAssistant} d=${d} set=${set} />
      ${bulk
        ? html`
          <${BulkTable} rows=${d.rows} setRows=${(rows) => set({ rows })} fields=${usedFields} />
          <div class="subgroup">
            <h4>Same for every ad</h4>
            <${TextField} label="Top line" value=${c.eyebrow} placeholder="New this season" onInput=${(v) => setContent({ eyebrow: v })} />
            <${TextField} label="Supporting line" value=${c.subhead} placeholder="One supporting line" onInput=${(v) => setContent({ subhead: v })} />
            <${TextField} label="Button text" value=${c.cta} placeholder="Shop now" onInput=${(v) => setContent({ cta: v })} />
          </div>`
        : html`
          <${TextField} label="Top line" hint="small text above" value=${c.eyebrow} placeholder="New this season" onInput=${(v) => setContent({ eyebrow: v })} />
          <${TextField} label="Headline" rows="2" value=${c.headline} placeholder="Say it *big*." onInput=${(v) => setContent({ headline: v })}
            hint=${html`<button type="button" class="mini-add" title="Add another headline version (each one becomes its own ad)"
              onClick=${(e) => { e.preventDefault(); set((prev) => ({ variants: [...prev.variants, ''] })); }}><${Icon} name="plus" size=${13} /></button>`} />
          <p class="tip">Tip: wrap words in <code>*stars*</code> to colour them, use <code>|</code> to force a new line.</p>
          ${d.variants.length > 0 && html`<div class="versions-head"><b>Headline versions</b><span class="muted">each one becomes its own ad</span>
            <button class="btn small ghost" onClick=${() => set({ variants: [] })} title="Remove all versions">Clear</button></div>`}
          ${d.variants.map((v, i) => html`
            <div class="variant" key=${i}>
              <input value=${v} placeholder="Another way to say it…" onInput=${(e) => set({ variants: d.variants.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button class="icon-btn" onClick=${() => set({ variants: d.variants.filter((_, j) => j !== i) })} title="Remove"><${Icon} name="x" size=${14} /></button>
            </div>`)}
          <${TextField} label="Supporting line" rows="2" value=${c.subhead} placeholder="One line that sells it." onInput=${(v) => setContent({ subhead: v })} />
          <${TextField} label="Button text" value=${c.cta} placeholder="Shop now" onInput=${(v) => setContent({ cta: v })} />`}
      ${extras.length > 0 && html`
        <div class="subgroup">
          <h4>For your chosen templates</h4>
          ${extras.filter((k) => !(bulk && BULK_FIELDS.includes(k))).map((k) => html`
            <${TextField} key=${k} label=${EXTRA_FIELDS[k].label} hint=${EXTRA_FIELDS[k].for} type=${EXTRA_FIELDS[k].type} rows=${EXTRA_FIELDS[k].rows} value=${Array.isArray(c[k]) ? c[k].join('\n') : c[k]} placeholder=${EXTRA_FIELDS[k].placeholder} onInput=${(v) => setContent({ [k]: v })} />`)}
        </div>`}
      <details class="more">
        <summary>More options</summary>
        <${TextField} label="Small print" value=${c.footnote} placeholder="T&Cs apply. Ends Sunday." onInput=${(v) => setContent({ footnote: v })} />
        <${Toggle} checked=${c.showLogo !== false} onChange=${(v) => setContent({ showLogo: v ? undefined : false })} label="Show logo" />
      </details>
    <//>`;
}

// ── Step 2: Look ─────────────────────────────────────────────────────────────

function LookStep({ d, set, setContent, previewContent }) {
  const { meta, brand, reload } = useApp();
  const [editColours, setEditColours] = useState(false);
  const [generator, setGenerator] = useState(false);
  const [browse, setBrowse] = useState(null); // 'templates' | 'colours'
  const [uploading, setUploading] = useState(false);
  const c = d.content;
  const pal = brand.palettes[d.palettes[0]];
  // Functional update so quick successive clicks never work from stale state.
  const toggle = (key, v) => set((prev) => {
    if ((prev.pick?.[key] ?? 'one') === 'one') return { [key]: [v] };
    const list = prev[key].includes(v) ? prev[key].filter((x) => x !== v) : [...prev[key], v];
    return list.length ? { [key]: list } : {};
  });
  const setPick = (key, mode) => set((prev) => ({
    pick: { ...prev.pick, [key]: mode },
    ...(mode === 'one' && prev[key].length > 1 ? { [key]: [prev[key][0]] } : {}),
  }));
  const many = (key) => d.pick?.[key] === 'many';
  const [cropping, setCropping] = useState(false);
  const media = brand.assets.filter((a) => !/logo/i.test(a) && a !== brand.logo);
  const removeMedia = async (a) => {
    if (!confirm(`Delete "${a.replace(/^assets\//, '')}" from ${brand.name}? The file is removed from the brand.`)) return;
    try {
      await api('DELETE', `/api/brand/${brand.id}/asset?ref=${encodeURIComponent(a)}`);
      if (c.background === a) setContent({ background: undefined });
      await reload();
      toast('Deleted');
    } catch (e) { toast(e.message, 'err'); }
  };
  const upload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setUploading(true);
    try {
      const ref = await uploadFile(brand.id, f);
      await reload();
      setContent({ background: ref, bgStyle: undefined });
      toast(`Added ${f.name}`);
    } catch (err) { toast(err.message, 'err'); } finally { setUploading(false); }
  };
  const font = brand.fonts?.display?.family;
  return html`
    <${Section} n="2" title="Look" hint="Templates, colours and background">
      <h4 class="h-row">Templates <${PickMode} value=${d.pick?.templates} onChange=${(m) => setPick('templates', m)} />
        <span class="push"><button class="btn small soft" onClick=${() => setBrowse('templates')}><${Icon} name="grid" size=${14} /> Browse all ${meta.templates.length}</button></span></h4>
      ${many('templates') && html`<p class="tip">${plural(d.templates.length, 'template')} selected: every ad is made in each one.</p>`}
      <div class="tpl-grid">
        ${shortlist(meta.templates.map((t) => t.id), d.templates, 6).map((id) => meta.templates.find((t) => t.id === id)).map((t) => html`
          <button type="button" key=${t.id} class="tpl-card ${d.templates.includes(t.id) ? 'on' : ''}" onClick=${() => toggle('templates', t.id)} title=${t.description}>
            <${AdFrame} still req=${{ brand: brand.id, template: t.id, palette: d.palettes[0], format: 'ig-square', formatInfo: meta.formats['ig-square'], content: previewContent }} fit=${{ width: 120, height: 120 }} />
            <span class="tpl-name">${d.templates.includes(t.id) && html`<span class="tick">✓</span>`}${t.name}</span>
          </button>`)}
      </div>

      <h4 class="h-row">Colours <${PickMode} value=${d.pick?.palettes} onChange=${(m) => setPick('palettes', m)} />
        <span class="push row nowrap">
          <button class="btn small soft" onClick=${() => setGenerator(true)} title="Generate a new matching palette"><${Icon} name="dice" size=${14} /> Generate</button>
          <button class="btn small ghost" onClick=${() => setEditColours(true)}>Edit</button>
        </span></h4>
      <div class="pal-grid compact">
        ${shortlist(Object.keys(brand.palettes), d.palettes, 6).map((name) => html`
          <${PaletteCard} key=${name} name=${name} p=${brand.palettes[name]} font=${font} selected=${d.palettes.includes(name)} onClick=${() => toggle('palettes', name)} />`)}
      </div>
      ${many('palettes') && d.palettes.length > 1 && html`<p class="tip">${plural(d.palettes.length, 'colourway')} selected: every ad is made in each one.</p>`}
      ${Object.keys(brand.palettes).length > 6 && html`<button class="btn small ghost wide" onClick=${() => setBrowse('colours')}>View all ${Object.keys(brand.palettes).length} colourways</button>`}

      <h4>Background</h4>
      <div class="bg-grid">
        <button type="button" class="bg-tile ${!c.background && !c.bgStyle ? 'on' : ''}" onClick=${() => setContent({ background: undefined, bgStyle: undefined })}>
          <span class="bg-sw auto">Auto</span><small>Template default</small></button>
        ${meta.bgStyles.map((s) => html`
          <button type="button" key=${s.id} class="bg-tile ${!c.background && c.bgStyle === s.id ? 'on' : ''}" onClick=${() => setContent({ background: undefined, bgStyle: s.id })}>
            <span class="bg-sw" style=${{ background: BG_SWATCH[s.id](pal) }}></span><small>${s.name}</small></button>`)}
        ${media.map((a) => html`
          <button type="button" key=${a} class="bg-tile ${c.background === a ? 'on' : ''}" onClick=${() => setContent({ background: a })} title=${a}>
            ${isVideo(a)
              ? html`<span class="bg-sw media"><video src=${brandAssetUrl(brand.id, a)} muted preload="metadata"></video><span class="play"><${Icon} name="play" size=${14} /></span></span>`
              : html`<span class="bg-sw media"><img src=${brandAssetUrl(brand.id, a)} loading="lazy" /></span>`}
            <small>${a.replace(/^assets\//, '').replace(/\.[^.]+$/, '')}</small>
            <span class="tile-x" role="button" title="Delete this file" onClick=${(e) => { e.stopPropagation(); removeMedia(a); }}><${Icon} name="x" size=${11} /></span></button>`)}
        <label class="bg-tile upload">
          <span class="bg-sw">${uploading ? '…' : html`<${Icon} name="plus" size=${18} />`}</span><small>Photo / video</small>
          <input type="file" accept="image/*,video/*,.gif" hidden onChange=${upload} />
        </label>
      </div>
      ${c.background && html`
        <${Field} label="Darken image" hint=${`${Math.round((c.overlay ?? brand.style.overlay ?? 0.45) * 100)}%`}>
          <input type="range" min="0" max="0.9" step="0.05" value=${c.overlay ?? brand.style.overlay ?? 0.45} onInput=${(e) => setContent({ overlay: Number(e.target.value) })} />
        <//>
        <button class="btn soft wide" onClick=${() => setCropping(true)}><${Icon} name="crop" size=${15} /> Adjust photo: crop, zoom, flip</button>
        <${Field} label="Pattern on top">
          <${Segmented} value=${c.bgOverlay ?? ''} onChange=${(v) => setContent({ bgOverlay: v || undefined })}
            options=${[{ value: '', label: 'None' }, { value: 'grid', label: 'Grid' }, { value: 'dots', label: 'Dots' }, { value: 'glow', label: 'Glow' }, { value: 'tint', label: 'Tint' }]} />
        <//>
        ${cropping && html`<${PhotoCropper} d=${d} setContent=${setContent} onClose=${() => setCropping(false)} />`}`}
      <${Field} label="Text alignment">
        <${Segmented} value=${c.align ?? ''} onChange=${(v) => setContent({ align: v || undefined })}
          options=${[{ value: '', label: 'Brand default' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }]} />
      <//>
      ${meta.decorPresets && html`<${DecorPicker} c=${c} setContent=${setContent} />`}
      ${browse === 'templates' && html`<${TemplateBrowser} d=${d} toggle=${(id) => { toggle('templates', id); if (!many('templates')) setBrowse(null); }} previewContent=${previewContent} onClose=${() => setBrowse(null)} />`}
      ${browse === 'colours' && html`<${ColourBrowser} d=${d} toggle=${(n) => { toggle('palettes', n); if (!many('palettes')) setBrowse(null); }} onClose=${() => setBrowse(null)}
        onGenerate=${() => { setBrowse(null); setGenerator(true); }} onEdit=${() => { setBrowse(null); setEditColours(true); }} />`}
      ${editColours && html`<${PalettesModal} brand=${brand} library=${meta.paletteLibrary} onClose=${() => setEditColours(false)}
        onSaved=${async () => { await reload(); setEditColours(false); }} />`}
      ${generator && html`<${GeneratorModal} brand=${brand} onClose=${() => setGenerator(false)}
        onApply=${async (p, label) => {
          let k = slug(label) || 'generated';
          for (let i = 2; brand.palettes[k]; i++) k = `${slug(label) || 'generated'}-${i}`;
          try {
            await api('PUT', `/api/brand/${brand.id}`, { ...brandForSave(brand), palettes: { ...brand.palettes, [k]: p } });
            await reload();
            set((prev) => ({ palettes: prev.pick?.palettes === 'many' ? [...prev.palettes, k] : [k] }));
            setGenerator(false);
            toast(`Added “${label}” to ${brand.name}`);
          } catch (e) { toast(e.message, 'err'); }
        }} />`}
    <//>`;
}

// Where each sticker lands when added (x/y = % of the ad, size in u).
const DECOR_DEFAULTS = {
  arrow: { x: 72, y: 66, size: 22 }, circle: { x: 50, y: 46, size: 62 }, underline: { x: 42, y: 60, size: 46 },
  sparkles: { x: 82, y: 18, size: 16 }, burst: { x: 80, y: 24, size: 28, layer: 'back' },
};

/** Stickers & doodles: add a preset, then place it with a few sliders (Claude can also draw its own). */
function DecorPicker({ c, setContent }) {
  const { meta } = useApp();
  const list = c.decor ?? [];
  const update = (i, patch) => setContent({ decor: list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const remove = (i) => { const next = list.filter((_, j) => j !== i); setContent({ decor: next.length ? next : undefined }); };
  const slider = (i, key, label, min, max, step, def) => html`
    <label class="mini-field"><span>${label}</span>
      <input type="range" min=${min} max=${max} step=${step} value=${list[i][key] ?? def} onInput=${(e) => update(i, { [key]: Number(e.target.value) })} /></label>`;
  return html`
    <h4 class="h-row">Stickers <span class="muted">animated doodles, use sparingly</span></h4>
    <div class="quick">${Object.entries(meta.decorPresets).map(([id, name]) => html`
      <button class="chip" key=${id} onClick=${() => setContent({ decor: [...list, { preset: id, ...DECOR_DEFAULTS[id] }] })}>＋ ${name}</button>`)}</div>
    ${list.map((dc, i) => html`
      <div class="decor-item" key=${i}>
        <div class="row between nowrap"><b class="small">${dc.preset ? meta.decorPresets[dc.preset] : 'Custom SVG'}</b>
          <div class="row nowrap">
            <${Segmented} value=${dc.layer === 'back' ? 'back' : 'front'} onChange=${(v) => update(i, { layer: v === 'back' ? 'back' : undefined })} options=${[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Behind' }]} />
            <button class="icon-btn" title="Remove" onClick=${() => remove(i)}><${Icon} name="x" size=${14} /></button>
          </div>
        </div>
        <div class="two">${slider(i, 'x', 'Across', 0, 100, 1, 50)}${slider(i, 'y', 'Down', 0, 100, 1, 50)}${slider(i, 'size', 'Size', 4, 120, 1, 20)}${slider(i, 'rotate', 'Turn', -180, 180, 1, 0)}</div>
      </div>`)}`;
}

/**
 * Crop the background photo: drag to move the focus point, scroll or slide to zoom, flip.
 * The same focus/zoom applies at every size; the preview shows any of your chosen sizes.
 */
function PhotoCropper({ d, setContent, onClose }) {
  const { meta, brand } = useApp();
  const c = d.content;
  const sizes = [...new Map(d.formats.map((f) => [`${meta.formats[f].width}x${meta.formats[f].height}`, f])).values()];
  const [fmtId, setFmtId] = useState(sizes[0] ?? 'ig-square');
  const fmt = meta.formats[fmtId] ?? meta.formats['ig-square'];
  const k = Math.min(520 / fmt.width, 400 / fmt.height);
  const W = Math.round(fmt.width * k);
  const H = Math.round(fmt.height * k);
  const x = c.imageX ?? (/left/.test(c.imageFocus ?? '') ? 0 : /right/.test(c.imageFocus ?? '') ? 100 : 50);
  const y = c.imageY ?? (/top/.test(c.imageFocus ?? '') ? 0 : /bottom/.test(c.imageFocus ?? '') ? 100 : 50);
  const zoom = c.imageZoom ?? 1;
  const flip = !!c.imageFlip;
  const drag = useRef(null);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const set = (p) => setContent({ imageFocus: undefined, imageX: x, imageY: y, ...p });
  const onDown = (e) => { drag.current = { px: e.clientX, py: e.clientY, x, y }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => {
    const g = drag.current;
    if (!g) return;
    // Dragging the picture right reveals more of its left side, so the focus point moves left.
    const sx = flip ? -1 : 1;
    set({ imageX: Math.round(clamp(g.x - (sx * (e.clientX - g.px) * 100) / (W * zoom), 0, 100)), imageY: Math.round(clamp(g.y - ((e.clientY - g.py) * 100) / (H * zoom), 0, 100)) });
  };
  const onWheel = (e) => { e.preventDefault(); set({ imageZoom: +clamp(zoom * Math.exp(-e.deltaY * 0.0015), 1, 5).toFixed(2) }); };
  const src = brandAssetUrl(brand.id, c.background);
  // Same maths as the ads (base.js imageOrigin): a flip mirrors the zoomed picture around the frame centre.
  const ox = flip ? (100 + x * (zoom - 1)) / (1 + zoom) : x;
  const style = { objectPosition: `${x}% ${y}%`, transformOrigin: `${ox}% ${y}%`, scale: `${flip ? -zoom : zoom} ${zoom}` };
  return html`
    <${Modal} title="Adjust photo" onClose=${onClose}>
      ${sizes.length > 1 && html`<div class="pills small" style=${{ marginBottom: '10px' }}>${sizes.map((f) => html`<button class=${f === fmtId ? 'on' : ''} onClick=${() => setFmtId(f)}>${SHORT[f] ?? meta.formats[f].label}</button>`)}</div>`}
      <div class="crop-wrap">
        <div class="crop-frame" style=${{ width: `${W}px`, height: `${H}px` }} onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${() => { drag.current = null; }} onWheel=${onWheel}>
          ${isVideo(c.background) ? html`<video src=${src} muted autoplay loop playsinline style=${style}></video>` : html`<img src=${src} draggable="false" style=${style} />`}
          <div class="crop-thirds"></div>
          <div class="crop-dot" style=${{ left: `${x}%`, top: `${y}%` }}></div>
        </div>
      </div>
      <p class="hint center">Drag to move · scroll to zoom · the dot stays in view at every size</p>
      <${Field} label="Zoom" hint=${`${Math.round(zoom * 100)}%`}>
        <input type="range" min="1" max="5" step="0.01" value=${zoom} onInput=${(e) => set({ imageZoom: Number(e.target.value) })} />
      <//>
      <div class="row between">
        <div class="row">
          <button class="btn small" onClick=${() => set({ imageFlip: flip ? undefined : true })}>${flip ? 'Unflip' : 'Flip'} ↔</button>
          <button class="btn small ghost" onClick=${() => setContent({ imageX: undefined, imageY: undefined, imageZoom: undefined, imageFlip: undefined, imageFocus: undefined })}><${Icon} name="reset" size=${13} /> Reset</button>
        </div>
        <button class="btn primary" onClick=${onClose}>Done</button>
      </div>
    <//>`;
}

/** The first few in catalogue order, plus anything selected from further down. Order never changes on click. */
function shortlist(all, selected, max) {
  const head = all.slice(0, max);
  return [...head, ...all.filter((x) => !head.includes(x) && selected.includes(x))];
}

/** "One / Several" switch: pick a single template (or colourway), or build a set of them. */
function PickMode({ value, onChange }) {
  return html`<div class="seg mini" title="Make ads in one, or several at once">
    ${[['one', 'One'], ['many', 'Several']].map(([v, l]) => html`<button type="button" class=${(value ?? 'one') === v ? 'on' : ''} onClick=${() => onChange(v)}>${l}</button>`)}
  </div>`;
}

/** Every template with big live previews, filtered by category and search. */
function TemplateBrowser({ d, toggle, previewContent, onClose }) {
  const { meta, brand } = useApp();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const shown = meta.templates.filter((t) => (cat === 'all' || t.category === cat)
    && (!q || `${t.name} ${t.description}`.toLowerCase().includes(q.toLowerCase())));
  return html`
    <${Modal} title="Templates" onClose=${onClose} wide>
      <div class="browser-bar">
        <div class="pills">
          <button class=${cat === 'all' ? 'on' : ''} onClick=${() => setCat('all')}>All ${meta.templates.length}</button>
          ${Object.entries(meta.categories).map(([id, c]) => html`<button class=${cat === id ? 'on' : ''} onClick=${() => setCat(id)} title=${c.description}>${c.name}</button>`)}
        </div>
        <input class="search" placeholder="Search templates…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      </div>
      ${cat !== 'all' && html`<p class="muted small">${meta.categories[cat].description}</p>`}
      <div class="browser-grid">
        ${shown.map((t) => html`
          <button type="button" key=${t.id} class="browser-card ${d.templates.includes(t.id) ? 'on' : ''}" onClick=${() => toggle(t.id)}>
            <${AdFrame} still req=${{ brand: brand.id, template: t.id, palette: d.palettes[0], format: 'ig-portrait', formatInfo: meta.formats['ig-portrait'], content: previewContent }} fit=${{ width: 196 }} />
            <span class="bc-title">${d.templates.includes(t.id) && html`<span class="tick">✓</span>`}${t.name}</span>
            <small>${t.description}</small>
          </button>`)}
        ${!shown.length && html`<p class="muted">No templates match.</p>`}
      </div>
      <div class="row between sticky-foot"><span class="muted small">${d.pick?.templates === 'many' ? `${d.templates.length} selected · each one is rendered in every size` : 'Pick one, or switch to Several to compare templates'}</span><button class="btn primary" onClick=${onClose}>Done</button></div>
    <//>`;
}

/** All of a brand's colourways in one place (shown when there are more than fit in the Look step). */
function ColourBrowser({ d, toggle, onClose, onGenerate, onEdit }) {
  const { brand } = useApp();
  const [q, setQ] = useState('');
  const names = Object.keys(brand.palettes).filter((n) => !q || n.toLowerCase().includes(q.toLowerCase()));
  return html`
    <${Modal} title=${`${brand.name} colourways`} onClose=${onClose} wide>
      <div class="browser-bar">
        <input class="search" placeholder="Search colourways…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <div class="row"><button class="btn small soft" onClick=${onGenerate}><${Icon} name="dice" size=${14} /> Generate</button><button class="btn small" onClick=${onEdit}>Edit colours</button></div>
      </div>
      <div class="pal-grid">
        ${names.map((n) => html`<${PaletteCard} key=${n} name=${n} p=${brand.palettes[n]} font=${brand.fonts?.display?.family} selected=${d.palettes.includes(n)} onClick=${() => toggle(n)} />`)}
      </div>
      <div class="row between sticky-foot"><span class="muted small">${d.pick?.palettes === 'many' ? `${d.palettes.length} selected · every ad is made in each` : 'Pick one, or switch to Several'}</span><button class="btn primary" onClick=${onClose}>Done</button></div>
    <//>`;
}

// ── Step 3: Motion ───────────────────────────────────────────────────────────

/**
 * Clip lengths (seconds) where every repeating effect lands exactly on the loop point, so a
 * looped video never stutters. Without repeating effects any whole second works.
 */
function loopLengths(content, periods) {
  const ps = [...(content.effects ?? []), content.ctaFx].filter(Boolean).map((k) => periods[k]).filter(Boolean);
  if (!ps.length) return [3, 4, 5, 6, 8, 10, 12, 15];
  const out = [];
  for (let t = 3; t <= 15.001; t = +(t + 0.1).toFixed(1)) {
    if (ps.every((p) => Math.abs(t / p - Math.round(t / p)) < 0.03)) out.push(t);
  }
  if (out.length) return out;
  const p = Math.max(...ps);
  return Array.from({ length: Math.floor(15 / p) }, (_, i) => +((i + 1) * p).toFixed(1)).filter((t) => t >= 3);
}

function MotionStep({ d, set, setContent }) {
  const { meta } = useApp();
  const c = d.content;
  const anim = c.animation ?? 'none';
  const fx = c.effects ?? [];
  const cta = c.ctaFx ?? '';
  const dur = c.duration ?? 6;
  const enableVideo = () => { if (!d.output.video) set((prev) => ({ output: { ...prev.output, video: true } })); };
  const pick = (id) => { setContent({ animation: id }); if (id !== 'none') enableVideo(); };
  const toggleFx = (id) => {
    const next = fx.includes(id) ? fx.filter((x) => x !== id) : [...fx, id];
    setContent({ effects: next.length ? next : undefined });
    if (next.length) enableVideo();
  };
  const pickCta = (id) => { setContent({ ctaFx: id || undefined }); if (id) enableVideo(); };
  const moving = anim !== 'none' || fx.length > 0 || !!cta;
  const snaps = loopLengths(c, meta.loopPeriods ?? {});
  // While looping, the slider snaps to the nearest perfect length when you're close to one.
  const setDur = (v) => {
    const near = c.loop ? snaps.find((t) => Math.abs(t - v) <= 0.3) : null;
    setContent({ duration: near ?? Math.round(v * 10) / 10 });
  };
  const hint = [anim !== 'none' && meta.animations.find((a) => a.id === anim)?.name, ...fx.map((f) => meta.effects.find((e) => e.id === f)?.name),
    cta && meta.ctaFx?.find((x) => x.id === cta)?.name].filter(Boolean).join(' + ');
  const perfect = snaps.some((t) => Math.abs(t - dur) < 0.05);
  return html`
    <${Section} n="3" title="Motion & effects" hint=${hint ? `${hint} · ${dur}s${c.loop ? ' · loop' : ''}` : 'Still image'}>
      <h4>How things enter</h4>
      <div class="anim-grid">
        ${meta.animations.map((a) => html`
          <button type="button" key=${a.id} class="anim-card ${anim === a.id ? 'on' : ''}" onClick=${() => pick(a.id)}>
            <span class="anim-icon"><${Icon} name=${ANIM_ICON[a.id] ?? 'square'} /></span>
            <span><b>${a.name}</b><small>${a.description}</small></span>
          </button>`)}
      </div>
      <h4>Effects <span class="muted">layer on top, combine freely</span></h4>
      <div class="anim-grid">
        ${meta.effects.map((e) => html`
          <button type="button" key=${e.id} class="anim-card fx-card ${fx.includes(e.id) ? 'on' : ''}" onClick=${() => toggleFx(e.id)}>
            <span class="anim-icon"><${Icon} name=${FX_ICON[e.id] ?? 'sparkles'} /></span>
            <span><b>${e.name}</b><small>${e.description}</small></span>
          </button>`)}
      </div>
      ${meta.ctaFx && html`
        <h4>Button animation <span class="muted">${c.cta ? 'after the intro' : 'needs button text'}</span></h4>
        <div class="anim-grid">
          <button type="button" class="anim-card ${!cta ? 'on' : ''}" onClick=${() => pickCta('')}>
            <span class="anim-icon"><${Icon} name="square" /></span><span><b>None</b><small>The button stays put.</small></span>
          </button>
          ${meta.ctaFx.map((x) => html`
            <button type="button" key=${x.id} class="anim-card ${cta === x.id ? 'on' : ''}" onClick=${() => pickCta(x.id)}>
              <span class="anim-icon"><${Icon} name=${{ shine: 'sparkles', nudge: 'cursor', pulse: 'bolt' }[x.id] ?? 'sparkles'} /></span>
              <span><b>${x.name}</b><small>${x.description}</small></span>
            </button>`)}
        </div>`}
      ${moving && html`
        <${Toggle} checked=${!!c.loop} onChange=${(v) => { setContent({ loop: v || undefined }); if (v && !snaps.some((t) => Math.abs(t - dur) < 0.05)) setContent({ loop: true, duration: snaps.reduce((a, b) => (Math.abs(b - dur) < Math.abs(a - dur) ? b : a)) }); }} label="Seamless loop" />
        <${Field} label="Video length" hint=${`${dur} seconds${c.loop ? (perfect ? ' · loops perfectly' : ' · not a perfect loop length') : ''}`}>
          <input type="range" min="3" max="15" step="0.1" value=${dur} list="loop-snaps" onInput=${(e) => setDur(Number(e.target.value))} />
          <datalist id="loop-snaps">${snaps.map((t) => html`<option value=${t}></option>`)}</datalist>
        <//>
        ${c.loop && html`<div class="snap-chips"><span class="muted small">Perfect loops:</span>${snaps.slice(0, 8).map((t) => html`<button type="button" class=${Math.abs(t - dur) < 0.05 ? 'on' : ''} onClick=${() => setContent({ duration: t })}>${t}s</button>`)}</div>`}
        <p class="tip">${c.loop
          ? 'Everything fades out at the end so the video repeats without a jump, and repeating effects line up with the loop point.'
          : `The preview loops. Exports include an MP4 of each size, and stills show the finished frame${fx.length ? ' with the effect frozen mid-shine' : ''}.`}</p>`}
    <//>`;
}

// ── Step 4: Sizes ────────────────────────────────────────────────────────────

function SizesStep({ d, set }) {
  const { meta } = useApp();
  const toggle = (f) => set((prev) => ({ formats: prev.formats.includes(f) ? prev.formats.filter((x) => x !== f) : [...prev.formats, f] }));
  const quick = [['Instagram', meta.groups.instagram], ['All social', meta.groups.social], ['Everything', meta.groups.all], ['None', []]];
  return html`
    <${Section} n="4" title="Sizes" hint=${`${plural(d.formats.length, 'size')} selected`}>
      <div class="quick">${quick.map(([l, fs]) => html`<button class="chip" onClick=${() => set({ formats: [...fs] })}>${l}</button>`)}</div>
      ${PLATFORM_GROUPS.map(([platform, ids]) => html`
        <div class="size-group" key=${platform}>
          <h5>${platform}</h5>
          <div class="size-tiles">
            ${ids.map((id) => {
              const f = meta.formats[id];
              return html`<button type="button" key=${id} class="size-tile ${d.formats.includes(id) ? 'on' : ''}" onClick=${() => toggle(id)}>
                <${RatioIcon} w=${f.width} h=${f.height} />
                <span><b>${SHORT[id] ?? f.label}</b><small>${f.width}×${f.height}</small></span>
              </button>`;
            })}
          </div>
        </div>`)}
    <//>`;
}

// ── Preview stage ────────────────────────────────────────────────────────────

/** Every combination laid out as a grid on a free, pannable, zoomable board. Click an ad to inspect it in Focus view. */
/**
 * Right-click quick export: export exactly the ad under the cursor (one size, or all sizes of that
 * variation) without touching the main export settings.
 * g = { label, content, template, palette }, f = format id.
 */
function useQuickExport({ d, exporter, onFocus }) {
  const { brand, meta } = useApp();
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (e) => e.key === 'Escape' && close();
    addEventListener('pointerdown', close);
    addEventListener('keydown', onKey);
    addEventListener('wheel', close, { passive: true });
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', onKey); removeEventListener('wheel', close); };
  }, [menu]);
  const tname = (id) => meta.templates.find((t) => t.id === id)?.name ?? id;
  const run = (g, formats, { type = d.output.type, video = false, gif = false, still = true } = {}) => {
    exporter.start({
      mode: 'single', brand: brand.id, campaign: d.campaign || 'my-campaign', content: g.content,
      templates: [g.template], palettes: [g.palette], formats, type, scale: d.output.scale, video, gif, still,
      design: { ...d, mode: 'single', content: g.content, variants: [], templates: [g.template], palettes: [g.palette], formats },
    }, {
      label: `${g.label} · ${tname(g.template)} · ${formats.length > 1 ? plural(formats.length, 'size') : SHORT[formats[0]] ?? formats[0]}`,
      total: formats.length * ((still ? 1 : 0) + (video ? 1 : 0) + (gif ? 1 : 0)),
    });
  };
  const open = (e, g, f) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: Math.min(e.clientX, innerWidth - 250), y: Math.min(e.clientY, innerHeight - 230), g, f });
  };
  const item = (icon, label, fn) => html`<button type="button" onPointerDown=${(e) => e.stopPropagation()} onClick=${() => { setMenu(null); fn(); }}><${Icon} name=${icon} size=${14} />${label}</button>`;
  const node = menu && createPortal(html`
    <div class="ctx-menu" style=${{ left: `${menu.x}px`, top: `${menu.y}px` }} onPointerDown=${(e) => e.stopPropagation()} onContextMenu=${(e) => e.preventDefault()}>
      <div class="ctx-title">${menu.g.label} · ${tname(menu.g.template)} · ${SHORT[menu.f] ?? menu.f}</div>
      ${item('download', 'Export this as PNG', () => run(menu.g, [menu.f], { type: 'png' }))}
      ${item('download', 'Export this as JPG', () => run(menu.g, [menu.f], { type: 'jpeg' }))}
      ${isAnimated(menu.g.content) && item('film', 'Export this as video (MP4)', () => run(menu.g, [menu.f], { video: true, still: false }))}
      ${isAnimated(menu.g.content) && item('film', 'Export this as GIF', () => run(menu.g, [menu.f], { gif: true, still: false }))}
      ${d.formats.length > 1 && item('layers', `Export in all ${d.formats.length} sizes`, () => run(menu.g, d.formats))}
      ${onFocus && html`<hr />${item('square', 'Open in Focus view', () => onFocus(menu.g, menu.f))}`}
    </div>`, document.body);
  return { open, node };
}

const Z_MIN = 0.1;
const Z_MAX = 8;
const clampZ = (z) => Math.min(Z_MAX, Math.max(Z_MIN, z));
function CanvasView({ d, ads, onPick, lead, exporter }) {
  const quick = useQuickExport({ d, exporter, onFocus: (g, f) => onPick({ template: g.template, palette: g.palette, format: f, row: g.row }) });
  const { meta, brand } = useApp();
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [ready, setReady] = useState(false);
  const [play, setPlay] = useState(false);
  const ref = useRef();
  const inner = useRef();
  const drag = useRef(null);
  const moved = useRef(false);
  const groups = [];
  for (const [row, ad] of ads.entries()) for (const template of d.templates) for (const palette of d.palettes) groups.push({ ...ad, row, template, palette });
  const LIMIT = 90;
  const perGroup = Math.max(1, d.formats.length);
  const shown = groups.slice(0, Math.max(1, Math.floor(LIMIT / perGroup)));
  const total = groups.length * d.formats.length;
  const tname = (id) => meta.templates.find((t) => t.id === id)?.name ?? id;
  const H = 230;
  // Grid columns chosen so the whole board comes out roughly the shape of a wide screen.
  const groupW = d.formats.reduce((w, f) => { const fi = meta.formats[f]; return w + Math.min(H * 1.9, H * fi.width / fi.height) + 24; }, 32);
  const cols = Math.max(1, Math.min(shown.length, Math.round(Math.sqrt((1.6 * shown.length * (H + 70)) / groupW)) || 1));
  const layoutKey = `${shown.length}|${cols}|${d.formats.join()}`;

  // Fit the whole board in view, centred under the toolbar.
  const fit = () => {
    const el = ref.current;
    const c = inner.current;
    if (!el || !c) return;
    const W = el.clientWidth;
    const Hv = el.clientHeight;
    const top = 76;
    const z = clampZ(Math.min((W - 80) / c.offsetWidth, (Hv - top - 40) / c.offsetHeight, 1));
    setView({ z, x: (W - c.offsetWidth * z) / 2, y: top + Math.max(0, (Hv - top - 40 - c.offsetHeight * z) / 2) });
    setReady(true);
  };
  useEffect(() => { requestAnimationFrame(fit); }, [layoutKey]);

  const zoomAt = (target, mx, my) => setView((v) => {
    const z = clampZ(typeof target === 'function' ? target(v.z) : target);
    const k = z / v.z;
    return { z, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
  });
  const zoomCentre = (target) => { const el = ref.current; zoomAt(target, el.clientWidth / 2, el.clientHeight / 2); };

  // Navigation: drag anywhere to pan (middle mouse, or left mouse; a left-drag over an ad doesn't count as a click).
  const onDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault(); // no browser auto-scroll cursor
    moved.current = false;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    ref.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const g = drag.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!moved.current && Math.hypot(dx, dy) < 4) return;
    if (!moved.current) { moved.current = true; ref.current.classList.add('panning'); }
    setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
  };
  const onUp = () => { drag.current = null; ref.current?.classList.remove('panning'); };
  const onWheel = (e) => {
    e.preventDefault();
    const r = ref.current.getBoundingClientRect();
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt((z) => z * f, e.clientX - r.left, e.clientY - r.top);
  };
  return html`
    <div class="float-bar top">
      ${lead}
      <span class="sep"></span>
      <span class="muted small" style=${{ padding: '0 4px', whiteSpace: 'nowrap' }}>${plural(total, 'ad')}</span>
      <label class="toggle" style=${{ margin: '0 4px' }} title="Play animations"><input type="checkbox" checked=${play} onChange=${(e) => setPlay(e.target.checked)} /><span class="track"><span class="knob"></span></span>Play</label>
      <div class="zoom-ctl">
        <input type="range" min=${Math.log2(Z_MIN)} max=${Math.log2(Z_MAX)} step="0.01" value=${Math.log2(view.z)} onInput=${(e) => zoomCentre(2 ** Number(e.target.value))} title="Zoom (scroll wheel)" />
        <span>${Math.round(view.z * 100)}%</span>
        <button class="btn ghost small" onClick=${fit} title="Fit everything in view">Fit</button>
      </div>
    </div>
    <div class="canvas" ref=${ref} onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp} onWheel=${onWheel}
      onAuxClick=${(e) => e.preventDefault()} onClickCapture=${(e) => { if (moved.current) { e.stopPropagation(); moved.current = false; } }}>
      <div class="canvas-inner" ref=${inner} style=${{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, gridTemplateColumns: `repeat(${cols}, max-content)`, visibility: ready ? 'visible' : 'hidden' }}>
        ${shown.map((g, gi) => html`<div class="canvas-group" key=${gi}>
          <h6><b>${g.label}</b> · ${tname(g.template)} · ${g.palette}</h6>
          <div class="canvas-row">
            ${d.formats.map((f) => html`<div class="canvas-item" key=${f} onContextMenu=${(e) => quick.open(e, g, f)} title="Click to edit · right-click to export">
              <${AdFrame} still=${!play} req=${{ brand: brand.id, template: g.template, palette: g.palette, format: f, formatInfo: meta.formats[f], content: g.content }}
                fit=${{ height: H, width: H * 1.9 }} onClick=${() => onPick({ template: g.template, palette: g.palette, format: f, row: g.row })} />
              <span>${SHORT[f] ?? f}</span></div>`)}
          </div></div>`)}
      </div>
      ${total > shown.length * perGroup && html`<p class="muted small canvas-note">Showing ${shown.length * perGroup} of ${total}. Export to get them all.</p>`}
      ${quick.node}
    </div>`;
}

/** Read / write one element's style overrides, either for every size or for one size only. */
function styleAccess(d, setContent, role, scope, format) {
  const shared = d.content.styles?.[role] ?? {};
  const own = d.content.formatStyles?.[format]?.[role] ?? {};
  const st = scope === 'format' ? { ...shared, ...own } : shared;
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null));
  const setSt = (patch) => {
    if (scope === 'format') {
      const next = clean({ ...own, ...patch });
      const fs = { ...(d.content.formatStyles ?? {}) };
      const roles = { ...(fs[format] ?? {}), [role]: next };
      if (!Object.keys(next).length) delete roles[role];
      if (Object.keys(roles).length) fs[format] = roles; else delete fs[format];
      setContent({ formatStyles: Object.keys(fs).length ? fs : undefined });
    } else {
      const next = clean({ ...shared, ...patch });
      const styles = { ...(d.content.styles ?? {}), [role]: next };
      if (!Object.keys(next).length) delete styles[role];
      setContent({ styles: Object.keys(styles).length ? styles : undefined });
    }
  };
  return { st, setSt, own, hasOwn: Object.keys(own).length > 0 };
}

/** Click-to-edit panel for one element of the ad (text, colour, font, size, position, spacing, case). */
function Inspector({ role, d, setContent, set, focus, onClose, scope, setScope, measured }) {
  const { meta, brand } = useApp();
  const r = meta.styleRoles[role];
  if (!r) return null;
  const pal = brand.palettes[focus.palette] ?? {};
  // Palette colours first, labelled by what they are in the brand, then plain white / black.
  const named = [['Text', pal.fg], ['Background', pal.bg], ['Highlight', pal.accent], ['Secondary', pal.muted], ['Button', pal.ctaBg ?? pal.accent], ['Button text', pal.ctaText ?? pal.bg], ['White', '#FFFFFF'], ['Black', '#111111']]
    .filter(([, c]) => c).map(([n, c]) => [n, c.toUpperCase()]);
  const swatches = [...new Map(named.map(([n, c]) => [c, n])).entries()]; // [colour, name], unique colours
  const { st, setSt, hasOwn } = styleAccess(d, setContent, role, scope, focus.format);
  const fmtName = SHORT[focus.format] ?? meta.formats[focus.format]?.label ?? focus.format;
  const field = ROLE_TEXT[role];
  const bulkRow = d.mode === 'bulk' && ['headline', 'offer', 'eyebrow', 'subhead', 'cta'].includes(field);
  const rowsAll = d.rows;
  const activeIdx = rowsAll.map((x, i) => [x, i]).filter(([x]) => hasCopy(x))[focus.row]?.[1];
  // A headline version in focus (single mode): edit that version, not the main headline.
  const versionIdx = d.mode === 'single' && field === 'headline' && focus.row > 0
    ? d.variants.map((v, i) => [v, i]).filter(([v]) => v.trim())[focus.row - 1]?.[1] : undefined;
  const textValue = bulkRow ? (rowsAll[activeIdx]?.[field] ?? d.content[field] ?? '')
    : versionIdx != null ? d.variants[versionIdx] : (d.content[field] ?? '');
  const setText = (v) => {
    if (bulkRow && activeIdx != null) set((prev) => ({ rows: prev.rows.map((x, i) => (i === activeIdx ? { ...x, [field]: v } : x)) }));
    else if (versionIdx != null) set((prev) => ({ variants: prev.variants.map((x, i) => (i === versionIdx ? v : x)) }));
    else setContent({ [field]: v });
  };
  const font = meta.fonts.find((f) => f.family === st.font);
  const weights = font?.weights ?? [400, 500, 600, 700, 800, 900];
  const scale = st.scale ?? 1;
  // Font size in px at the size you're looking at: the measured size divided by the current scale is the "1×" size.
  const basePx = measured?.fontSize ? measured.fontSize / scale : null;
  const px = basePx ? Math.round(basePx * scale) : null;
  const setPx = (v) => { if (basePx && v > 0) setSt({ scale: Math.min(2.5, Math.max(0.4, +(v / basePx).toFixed(3))) }); };
  const Colour = ({ value, onPick, label, hint }) => {
    const current = value ? swatches.find(([c]) => c === value.toUpperCase())?.[1] ?? value.toUpperCase() : null;
    return html`
      <div class="field">
        <span class="field-label">${label}<em>${current ? current : hint ?? 'brand default'}</em></span>
        <div class="ins-swatches named">
          ${swatches.map(([c, n]) => html`<button key=${c} class=${value?.toUpperCase() === c ? 'on' : ''} title=${`${n} ${c}`} onClick=${() => onPick(c)}>
            <i style=${{ background: c }}></i><small>${n}</small></button>`)}
          <label class="custom" title="Any colour"><i><${Icon} name="plus" size=${12} /></i><small>Custom</small><input type="color" value=${value ?? '#888888'} onInput=${(e) => onPick(e.target.value.toUpperCase())} /></label>
        </div>
        ${value && html`<button class="link-btn" onClick=${() => onPick(undefined)}>Use brand default</button>`}
      </div>`;
  };
  const nudge = (dx, dy) => setSt({ x: +((st.x ?? 0) + dx).toFixed(2) || undefined, y: +((st.y ?? 0) + dy).toFixed(2) || undefined });
  return html`
    <div class="inspector" onClick=${(e) => e.stopPropagation()}>
      <div class="inspector-head">
        <span class="anim-icon"><${Icon} name="cursor" /></span>
        <h3>${r.label}</h3>
        <button class="icon-btn" title="Close" onClick=${onClose}><${Icon} name="x" /></button>
      </div>
      <div class="scope">
        <${Segmented} value=${scope} onChange=${setScope} options=${[{ value: 'all', label: 'All sizes' }, { value: 'format', label: `Only ${fmtName}` }]} />
        ${scope === 'format' && hasOwn && html`<button class="link-btn" onClick=${() => setSt(Object.fromEntries(Object.keys(d.content.formatStyles?.[focus.format]?.[role] ?? {}).map((k) => [k, undefined])))}>Clear ${fmtName} changes</button>`}
      </div>
      ${field && scope === 'all' && html`<${Field} label=${bulkRow ? `Text (ad ${focus.row + 1})` : versionIdx != null ? `Text (version ${focus.row + 1})` : 'Text'}>
        <textarea rows=${role === 'body' || role === 'points' ? 5 : role === 'headline' ? 2 : 1} value=${Array.isArray(textValue) ? textValue.join('\n') : textValue} onInput=${(e) => setText(e.target.value)}></textarea>
      <//>`}
      ${r.button
        ? html`<${Colour} label="Button colour" value=${st.bg} onPick=${(v) => setSt({ bg: v })} />
          <${Colour} label="Button text colour" value=${st.color} onPick=${(v) => setSt({ color: v })} />`
        : role !== 'logo' && html`<${Colour} label="Text colour" value=${st.color} onPick=${(v) => setSt({ color: v })} />`}
      ${r.fitted && html`<${Colour} label="Colour of *highlighted* words" value=${st.highlight} onPick=${(v) => setSt({ highlight: v })} hint="Highlight" />`}
      <div class="size-row">
        <${Field} label="Font size" hint=${r.fitted ? 'auto-fits' : 'px'}>
          <div class="num-row">
            <button class="icon-btn" onClick=${() => setSt({ scale: Math.max(0.4, +(scale - 0.05).toFixed(2)) })} title="Smaller">−</button>
            <input type="number" min="1" value=${px ?? ''} placeholder=${`${Math.round(scale * 100)}%`} onChange=${(e) => setPx(Number(e.target.value))} title="Size in pixels at this ad size" />
            <button class="icon-btn" onClick=${() => setSt({ scale: Math.min(2.5, +(scale + 0.05).toFixed(2)) })} title="Bigger">+</button>
          </div>
        <//>
        <${Field} label="Scale" hint=${`${Math.round(scale * 100)}%`}>
          <input type="range" min="0.4" max="2.5" step="0.05" value=${scale} onInput=${(e) => setSt({ scale: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} />
        <//>
      </div>
      <${Field} label="Position" hint=${st.x || st.y ? `${st.x ?? 0}, ${st.y ?? 0}` : 'drag it on the preview'}>
        <div class="nudge">
          <button class="icon-btn" onClick=${() => nudge(-1, 0)} title="Left">←</button>
          <button class="icon-btn" onClick=${() => nudge(0, -1)} title="Up">↑</button>
          <button class="icon-btn" onClick=${() => nudge(0, 1)} title="Down">↓</button>
          <button class="icon-btn" onClick=${() => nudge(1, 0)} title="Right">→</button>
          ${(st.x || st.y) && html`<button class="link-btn" onClick=${() => setSt({ x: undefined, y: undefined })}>Reset position</button>`}
        </div>
      <//>
      ${role !== 'logo' && html`
        <div class="two">
          <${Field} label="Font">
            <select value=${st.font ?? ''} onChange=${(e) => setSt({ font: e.target.value || undefined, weight: undefined })}>
              <option value="">Brand font</option>
              ${meta.fonts.map((f) => html`<option value=${f.family}>${f.family}</option>`)}
            </select>
          <//>
          <${Field} label="Weight">
            <select value=${st.weight ?? ''} onChange=${(e) => setSt({ weight: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Default</option>
              ${weights.map((w) => html`<option value=${w}>${w}</option>`)}
            </select>
          <//>
        </div>
        <${Field} label="Letter spacing" hint=${st.tracking != null ? `${st.tracking}em` : 'default'}>
          <input type="range" min="-0.08" max="0.3" step="0.005" value=${st.tracking ?? 0} onInput=${(e) => setSt({ tracking: Number(e.target.value) })} />
        <//>
        <${Field} label="Capitals">
          <${Segmented} value=${st.case ?? ''} onChange=${(v) => setSt({ case: v || undefined })}
            options=${[{ value: '', label: 'Default' }, { value: 'none', label: 'Aa' }, { value: 'upper', label: 'AA' }, { value: 'lower', label: 'aa' }]} />
        <//>
        <${Toggle} checked=${!!st.italic} onChange=${(v) => setSt({ italic: v || undefined })} label="Italic" />`}
      <div class="row between" style=${{ marginTop: '6px' }}>
        <span class="faint small">${scope === 'format' ? `Only changes ${fmtName}` : 'Applies to every size and template'}</span>
        ${Object.keys(st).length > 0 && html`<button class="btn small ghost" onClick=${() => setSt(Object.fromEntries(Object.keys(st).map((k) => [k, undefined])))}><${Icon} name="reset" size=${13} /> Reset</button>`}
      </div>
    </div>`;
}

function Stage({ d, set, setContent, previewContent, focus, setFocus, ads, selected, setSelected, history, exporter }) {
  const { meta, brand } = useApp();
  const [view, setView] = useState(store.get('stage.view', 'focus'));
  // An AI can switch the view (e.g. to Canvas to show every variation it made).
  useEffect(() => {
    const onView = (e) => setView(e.detail);
    addEventListener('chef:view', onView);
    return () => removeEventListener('chef:view', onView);
  }, []);
  useEffect(() => store.set('stage.view', view), [view]);
  const boxRef = useRef();
  const [box, setBox] = useState({ w: 600, h: 600 });
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    if (!boxRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [view]);
  const quick = useQuickExport({ d, exporter });
  const [scope, setScope] = useState('all'); // inspector edits: every size, or only the size in focus
  const [measured, setMeasured] = useState(null);
  const onMove = (role, dx, dy) => {
    const { st, setSt } = styleAccess(d, setContent, role, scope, focus.format);
    setSt({ x: +((st.x ?? 0) + dx).toFixed(2) || undefined, y: +((st.y ?? 0) + dy).toFixed(2) || undefined });
  };
  const undoRedo = html`<span class="sep"></span>
    <button class="icon-btn" disabled=${!history.canUndo} onClick=${history.undo} title="Undo (Ctrl+Z)"><${Icon} name="undo" /></button>
    <button class="icon-btn" disabled=${!history.canRedo} onClick=${history.redo} title="Redo (Ctrl+Shift+Z)"><${Icon} name="redo" /></button>`;
  const viewToggle = html`<${Segmented} value=${view} onChange=${setView} options=${[
    { value: 'focus', label: html`<${Icon} name="square" size=${14} /> Focus` },
    { value: 'canvas', label: html`<${Icon} name="grid" size=${14} /> Canvas` }]} />`;
  if (view === 'canvas') {
    return html`<div class="stage">
      <${CanvasView} d=${d} ads=${ads} exporter=${exporter} lead=${html`${viewToggle}${undoRedo}`} onPick=${(f) => { setFocus(f); setView('focus'); }} />
    </div>`;
  }
  const req = (format) => ({ brand: brand.id, template: focus.template, palette: focus.palette, format, formatInfo: meta.formats[format], content: previewContent });
  const animated = isAnimated(previewContent);
  const fmt = focus.format && meta.formats[focus.format];
  const tname = (id) => meta.templates.find((t) => t.id === id)?.name ?? id;
  // Every variation (ad × template × colourway), shown at the focused size in a rail down the left.
  const combos = [];
  for (let row = 0; row < ads.length; row++) for (const template of d.templates) for (const palette of d.palettes) combos.push({ row, template, palette });
  const RAIL_MAX = 60;
  const comboLabel = (c) => [ads.length > 1 && ads[c.row].label, d.templates.length > 1 && tname(c.template), d.palettes.length > 1 && c.palette].filter(Boolean);
  const rail = combos.length > 1 && fmt;
  const isFocus = (c) => c.row === focus.row && c.template === focus.template && c.palette === focus.palette;
  const at = Math.max(0, combos.findIndex(isFocus));
  const arrow = (deg) => html`<span style=${{ transform: `rotate(${deg}deg)`, display: 'inline-flex' }}><${Icon} name="chevron" /></span>`;
  return html`
    <div class="stage ${rail ? 'has-rail' : ''}">
      <div class="float-bar top">
        ${viewToggle}${undoRedo}
        ${rail && html`<span class="sep"></span>
          <div class="rownav">
            <button class="icon-btn" disabled=${at <= 0} onClick=${() => setFocus(combos[at - 1])} title="Previous variation">${arrow(90)}</button>
            <span>${at + 1} / ${combos.length}</span>
            <button class="icon-btn" disabled=${at >= combos.length - 1} onClick=${() => setFocus(combos[at + 1])} title="Next variation">${arrow(-90)}</button>
          </div>
          <span class="muted small ellipsis" style=${{ maxWidth: '260px', paddingRight: '6px' }}>${comboLabel(combos[at]).join(' · ')}</span>`}
        ${animated && html`<span class="sep"></span><button class="btn small ghost" onClick=${() => setReplay(replay + 1)}><${Icon} name="replay" size=${14} /> Replay</button>`}
      </div>
      ${rail && html`
        <div class="vrail">
          <div class="vrail-head"><b>${plural(combos.length, 'variation')}</b><small>shown at ${SHORT[focus.format] ?? focus.format}</small></div>
          <div class="vrail-list">
            ${combos.slice(0, RAIL_MAX).map((c) => html`
              <button type="button" key=${`${c.row}|${c.template}|${c.palette}`} class="vthumb ${isFocus(c) ? 'on' : ''}" onClick=${() => setFocus(c)} onContextMenu=${(e) => quick.open(e, { ...c, label: ads[c.row].label, content: ads[c.row].content }, focus.format)} title=${comboLabel(c).join(' · ')}>
                <${AdFrame} still req=${{ brand: brand.id, template: c.template, palette: c.palette, format: focus.format, formatInfo: fmt, content: ads[c.row].content }} fit=${{ width: 96, height: 96 }} />
                ${comboLabel(c).map((l, i) => html`<span class=${i ? 'faint' : ''}>${l}</span>`)}
              </button>`)}
            ${combos.length > RAIL_MAX && html`<p class="muted small">+${combos.length - RAIL_MAX} more. Open Canvas to see them all.</p>`}
          </div>
        </div>`}
      <div class="stage-main" ref=${boxRef} onClick=${() => setSelected(null)}>
        ${fmt
          ? html`<div class="stage-ad" onClick=${(e) => e.stopPropagation()}>
              <${AdFrame} key=${replay} req=${req(focus.format)} fit=${{ width: Math.max(80, box.w), height: Math.max(80, box.h - 40) }}
                interactive roles=${meta.styleRoles} selected=${selected} onSelect=${setSelected} onMove=${onMove} onMeasure=${setMeasured} />
              <div class="stage-caption">${fmt.label} · ${fmt.width}×${fmt.height}${fmt.safe ? ' · copy kept clear of app buttons' : ''}${selected ? '' : ' · click any text to restyle it, drag to move it'}</div>
            </div>`
          : html`<div class="empty">Pick at least one size in step 4.</div>`}
      </div>
      ${d.formats.length > 0 && html`
        <div class="dock">
          ${d.formats.map((f) => html`
            <div class="thumb ${f === focus.format ? 'on' : ''}" key=${f} onClick=${() => setFocus({ format: f })} title=${meta.formats[f].label}>
              <${AdFrame} still req=${req(f)} fit=${{ height: 64, width: 114 }} />
              <span>${SHORT[f] ?? f}</span>
            </div>`)}
        </div>`}
      ${quick.node}
      ${selected
        ? html`<${Inspector} role=${selected} d=${d} set=${set} setContent=${setContent} focus=${focus} onClose=${() => setSelected(null)} scope=${scope} setScope=${setScope} measured=${measured} />`
        : null}
    </div>`;
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * One export job at a time, shared by the Export panel and the canvas right-click menu.
 * start(body, label) posts the job, then polls it; the render popup follows along.
 */
function useExporter() {
  const [job, setJob] = useState(null);
  const [popup, setPopup] = useState(false);
  useEffect(() => {
    if (!job?.id || job.status !== 'running') return undefined;
    const t = setInterval(async () => {
      try {
        const j = await api('GET', `/api/jobs/${job.id}`);
        setJob((cur) => (cur?.id === j.id ? { ...cur, ...j } : cur));
      } catch { /* keep polling */ }
    }, 500);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (job?.status === 'done') toast(`Done: ${plural(job.result.total, 'file')}`);
    if (job?.status === 'error') toast(job.error, 'err');
  }, [job?.status]);
  const start = async (body, { label, total }) => {
    if (job?.status === 'running') return toast('An export is already running', 'err');
    try {
      const r = await api('POST', '/api/jobs', body);
      setJob({ id: r.id, status: 'running', done: 0, total, recent: [], label });
      setPopup(true);
    } catch (e) { toast(e.message, 'err'); }
  };
  return { job, start, popup, setPopup };
}

/**
 * Plays a finished still as if it were being rendered: chunky pixels that sharpen into the real
 * image, like a render coming together. A few canvas draws per image; next image waits its turn.
 */
function PixelResolve({ src, width = 300, height = 300 }) {
  const ref = useRef();
  const st = useRef({ queue: null, busy: false });
  const play = (url) => {
    const s = st.current;
    if (s.busy) { s.queue = url; return; }
    s.busy = true;
    const img = new Image();
    img.onload = () => {
      const c = ref.current;
      if (!c) return;
      const k = Math.min(width / img.width, height / img.height);
      const w = Math.round(img.width * k);
      const h = Math.round(img.height * k);
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const tmp = document.createElement('canvas');
      const steps = [3, 5, 8, 12, 18, 26, 38, 56, 80, 120, 180];
      let i = 0;
      const draw = () => {
        if (i < steps.length) {
          const cols = steps[i];
          const rows = Math.max(1, Math.round((cols * h) / w));
          tmp.width = cols; tmp.height = rows;
          tmp.getContext('2d').drawImage(img, 0, 0, cols, rows);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tmp, 0, 0, w, h);
          i++;
          setTimeout(draw, 70 + i * 6);
        } else {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(img, 0, 0, w, h);
          c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
          setTimeout(() => {
            s.busy = false;
            if (s.queue) { const q = s.queue; s.queue = null; play(q); }
          }, 350);
        }
      };
      draw();
    };
    img.onerror = () => { s.busy = false; };
    img.src = url;
  };
  useEffect(() => { if (src) play(src); }, [src]);
  return html`<canvas class="pixel-canvas" ref=${ref} width=${width} height=${height}></canvas>`;
}

const COOKING = ['Preheating the oven', 'Chopping the copy', 'Plating every size', 'Seasoning the colours', 'Garnishing', 'Almost served'];

/** The export popup: progress, the current piece resolving out of pixels, then the results. */
function RenderPopup({ exporter }) {
  const { job, setPopup } = exporter;
  const [showResults, setShowResults] = useState(false);
  if (!job) return null;
  const close = () => setPopup(false);
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const latest = job.recent?.[job.recent.length - 1];
  const running = job.status === 'running';
  const elapsed = Math.max(1, ((job.finishedAt ?? Date.now()) - (job.startedAt ?? Date.now())) / 1000);
  const eta = job.done > 0 && running ? Math.round(((job.total - job.done) * elapsed) / job.done) : null;
  if (showResults && job.result) return html`<${ResultsModal} result=${job.result} onClose=${() => { setShowResults(false); close(); }} />`;
  return createPortal(html`
    <div class="render-back" onClick=${(e) => e.target === e.currentTarget && close()}>
      <div class="render-pop ${job.status}">
        <div class="render-head">
          <div>
            <h2>${running ? COOKING[Math.min(COOKING.length - 1, Math.floor((pct / 100) * COOKING.length))] + '…' : job.status === 'done' ? 'Served!' : 'Something burnt'}</h2>
            <p class="muted small">${job.label ?? 'Export'}</p>
          </div>
          <button class="icon-btn" onClick=${close} title=${running ? 'Hide (keeps rendering)' : 'Close'}><${Icon} name=${running ? 'minimize' : 'x'} /></button>
        </div>
        <div class="render-stage">
          ${latest ? html`<${PixelResolve} src=${latest} />` : html`<div class="render-wait"><span></span><span></span><span></span></div>`}
          ${running && html`<div class="render-scan"></div>`}
          ${job.status === 'done' && html`<div class="render-done"><${Icon} name="check" size=${30} stroke=${2.5} /></div>`}
        </div>
        <div class="render-bar"><div style=${{ width: `${job.status === 'done' ? 100 : pct}%` }}></div></div>
        <div class="row between small muted">
          <span>${job.status === 'done' ? `${plural(job.result.total, 'file')} in ${Math.round(elapsed)}s` : `${job.done} of ${job.total || '…'}${job.current ? ` · ${job.current}` : ''}`}</span>
          <span>${eta != null ? `~${eta}s left` : running ? '' : ''}</span>
        </div>
        ${job.recent?.length > 0 && html`
          <div class="render-strip">${job.recent.slice(-8).map((u) => html`<img key=${u} src=${u} />`)}</div>`}
        ${job.status === 'error' && html`<p class="error">${job.error}</p>`}
        ${job.status === 'done' && html`
          <div class="row end">
            <button class="btn" onClick=${() => api('POST', '/api/open', { path: job.result.dir })}><${Icon} name="folder" size=${15} /> Open folder</button>
            <button class="btn primary" onClick=${() => setShowResults(true)}>View files</button>
          </div>`}
      </div>
    </div>`, document.body);
}

function ResultsModal({ result, onClose }) {
  return html`
    <${Modal} title=${`${plural(result.total, 'file')} ready`} onClose=${onClose} wide>
      <div class="row">
        <button class="btn primary" onClick=${() => api('POST', '/api/open', { path: result.dir })}><${Icon} name="folder" /> Open folder</button>
        ${result.csv && html`<a class="btn" href=${result.csv} download><${Icon} name="download" /> Spreadsheet (CSV)</a>`}
        <span class="muted">${result.dir}</span>
      </div>
      ${result.ads.map((m) => html`
        <div class="result-ad" key=${m.id}>
          <h4>${m.id}</h4>
          <div class="result-files">
            ${m.files.map((f) => html`
              <a href=${f.url} target="_blank" class="result-file" key=${f.file} title=${f.file}>
                ${f.kind === 'video' ? html`<video src=${f.url} muted loop autoplay playsinline></video>` : html`<img src=${f.url} loading="lazy" />`}
                <small>${f.kind === 'video' ? '▶ ' : ''}${f.format}</small>
              </a>`)}
          </div>
        </div>`)}
    <//>`;
}

function SaveModal({ d, onClose }) {
  const { brand } = useApp();
  const [name, setName] = useState(d.campaign || 'my-campaign');
  const save = async () => {
    try {
      const shared = { templates: d.templates, palettes: d.palettes, formats: d.formats };
      if (d.mode === 'bulk') {
        await api('PUT', `/api/catalog/${encodeURIComponent(name)}`, {
          brand: brand.id, campaign: d.campaign || name, defaults: { ...shared, content: d.content }, items: d.rows.filter(hasCopy).map((r) => nonEmpty(r)),
        });
      } else {
        const headlines = [d.content.headline, ...d.variants.filter((v) => v.trim())];
        const item = { ...d.content, ...shared, headline: headlines.length > 1 ? headlines : d.content.headline, ...(Object.keys(d.captions).length ? { captions: d.captions } : {}) };
        await api('POST', `/api/catalog/${encodeURIComponent(name)}/item`, { item, brand: brand.id, campaign: d.campaign || name });
      }
      toast(`Saved to “${name}”`);
      onClose();
    } catch (e) { toast(e.message, 'err'); }
  };
  return html`
    <${Modal} title="Save for later" onClose=${onClose}>
      <p class="muted">${d.mode === 'bulk' ? 'Saves the whole list and its settings as a campaign.' : 'Adds this ad to a campaign (created if new). Re-render it anytime from Saved & exports.'}</p>
      <${Field} label="Campaign name"><input value=${name} onInput=${(e) => setName(e.target.value)} /><//>
      <div class="row end"><button class="btn primary" onClick=${save}>Save</button></div>
    <//>`;
}

function ExportPanel({ d, set, rows, exporter }) {
  const { brand } = useApp();
  const { job, start: startJob, setPopup } = exporter;
  const [saving, setSaving] = useState(false);
  const animated = isAnimated(d.content);
  const o = d.output;
  const ads = d.mode === 'bulk' ? rows.length : 1 + d.variants.filter((v) => v.trim()).length;
  const combos = ads * d.templates.length * d.palettes.length * d.formats.length;
  const video = animated && o.video;
  const still = !video || o.still;
  const gif = animated && !!o.gif;
  const files = combos * ((still ? 1 : 0) + (video ? 1 : 0) + (gif ? 1 : 0));
  const setOut = (p) => set({ output: { ...o, ...p } });

  const start = () => {
    if (!d.formats.length) return toast('Pick at least one size', 'err');
    if (d.mode === 'bulk' && !rows.length) return toast('Add some ads to the list first', 'err');
    const headlines = [d.content.headline, ...d.variants.filter((v) => v.trim())];
    const content = { ...d.content, ...(Object.keys(d.captions).length && d.mode === 'single' ? { captions: d.captions } : {}) };
    return startJob({
      mode: d.mode, brand: brand.id, campaign: d.campaign, content,
      variants: d.mode === 'single' && headlines.length > 1 ? headlines.map((headline) => ({ headline })) : undefined,
      rows: d.mode === 'bulk' ? rows : undefined,
      templates: d.templates, palettes: d.palettes, formats: d.formats,
      type: o.type, scale: o.scale, video, gif, still,
      design: d, // saved with the files so this export can be reopened in the builder
    }, { label: `${d.campaign || 'my-campaign'} · ${plural(files, 'file')}`, total: files });
  };
  const running = job?.status === 'running';
  const pct = job?.total ? Math.round((job.done / job.total) * 100) : 0;
  return html`
    <div class="panel export">
      <h3>Export</h3>
      <div class="summary">
        <b>${plural(files, 'file')}</b>
        <span>${d.mode === 'single' && ads > 1 ? `${ads} headline versions` : plural(ads, 'ad')} × ${plural(d.templates.length, 'template')} × ${plural(d.palettes.length, 'colour')} × ${plural(d.formats.length, 'size')}${video ? (still ? ' · images + videos' : ' · videos') : ''}</span>
      </div>
      <${Field} label="Campaign name" hint="folder name"><input value=${d.campaign} onInput=${(e) => set({ campaign: e.target.value })} placeholder="autumn-launch" /><//>
      <${Field} label="File type">
        <${Segmented} value=${o.type} onChange=${(type) => setOut({ type })} options=${[{ value: 'png', label: 'PNG (best)' }, { value: 'jpeg', label: 'JPG (smaller)' }]} />
      <//>
      <${Field} label="Sharpness">
        <${Segmented} value=${o.scale} onChange=${(scale) => setOut({ scale })} options=${[{ value: 1, label: 'Platform size' }, { value: 2, label: 'Extra sharp 2×' }]} />
      <//>
      ${animated && html`
        <${Toggle} checked=${o.video} onChange=${(v) => setOut({ video: v })} label="Export videos (MP4)" />
        ${o.video && html`<${Toggle} checked=${o.still} onChange=${(v) => setOut({ still: v })} label="Also export still images" />`}
        <${Toggle} checked=${!!o.gif} onChange=${(v) => setOut({ gif: v || undefined })} label="Export GIFs (looping, smaller)" />`}
      <button class="btn primary big" disabled=${running || !files} onClick=${start}>
        ${running ? `Rendering… ${pct}%` : html`<${Icon} name="download" /> Export ${plural(files, 'file')}`}
      </button>
      ${running && html`
        <div class="progress clickable" onClick=${() => setPopup(true)} title="Show progress"><div style=${{ width: `${pct}%` }}></div></div>
        <p class="muted small">${job.done} of ${job.total}${job.current ? ` · ${job.current}` : ''}</p>`}
      ${job?.status === 'done' && html`
        <div class="done-box">
          <span>✓ ${plural(job.result.total, 'file')} ready</span>
          <div class="row">
            <button class="btn small" onClick=${() => setPopup(true)}>View</button>
            <button class="btn small" onClick=${() => api('POST', '/api/open', { path: job.result.dir })}><${Icon} name="folder" size=${14} /> Open folder</button>
          </div>
        </div>`}
      ${job?.status === 'error' && html`<p class="error">${job.error}</p>`}
      <button class="btn ghost wide" onClick=${() => setSaving(true)}>Save for later</button>
      <p class="faint small center">Tip: in Canvas view, right-click any ad to export just that one.</p>
      ${saving && html`<${SaveModal} d=${d} onClose=${() => setSaving(false)} />`}
    </div>`;
}

// ── Captions ─────────────────────────────────────────────────────────────────

function CaptionsPanel({ d, set, previewContent }) {
  const { meta, brand, settings } = useApp();
  const name = assistantName(settings);
  const platforms = [...new Set(d.formats.map((f) => meta.formats[f].platform))];
  const [tab, setTab] = useState(null);
  const [gen, setGen] = useState({});
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState(null); // null = closed
  const content = useDebounced(previewContent, 400);
  const p = platforms.includes(tab) ? tab : platforms[0];
  const editable = d.mode === 'single';
  useEffect(() => {
    if (!platforms.length) return;
    api('POST', '/api/captions', { brand: brand.id, content, platforms }).then(setGen).catch(() => {});
  }, [JSON.stringify(content), platforms.join()]);
  if (!p) return null;
  const po = d.content.platformOpts?.[p] ?? {};
  // Per-platform switches live in the design content so previews, exports and Claude all see them.
  const setPo = (key, on) => set((prev) => {
    const all = { ...(prev.content.platformOpts ?? {}) };
    const cur = { ...(all[p] ?? {}), [key]: on ? undefined : false };
    Object.keys(cur).forEach((k) => cur[k] === undefined && delete cur[k]);
    if (Object.keys(cur).length) all[p] = cur; else delete all[p];
    return { content: { ...prev.content, platformOpts: Object.keys(all).length ? all : undefined } };
  });
  const asText = (c) => (c && typeof c === 'object' ? `${c.title}\n\n${c.description}` : c ?? '');
  const value = editable && d.captions[p] != null ? asText(d.captions[p]) : asText(gen[p]);
  const limit = meta.platforms[p]?.limit;
  const onEdit = (v) => {
    const val = p === 'pinterest' ? (() => { const [title, ...rest] = v.split('\n\n'); return { title, description: rest.join('\n\n') }; })() : v;
    set({ captions: { ...d.captions, [p]: val } });
  };
  const writeAll = async () => {
    setBusy(true);
    try {
      const r = await api('POST', '/api/captions/ai', { brand: brand.id, content: previewContent, platforms, prompt: brief?.trim() || undefined });
      set((prev) => ({ captions: { ...prev.captions, ...r } }));
      toast(`${name} wrote ${plural(Object.keys(r).length, 'caption')}`);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const sw = (key, label, on) => html`<button type="button" class="po ${on ? 'on' : ''}" onClick=${() => setPo(key, !on)} title=${`${on ? 'Turn off' : 'Turn on'} ${label.toLowerCase()} for ${meta.platforms[p]?.label ?? p}`}>${on ? '✓' : '✕'} ${label}</button>`;
  return html`
    <div class="panel captions">
      <div class="row between nowrap">
        <h3>Captions</h3>
        ${editable && html`<div class="row nowrap">
          <button class="btn small ai" disabled=${busy} onClick=${writeAll} title="Write a caption for every platform, in each one's style"><${Icon} name="sparkles" size=${13} /> ${busy ? 'Writing…' : `Write with ${name}`}</button>
          <button class="icon-btn" title="Add a brief" onClick=${() => setBrief(brief === null ? '' : null)}><span style=${{ display: 'inline-flex', transform: brief !== null ? 'rotate(180deg)' : '' }}><${Icon} name="chevron" /></span></button>
        </div>`}
      </div>
      ${brief !== null && html`<textarea rows="2" class="cap-brief" value=${brief} onInput=${(e) => setBrief(e.target.value)} placeholder="Anything to mention? e.g. the launch date, a question to drive comments"></textarea>`}
      <div class="pills small">${platforms.map((x) => html`<button class=${x === p ? 'on' : ''} onClick=${() => setTab(x)}>${meta.platforms[x]?.label ?? x}${editable && d.captions[x] != null ? ' •' : ''}${d.content.platformOpts?.[x]?.caption === false ? ' (off)' : ''}</button>`)}</div>
      <div class="po-row">${sw('caption', 'Caption', po.caption !== false)}${sw('link', 'Link', po.link !== false)}${sw('hashtags', 'Hashtags', po.hashtags !== false)}${sw('cta', 'Button on ad', po.cta !== false)}</div>
      ${po.caption === false
        ? html`<p class="muted small">No caption for ${meta.platforms[p]?.label ?? p}: exports skip it.</p>`
        : html`
          <textarea rows="9" value=${value} readonly=${!editable} onInput=${(e) => onEdit(e.target.value)}></textarea>
          <div class="row between">
            <span class="muted small ${limit && value.length > limit ? 'over' : ''}">${value.length}${limit ? ` / ${limit}` : ''}</span>
            <div class="row">
              ${editable && d.captions[p] != null && html`<button class="btn small ghost" onClick=${() => { const { [p]: _, ...rest } = d.captions; set({ captions: rest }); }}>Reset</button>`}
              <button class="btn small" onClick=${() => navigator.clipboard.writeText(value).then(() => toast('Caption copied'))}>Copy</button>
            </div>
          </div>`}
      ${!editable && html`<p class="muted small">In bulk mode each ad gets its own caption automatically. They're all in the exported spreadsheet.</p>`}
    </div>`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function CreatePage() {
  const { meta } = useApp();
  const [d, set, setContent, focusState, setFocusState, history] = useDesign();
  const rows = useMemo(() => d.rows.filter(hasCopy).map((r) => nonEmpty(r)), [d.rows]);
  // Every ad being made: the rows of a bulk list, or the main headline plus its versions.
  const ads = useMemo(() => (d.mode === 'bulk'
    ? (rows.length ? rows : [{ headline: 'Add ads to your list' }]).map((r, i) => ({ label: `Ad ${i + 1}`, content: { ...d.content, ...r } }))
    : [d.content.headline, ...d.variants.filter((v) => v.trim())].map((h, i) => ({ label: i ? `Version ${i + 1}` : 'Main', content: { ...d.content, headline: h } }))),
  [d.mode, rows, d.content, d.variants]);
  const focus = {
    template: d.templates.includes(focusState.template) ? focusState.template : d.templates[0],
    palette: d.palettes.includes(focusState.palette) ? focusState.palette : d.palettes[0],
    format: d.formats.includes(focusState.format) ? focusState.format : d.formats[0],
    row: Math.max(0, Math.min(focusState.row ?? 0, ads.length - 1)),
  };
  const setFocus = (p) => setFocusState({ ...focus, ...p });
  const previewContent = ads[focus.row].content;
  const usedFields = new Set(meta.templates.filter((t) => d.templates.includes(t.id)).flatMap((t) => t.fields));
  const extras = Object.keys(EXTRA_FIELDS).filter((k) => usedFields.has(k));
  const [selected, setSelected] = useState(null);
  const exporter = useExporter();

  return html`
    <div class="create">
      <aside class="steps panel-card glass">
        <${WordsStep} d=${d} set=${set} setContent=${setContent} extras=${extras} usedFields=${usedFields} />
        <${LookStep} d=${d} set=${set} setContent=${setContent} previewContent=${previewContent} />
        <${MotionStep} d=${d} set=${set} setContent=${setContent} />
        <${SizesStep} d=${d} set=${set} />
      </aside>
      <${Stage} d=${d} set=${set} setContent=${setContent} previewContent=${previewContent} focus=${focus} setFocus=${setFocus} ads=${ads} selected=${selected} setSelected=${setSelected} history=${history} exporter=${exporter} />
      <aside class="side panel-card glass">
        <${ExportPanel} d=${d} set=${set} rows=${rows} exporter=${exporter} />
        <${CaptionsPanel} d=${d} set=${set} previewContent=${previewContent} />
      </aside>
      ${exporter.popup && html`<${RenderPopup} exporter=${exporter} />`}
    </div>`;
}
