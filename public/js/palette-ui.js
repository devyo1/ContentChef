// Colour palette UI: cards, a visual editor with colour pickers, and the ready-made library.
import { html, useState, useEffect, api, useApp, AdFrame, Field, Modal, toast, inkOn } from './lib.js';
import { generatePalette, contrast, glowColors, HARMONIES, MOODS } from './color.js';

export const COLOR_FIELDS = [
  { key: 'bg', label: 'Background' },
  { key: 'fg', label: 'Text' },
  { key: 'accent', label: 'Highlight' },
  { key: 'muted', label: 'Secondary text' },
  { key: 'ctaBg', label: 'Button', fallback: 'accent' },
  { key: 'ctaText', label: 'Button text', fallback: 'bg' },
];

export const slug = (s) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (c) => (/^#[0-9a-f]{3}$/i.test(c) ? `#${c.slice(1).split('').map((x) => x + x).join('')}` : c);

export function ColorInput({ value, onChange, label }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return html`
    <label class="color-input" title=${label}>
      <input type="color" value=${norm(value)} onInput=${(e) => onChange(e.target.value.toUpperCase())} />
      <span class="color-meta"><small>${label}</small>
        <input class="hex" value=${text} onInput=${(e) => { setText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toUpperCase()); }} />
      </span>
    </label>`;
}

/** A small rendering of what the palette looks like on an ad. */
export function PaletteMini({ p, font = 'inherit', label }) {
  const g = glowColors(p);
  const glow = p.gradient ? `radial-gradient(circle at 20% 15%, ${g[0]}, transparent 60%), radial-gradient(circle at 90% 70%, ${g[1]}, transparent 55%), ${g[3]}` : p.bg;
  return html`
    <div class="pal-mini" style=${{ background: glow, color: p.fg }}>
      <b style=${{ fontFamily: font }}>Aa <span style=${{ color: p.accent }}>Bb</span></b>
      <span class="pal-btn" style=${{ background: p.ctaBg ?? p.accent, color: p.ctaText ?? p.bg }}>Button</span>
      ${label && html`<em style=${{ color: p.muted ?? p.fg }}>${label}</em>`}
    </div>`;
}

export function PaletteCard({ name, p, selected, onClick, font }) {
  return html`
    <button type="button" class="pal-card ${selected ? 'on' : ''}" onClick=${onClick}>
      <${PaletteMini} p=${p} font=${font} />
      <span class="pal-name">${selected && html`<span class="tick">✓</span>`}${name}</span>
    </button>`;
}

export function LibraryModal({ library, onPick, onClose }) {
  return html`
    <${Modal} title="Colour library" onClose=${onClose} wide>
      <p class="muted">Pick a starting point. It's copied into your brand, so you can tweak it freely afterwards.</p>
      <div class="pal-grid">
        ${Object.entries(library).map(([id, { label, ...p }]) => html`
          <${PaletteCard} key=${id} name=${label} p=${p} onClick=${() => onPick(id, label, p)} />`)}
      </div>
    <//>`;
}

/** Edit one palette in place. */
export function PaletteEditor({ name, p, onChange, onRename, onDelete, onDuplicate, onRandomize, canDelete, font }) {
  const set = (k, v) => onChange({ ...p, [k]: v });
  const [glow, setGlow] = useState(!!p.gradient);
  const toggleGlow = (on) => {
    setGlow(on);
    if (on && !p.gradient) onChange({ ...p, gradient: [p.accent, p.muted ?? p.fg, p.fg, p.bg] });
    if (!on) { const { gradient, ...rest } = p; onChange(rest); }
  };
  return html`
    <div class="pal-editor">
      <div class="pal-editor-head">
        <input class="pal-title" value=${name} onChange=${(e) => onRename(e.target.value)} title="Palette name" />
        <div class="grow"></div>
        ${onRandomize && html`<button class="btn small soft" onClick=${onRandomize} title="Generate matching colours">🎲 Randomize</button>`}
        <button class="btn small ghost" onClick=${onDuplicate}>Duplicate</button>
        ${canDelete && html`<button class="btn small ghost danger" onClick=${onDelete}>Delete</button>`}
      </div>
      <div class="pal-editor-body">
        <${PaletteMini} p=${p} font=${font} label="Secondary" />
        <div class="color-grid">
          ${COLOR_FIELDS.map((f) => html`<${ColorInput} key=${f.key} label=${f.label} value=${p[f.key] ?? p[f.fallback] ?? '#000000'} onChange=${(v) => set(f.key, v)} />`)}
        </div>
      </div>
      <label class="check"><input type="checkbox" checked=${glow} onChange=${(e) => toggleGlow(e.target.checked)} /> Custom glow colours <span class="muted">(used by Aurora & Gradient backgrounds and Liquid Glass)</span></label>
      ${glow && p.gradient && html`
        <div class="color-grid four">
          ${p.gradient.map((c, i) => html`<${ColorInput} key=${i} label=${`Glow ${i + 1}`} value=${c} onChange=${(v) => set('gradient', p.gradient.map((x, j) => (j === i ? v : x)))} />`)}
        </div>`}
    </div>`;
}

/** Strip server-only fields before saving a brand wholesale (keeps `version` for stale-save checks). */
export function brandForSave(brand) {
  const { id, assets, ...rest } = brand;
  return rest;
}

/** Modal to edit a brand's palettes from anywhere (e.g. the Create page). */
export function PalettesModal({ brand, library, onClose, onSaved }) {
  const [pals, setPals] = useState(brand.palettes);
  const [lib, setLib] = useState(false);
  const [gen, setGen] = useState(null); // { target: palette name } or { target: null } for a new one
  const [busy, setBusy] = useState(false);
  const font = brand.fonts?.display?.family;
  const uniq = (base) => { let n = base; for (let i = 2; pals[n]; i++) n = `${base}-${i}`; return n; };
  const rename = (from, to) => {
    const key = to.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!key || key === from || pals[key]) return;
    setPals(Object.fromEntries(Object.entries(pals).map(([k, v]) => (k === from ? [key, v] : [k, v]))));
  };
  const save = async () => {
    setBusy(true);
    try {
      await api('PUT', `/api/brand/${brand.id}`, { ...brandForSave(brand), palettes: pals });
      toast('Colours saved');
      onSaved(Object.keys(pals));
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return html`
    <${Modal} title=${`${brand.name} colours`} onClose=${onClose} wide>
      <div class="pal-editors">
        ${Object.entries(pals).map(([name, p]) => html`
          <${PaletteEditor} key=${name} name=${name} p=${p} font=${font} canDelete=${Object.keys(pals).length > 1}
            onChange=${(np) => setPals({ ...pals, [name]: np })}
            onRename=${(to) => rename(name, to)}
            onDuplicate=${() => setPals({ ...pals, [uniq(`${name}-copy`)]: { ...p } })}
            onRandomize=${() => setGen({ target: name })}
            onDelete=${() => { const { [name]: _, ...rest } = pals; setPals(rest); }} />`)}
      </div>
      <div class="row between sticky-foot">
        <div class="row">
          <button class="btn soft" onClick=${() => setGen({ target: null })}>🎲 Generate new</button>
          <button class="btn" onClick=${() => setPals({ ...pals, [uniq('new')]: { bg: '#FFFFFF', fg: '#111111', accent: '#FF5A36', muted: '#666666', ctaText: '#FFFFFF' } })}>＋ Blank palette</button>
          <button class="btn" onClick=${() => setLib(true)}>＋ From library</button>
        </div>
        <button class="btn primary" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save colours'}</button>
      </div>
      ${lib && html`<${LibraryModal} library=${library} onClose=${() => setLib(false)}
        onPick=${(id, label, p) => { setPals({ ...pals, [uniq(id)]: { ...p } }); setLib(false); }} />`}
      ${gen && html`<${GeneratorModal} brand=${brand} initial=${gen.target ? pals[gen.target] : null}
        applyLabel=${gen.target ? 'Use these colours' : 'Add to brand'} onClose=${() => setGen(null)}
        onApply=${(p, label) => { const key = gen.target ?? uniq(slug(label) || 'generated'); setPals({ ...pals, [key]: p }); setGen(null); }} />`}
    <//>`;
}

// ── Colour generator (coolors-style) ────────────────────────────────────────

const ROLES = [['bg', 'Background'], ['fg', 'Text'], ['accent', 'Highlight'], ['muted', 'Secondary'], ['ctaBg', 'Button'], ['ctaText', 'Button text']];
const full = (p) => ({ ...p, ctaBg: p.ctaBg ?? p.accent, ctaText: p.ctaText ?? p.bg, muted: p.muted ?? p.fg });
/** Drop redundant fields so saved palettes stay tidy. */
function tidy(p) {
  const out = { ...p };
  if (out.ctaBg === out.accent) delete out.ctaBg;
  return out;
}

/**
 * Generate harmonious palettes with locks, like coolors.co: Space = new palette, click a colour to
 * edit it, the lock keeps it while everything else is rebuilt to match.
 */
export function GeneratorModal({ brand, initial, title = 'Colour generator', applyLabel = 'Add to brand', onApply, onClose }) {
  const { meta, workspace } = useApp();
  const [harmony, setHarmony] = useState('random');
  const [mood, setMood] = useState('random');
  const [locks, setLocks] = useState({});
  const [cur, setCur] = useState(() => (initial ? { palette: full(initial), name: 'Current colours' } : generatePalette()));
  const [history, setHistory] = useState([]);
  const [name, setName] = useState('');
  const p = full(cur.palette);

  const regenerate = () => {
    const locked = Object.fromEntries(ROLES.filter(([k]) => locks[k]).map(([k]) => [k, p[k]]));
    setHistory((h) => [cur, ...h].slice(0, 12));
    setCur(generatePalette({ harmony, mood, locked }));
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) return;
      e.preventDefault();
      regenerate();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  const setColor = (k, v) => { setCur({ ...cur, palette: { ...p, [k]: v } }); setLocks((l) => ({ ...l, [k]: true })); };
  const checks = [
    ['Text', contrast(p.fg, p.bg), 4.5],
    ['Highlight', contrast(p.accent, p.bg), 3],
    ['Button', contrast(p.ctaText, p.ctaBg), 4.5],
  ];
  // Preview on what you're actually making (the editor's current design for this brand) when there is one.
  const design = workspace?.brand === brand.id ? workspace.design : null;
  const sample = { eyebrow: 'New this season', headline: `${brand.tagline || 'Say it'} *big*.`, subhead: 'One supporting line that sells it.', cta: 'Shop now' };
  const designContent = design && (design.mode === 'bulk'
    ? { ...design.content, ...(design.rows ?? []).find((r) => (r.headline ?? '').trim()) }
    : design.content);
  const content = designContent?.headline ? { ...designContent, animation: 'none', effects: undefined } : sample;
  const known = new Set(meta.templates.map((t) => t.id));
  const designTemplates = (design?.templates ?? []).filter((t) => known.has(t));
  const templates = designTemplates.length ? designTemplates.slice(0, 4) : ['headline', 'glass', 'stack', 'minimal'];
  const focusFormat = workspace?.focus?.format;
  const format = design && meta.formats[focusFormat] && (design.formats ?? []).includes(focusFormat) ? focusFormat : 'ig-square';
  const req = (template) => ({
    brand: { ...brandForSave(brand), palettes: { preview: tidy(p) } }, brandId: brand.id, template, palette: 'preview',
    format, formatInfo: meta.formats[format], content,
  });
  return html`
    <${Modal} title=${title} onClose=${onClose} wide>
      <div class="gen-controls">
        <${Field} label="Colour harmony">
          <select value=${harmony} onChange=${(e) => setHarmony(e.target.value)}>
            <option value="random">Surprise me</option>
            ${Object.entries(HARMONIES).map(([k, h]) => html`<option value=${k}>${h.name}</option>`)}
          </select>
        <//>
        <${Field} label="Mood">
          <select value=${mood} onChange=${(e) => setMood(e.target.value)}>
            <option value="random">Any</option>
            ${Object.entries(MOODS).map(([k, m]) => html`<option value=${k}>${m.name}</option>`)}
          </select>
        <//>
        <button class="btn primary" onClick=${regenerate}>🎲 Generate</button>
        <span class="muted small">or press <span class="kbd">Space</span></span>
      </div>
      <div class="gen-strip">
        ${ROLES.map(([k, label]) => html`
          <div class="gen-col ${locks[k] ? 'locked' : ''}" key=${k} style=${{ background: p[k], color: inkOn(p[k]) }} title="Click to edit">
            <input type="color" value=${p[k]} onInput=${(e) => setColor(k, e.target.value.toUpperCase())} />
            ${locks[k] && html`<span class="lock-tag">Locked</span>`}
            <button class=${`lock ${locks[k] ? 'on' : ''}`} title=${locks[k] ? 'Locked: Generate keeps this colour. Click to unlock.' : 'Lock this colour'} aria-pressed=${!!locks[k]} style=${locks[k] ? { background: inkOn(p[k]), color: p[k] } : null}
              onClick=${(e) => { e.stopPropagation(); setLocks((l) => ({ ...l, [k]: !l[k] })); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2.5" fill=${locks[k] ? 'currentColor' : 'none'} />
                <path d=${locks[k] ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.6-1.8'} />
              </svg>
            </button>
            <span class="hexv">${p[k].replace('#', '')}</span>
            <small>${label}</small>
          </div>`)}
      </div>
      <div class="gen-meta">
        <span>${cur.name}</span>
        ${cur.harmony && html`<span>${HARMONIES[cur.harmony]?.name}</span>`}
        ${cur.mood && html`<span>${MOODS[cur.mood]?.name}</span>`}
        ${checks.map(([l, v, min]) => html`<span class=${v >= min ? 'pass' : 'fail'} title="WCAG contrast ratio">${l} ${v.toFixed(1)}:1 ${v >= min ? '✓' : '✕'}</span>`)}
      </div>
      <h5>${designTemplates.length ? 'Your design in these colours' : 'Preview'}</h5>
      <div class="gen-previews">
        ${templates.map((t) => html`<${AdFrame} key=${t} still req=${req(t)} fit=${{ width: 200, height: 250 }} />`)}
      </div>
      ${history.length > 0 && html`
        <h5>Recent</h5>
        <div class="gen-history">${history.map((h, i) => html`
          <button key=${i} title=${h.name} onClick=${() => { setHistory([cur, ...history.filter((_, j) => j !== i)].slice(0, 12)); setCur(h); }}>
            ${ROLES.map(([k]) => html`<i style=${{ background: full(h.palette)[k] }}></i>`)}
          </button>`)}</div>`}
      <div class="row between sticky-foot">
        <div class="row nowrap" style=${{ flex: 1, maxWidth: '320px' }}>
          ${applyLabel === 'Add to brand' && html`<input placeholder=${cur.name} value=${name} onInput=${(e) => setName(e.target.value)} title="Palette name" />`}
        </div>
        <div class="row">
          <button class="btn ghost" onClick=${onClose}>Cancel</button>
          <button class="btn primary" onClick=${() => onApply(tidy(p), (name || cur.name).trim())}>${applyLabel}</button>
        </div>
      </div>
    <//>`;
}
