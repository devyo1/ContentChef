// "Brand & colours" page: everything that makes a brand look like itself, edited visually.
import { html, useState, useEffect, useRef, api, useApp, AdFrame, Field, Toggle, Segmented, toast, uploadFile, isVideo, brandAssetUrl } from './lib.js';
import { PaletteEditor, LibraryModal, GeneratorModal, brandForSave, slug } from './palette-ui.js';

// Load every library font once (regular weight) so the pickers can show each font in its own face.
function useFontLibraryCss(fonts) {
  useEffect(() => {
    if (document.getElementById('font-lib')) return;
    const link = document.createElement('link');
    link.id = 'font-lib';
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${f.family.replace(/\s+/g, '+')}`).join('&')}&display=swap`;
    document.head.append(link);
  }, []);
}

function FontPicker({ fonts, value, onChange, sample }) {
  const [open, setOpen] = useState(false);
  const current = fonts.find((f) => f.family === value.family);
  const pick = (f) => {
    const target = value.weight ?? 400;
    const weight = f.weights.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), f.weights[0]);
    onChange({ family: f.family, weight, google: f.google });
    setOpen(false);
  };
  const cats = [...new Set(fonts.map((f) => f.category))];
  return html`
    <div class="font-picker">
      <div class="row">
        <button type="button" class="font-btn" onClick=${() => setOpen(!open)} style=${{ fontFamily: `'${value.family}'`, fontWeight: value.weight }}>
          <span>${value.family}</span><span class="chev">▾</span>
        </button>
        <select value=${value.weight} onChange=${(e) => onChange({ ...value, weight: Number(e.target.value) })} title="Weight">
          ${(current?.weights ?? [value.weight ?? 400]).map((w) => html`<option value=${w}>${{ 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }[w] ?? w}</option>`)}
        </select>
      </div>
      ${open && html`
        <div class="font-list">
          ${cats.map((c) => html`
            <div key=${c}><h5>${c}</h5>
              ${fonts.filter((f) => f.category === c).map((f) => html`
                <button type="button" key=${f.family} class=${f.family === value.family ? 'on' : ''} onClick=${() => pick(f)}>
                  <span style=${{ fontFamily: `'${f.family}'` }}>${sample ?? f.family}</span><small>${f.family}</small>
                </button>`)}
            </div>`)}
        </div>`}
    </div>`;
}

function BrandSection({ title, hint, children }) {
  return html`<section class="bsec"><header><h3>${title}</h3>${hint && html`<p>${hint}</p>`}</header>${children}</section>`;
}

export function BrandsPage() {
  const { meta, brand, reload } = useApp();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const [b, setB] = useState(() => clone(brand));
  const [base, setBase] = useState(brand); // the saved copy `b` was started from
  const justSaved = useRef(false);
  const [lib, setLib] = useState(false);
  const [gen, setGen] = useState(null); // { target: palette name | null }
  const [busy, setBusy] = useState(false);
  const [previewPal, setPreviewPal] = useState(null);
  useFontLibraryCss(meta.fonts);
  const dirty = JSON.stringify(b) !== JSON.stringify(base);
  // Pick up newer saved versions (e.g. edited in another window) unless you have unsaved edits.
  useEffect(() => {
    if (justSaved.current || !dirty) { setB(clone(brand)); setBase(brand); justSaved.current = false; }
  }, [brand]);
  const set = (patch) => setB({ ...b, ...patch });
  const setStyle = (patch) => setB({ ...b, style: { ...b.style, ...patch } });
  const setCaps = (patch) => setB({ ...b, captions: { ...b.captions, ...patch } });
  const pals = b.palettes;
  const uniq = (base) => { let n = base; for (let i = 2; pals[n]; i++) n = `${base}-${i}`; return n; };
  const pal = pals[previewPal] ? previewPal : Object.keys(pals)[0];

  const save = async () => {
    setBusy(true);
    try {
      await api('PUT', `/api/brand/${brand.id}`, brandForSave(b));
      justSaved.current = true;
      await reload();
      toast('Brand saved');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const upload = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      try { await uploadFile(brand.id, f); toast(`Added ${f.name}`); } catch (err) { toast(err.message, 'err'); }
    }
    const m = await reload();
    const fresh = m?.brands.find((x) => x.id === brand.id);
    if (fresh) setB({ ...b, assets: fresh.assets });
  };
  const images = (b.assets ?? []).filter((a) => !isVideo(a));
  const previewContent = { eyebrow: 'New this season', headline: `${b.tagline || 'Say it'} *big*.`, subhead: 'One supporting line that sells it.', cta: 'Shop now' };
  // Preview with unsaved edits: the server merges this object over the saved brand.
  const previewReq = (template, format) => ({ brand: brandForSave({ ...b, id: brand.id }), brandId: brand.id, template, palette: pal, format, formatInfo: meta.formats[format], content: previewContent });

  return html`
    <div class="brand-page">
      <main class="brand-form">
        <div class="brand-head">
          <div><h2>${b.name}</h2><p class="muted">Everything here applies to every ad you make for this brand.</p></div>
          <button class="btn primary" disabled=${!dirty || busy} onClick=${save}>${busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>

        <${BrandSection} title="Name">
          <div class="two">
            <${Field} label="Brand name"><input value=${b.name} onInput=${(e) => set({ name: e.target.value })} /><//>
            <${Field} label="Tagline" hint="optional"><input value=${b.tagline ?? ''} onInput=${(e) => set({ tagline: e.target.value })} /><//>
          </div>
          <${Field} label="Social handle" hint="shown on value posts and text posts">
            <input value=${b.handle ?? ''} placeholder=${`@${brand.id.replace(/-/g, '')}`} onInput=${(e) => set({ handle: e.target.value })} />
          <//>
        <//>

        <${BrandSection} title="Logo" hint="Shown on most templates. Transparent PNG or SVG works best.">
          <div class="logo-grid">
            <button type="button" class=${`logo-tile ${!b.logo ? 'on' : ''}`} onClick=${() => set({ logo: null })}>
              <span class="wordmark-demo" style=${{ fontFamily: `'${b.fonts.display.family}'`, fontWeight: b.fonts.display.weight }}>${b.name}</span><small>Use brand name</small></button>
            ${images.map((a) => html`
              <button type="button" key=${a} class=${`logo-tile ${b.logo === a ? 'on' : ''}`} onClick=${() => set({ logo: a })}>
                <img src=${brandAssetUrl(brand.id, a)} /><small>${a.replace('assets/', '')}</small></button>`)}
            <label class="logo-tile upload"><span>＋</span><small>Upload logo</small><input type="file" accept="image/*" hidden onChange=${upload} /></label>
          </div>
        <//>

        <${BrandSection} title="Fonts" hint="Headline font sets the personality; body font keeps small text readable.">
          <div class="two">
            <${Field} label="Headlines"><${FontPicker} fonts=${meta.fonts} value=${b.fonts.display} sample=${b.name} onChange=${(v) => set({ fonts: { ...b.fonts, display: v } })} /><//>
            <${Field} label="Body text & buttons"><${FontPicker} fonts=${meta.fonts} value=${b.fonts.body} onChange=${(v) => set({ fonts: { ...b.fonts, body: v } })} /><//>
          </div>
          <div class="three">
            <${Field} label="Headline capitals">
              <${Segmented} value=${b.style.headlineCase === 'upper' ? 'upper' : 'none'} onChange=${(v) => setStyle({ headlineCase: v })} options=${[{ value: 'none', label: 'As typed' }, { value: 'upper', label: 'UPPERCASE' }]} />
            <//>
            <${Field} label="Letter spacing" hint=${b.style.headlineTracking}>
              <input type="range" min="-0.06" max="0.1" step="0.005" value=${parseFloat(b.style.headlineTracking) || 0} onInput=${(e) => setStyle({ headlineTracking: `${Number(e.target.value).toFixed(3)}em` })} />
            <//>
            <${Field} label="Line spacing" hint=${b.style.headlineLeading}>
              <input type="range" min="0.8" max="1.3" step="0.02" value=${b.style.headlineLeading} onInput=${(e) => setStyle({ headlineLeading: Number(e.target.value) })} />
            <//>
          </div>
        <//>

        <${BrandSection} title="Colours" hint="Each palette is one colourway. Pick several on the Create page to get every ad in each colourway.">
          <div class="pal-editors">
            ${Object.entries(pals).map(([name, p]) => html`
              <${PaletteEditor} key=${name} name=${name} p=${p} font=${`'${b.fonts.display.family}'`} canDelete=${Object.keys(pals).length > 1}
                onChange=${(np) => { set({ palettes: { ...pals, [name]: np } }); setPreviewPal(name); }}
                onRename=${(to) => {
                  const key = to.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                  if (key && !pals[key]) set({ palettes: Object.fromEntries(Object.entries(pals).map(([k, v]) => (k === name ? [key, v] : [k, v]))) });
                }}
                onDuplicate=${() => set({ palettes: { ...pals, [uniq(`${name}-copy`)]: { ...p } } })}
                onRandomize=${() => setGen({ target: name })}
                onDelete=${() => { const { [name]: _, ...rest } = pals; set({ palettes: rest }); }} />`)}
          </div>
          <div class="row">
            <button class="btn" onClick=${() => set({ palettes: { ...pals, [uniq('new')]: { bg: '#FFFFFF', fg: '#111111', accent: '#FF5A36', muted: '#666666', ctaText: '#FFFFFF' } } })}>＋ Blank palette</button>
            <button class="btn" onClick=${() => setLib(true)}>＋ From colour library</button>
            <button class="btn soft" onClick=${() => setGen({ target: null })}>Generate a palette</button>
          </div>
        <//>

        <${BrandSection} title="Style">
          <div class="two">
            <${Field} label="Button shape">
              <${Segmented} value=${b.style.radius >= 999 ? 999 : b.style.radius > 0 ? 16 : 0} onChange=${(radius) => setStyle({ radius })}
                options=${[{ value: 999, label: 'Pill' }, { value: 16, label: 'Rounded' }, { value: 0, label: 'Square' }]} />
            <//>
            <${Field} label="Text alignment">
              <${Segmented} value=${b.style.align ?? 'left'} onChange=${(align) => setStyle({ align })} options=${[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }]} />
            <//>
            <${Field} label="Darken photos" hint=${`${Math.round((b.style.overlay ?? 0.45) * 100)}%`}>
              <input type="range" min="0" max="0.9" step="0.05" value=${b.style.overlay ?? 0.45} onInput=${(e) => setStyle({ overlay: Number(e.target.value) })} />
            <//>
            <${Field} label="Default background">
              <select value=${b.style.bgStyle ?? 'solid'} onChange=${(e) => setStyle({ bgStyle: e.target.value })}>
                ${meta.bgStyles.map((s) => html`<option value=${s.id}>${s.name}</option>`)}
              </select>
            <//>
          </div>
          <${Toggle} checked=${!!b.style.grain} onChange=${(grain) => setStyle({ grain })} label="Film grain texture" />
        <//>

        <${BrandSection} title="Audience & ad goals" hint="Your assistant uses this context when writing copy and captions.">
          <${Field} label="What you offer"><textarea rows="3" value=${b.strategy?.description ?? ''} onInput=${(e) => set({ strategy: { ...b.strategy, description: e.target.value } })} /><//>
          <${Field} label="Who you want to reach"><textarea rows="3" value=${b.strategy?.audience ?? ''} onInput=${(e) => set({ strategy: { ...b.strategy, audience: e.target.value } })} /><//>
          <${Field} label="Ad goals & direction"><textarea rows="3" value=${b.strategy?.brief ?? ''} onInput=${(e) => set({ strategy: { ...b.strategy, brief: e.target.value } })} placeholder="What should your ads promote?" /><//>
        <//>

        <${BrandSection} title="Captions" hint="Used to write platform captions. AI assistants also read the voice notes.">
          <${Field} label="Brand voice" hint="how should captions sound?">
            <textarea rows="2" value=${b.captions?.voice ?? ''} onInput=${(e) => setCaps({ voice: e.target.value })} placeholder="Warm, cheeky, short sentences. Never salesy." />
          <//>
          <div class="two">
            <${Field} label="Hashtags" hint="separate with spaces or commas">
              <input value=${(b.captions?.hashtags ?? []).join(' ')} onChange=${(e) => setCaps({ hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean) })} />
            <//>
            <${Field} label="Website link"><input value=${b.captions?.link ?? ''} onInput=${(e) => setCaps({ link: e.target.value })} placeholder="https://" /><//>
          </div>
          <${Field} label="Sign-off" hint="added to longer captions"><input value=${b.captions?.signoff ?? ''} onInput=${(e) => setCaps({ signoff: e.target.value })} /><//>
        <//>

        <${BrandSection} title="Media library" hint="Photos, videos (B-roll) and font files for this brand.">
          <div class="asset-grid">
            ${(b.assets ?? []).map((a) => html`
              <figure key=${a}>
                ${isVideo(a) ? html`<video src=${brandAssetUrl(brand.id, a)} muted loop onMouseEnter=${(e) => e.target.play()} onMouseLeave=${(e) => e.target.pause()}></video>` : html`<img src=${brandAssetUrl(brand.id, a)} loading="lazy" />`}
                <figcaption>${a.replace('assets/', '')}</figcaption>
              </figure>`)}
            <label class="asset-up"><span>＋</span>Add files<input type="file" multiple accept="image/*,video/*,.woff2,.woff,.ttf,.otf" hidden onChange=${upload} /></label>
          </div>
        <//>
      </main>

      <aside class="brand-preview glass panel-card">
        <h3>Preview ${dirty && html`<span class="badge">unsaved</span>`}</h3>
        ${Object.keys(pals).length > 1 && html`<div class="pills small">${Object.keys(pals).map((p) => html`<button class=${p === pal ? 'on' : ''} onClick=${() => setPreviewPal(p)}>${p}</button>`)}</div>`}
        <div class="preview-stack">
          <${AdFrame} still req=${previewReq('headline', 'ig-square')} fit=${{ width: 300 }} />
          <div class="row">
            <${AdFrame} still req=${previewReq('glass', 'story')} fit=${{ width: 145 }} />
            <${AdFrame} still req=${previewReq('stack', 'story')} fit=${{ width: 145 }} />
          </div>
        </div>
      </aside>
      ${gen && html`<${GeneratorModal} brand=${b} initial=${gen.target ? pals[gen.target] : null}
        applyLabel=${gen.target ? 'Use these colours' : 'Add to brand'} onClose=${() => setGen(null)}
        onApply=${(p, label) => { const k = gen.target ?? uniq(slug(label) || 'generated'); set({ palettes: { ...pals, [k]: p } }); setPreviewPal(k); setGen(null); }} />`}
      ${lib && html`<${LibraryModal} library=${meta.paletteLibrary} onClose=${() => setLib(false)}
        onPick=${(id, label, p) => { const k = uniq(id); set({ palettes: { ...pals, [k]: { ...p } } }); setPreviewPal(k); setLib(false); }} />`}
    </div>`;
}
