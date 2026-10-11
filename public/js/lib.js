// Shared UI plumbing: Preact + htm, API calls, small helpers and reusable components.
import { h, render, createContext, createPortal } from 'preact';
import { useState, useEffect, useRef, useMemo, useContext, useCallback } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, createContext, useState, useEffect, useRef, useMemo, useContext, useCallback };

export async function api(method, url, body, { signal } = {}) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export async function uploadFile(brand, file) {
  const res = await fetch(`/api/upload?brand=${encodeURIComponent(brand)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.ref;
}

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [JSON.stringify(value)]);
  return v;
}

export const store = {
  get(k, fallback) { try { const v = localStorage.getItem(`adgen.${k}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(`adgen.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

export const isVideo = (ref) => /\.(mp4|mov|webm|m4v|mkv)$/i.test(ref ?? '');
export const brandAssetUrl = (brand, ref) => `/brands/${encodeURIComponent(brand)}/${ref.split('/').map(encodeURIComponent).join('/')}`;
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const clean = (s) => String(s ?? '').replace(/[*_|]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Live ad preview. Double-buffered: each update renders into a hidden iframe and is swapped in
 * only once it's fully drawn (fonts loaded, text fitted), so the preview never flashes or shows a
 * loading state, it just changes. The previous frame is then blanked to free its resources.
 * `fit` = { width?, height? } box in CSS px the ad must fit inside.
 */
export function AdFrame({ req, fit, onClick, still, interactive, roles, selected, onSelect, onMove, onMeasure }) {
  const frames = [useRef(), useRef()];
  const active = useRef(-1); // index of the visible iframe, -1 before the first paint
  const [shown, setShown] = useState(-1);
  const token = useRef(0);
  const debounced = useDebounced(req, 160);
  const sel = useRef({ selected, onSelect, roles, onMove, onMeasure });
  sel.current = { selected, onSelect, roles, onMove, onMeasure };
  const fmt = req.formatInfo;
  const s = Math.min(fit.width ? fit.width / fmt.width : Infinity, fit.height ? fit.height / fmt.height : Infinity);

  const hit = (target) => {
    let best = null;
    for (const [role, r] of Object.entries(sel.current.roles ?? {})) {
      const el = target.closest?.(r.sel);
      if (el && (!best || best.el.contains(el))) best = { role, el };
    }
    return best;
  };
  const paintSelection = () => {
    const doc = frames[active.current]?.current?.contentDocument;
    if (!doc?.body) return;
    doc.querySelectorAll('[data-picked]').forEach((e) => e.removeAttribute('data-picked'));
    const r = sel.current.roles?.[sel.current.selected];
    if (r) doc.querySelectorAll(r.sel).forEach((e) => e.setAttribute('data-picked', ''));
  };
  const wire = (iframe) => {
    const doc = iframe.contentDocument;
    if (!interactive || !doc?.head) return;
    const st = doc.createElement('style');
    const w = (px) => `${(px / s).toFixed(2)}px`;
    st.textContent = `[data-hover]{outline:${w(1.5)} dashed #FF6A2B;outline-offset:${w(4)};cursor:pointer}
      [data-picked]{outline:${w(2)} solid #FF6A2B;outline-offset:${w(4)}}`;
    doc.head.append(st);
    let last = null;
    doc.addEventListener('mousemove', (e) => {
      const h = hit(e.target);
      if (last && last !== h?.el) last.removeAttribute('data-hover');
      if (h) h.el.setAttribute('data-hover', '');
      last = h?.el ?? null;
    });
    doc.addEventListener('mouseleave', () => last?.removeAttribute('data-hover'));
    // Drag any element to move it. While dragging we move it directly in the page (instant), then
    // report the move in u (1% of the short side) so it's saved and applies at every size.
    let drag = null;
    const u = Math.min(fmt.width, fmt.height) / 100;
    doc.addEventListener('mousedown', (e) => {
      const h = e.button === 0 && hit(e.target);
      if (!h || !sel.current.onMove) return;
      const els = [...doc.querySelectorAll(sel.current.roles[h.role].sel)];
      const base = els.map((el) => (getComputedStyle(el).translate.match(/-?[\d.]+/g) ?? [0, 0]).map(Number));
      drag = { role: h.role, x: e.clientX, y: e.clientY, els, base, moved: false };
      e.preventDefault();
    });
    doc.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) * s < 4) return;
      drag.moved = true;
      drag.els.forEach((el, i) => { el.style.translate = `${(drag.base[i][0] ?? 0) + dx}px ${(drag.base[i][1] ?? 0) + dy}px`; });
    });
    const end = (e) => {
      if (!drag) return;
      const g = drag;
      drag = null;
      if (!g.moved) return;
      justDragged = true;
      sel.current.onSelect?.(g.role);
      sel.current.onMove(g.role, +((e.clientX - g.x) / u).toFixed(2), +((e.clientY - g.y) / u).toFixed(2));
    };
    let justDragged = false;
    doc.addEventListener('mouseup', end);
    doc.addEventListener('mouseleave', end);
    doc.addEventListener('click', (e) => {
      e.preventDefault();
      if (justDragged) { justDragged = false; return; }
      sel.current.onSelect?.(hit(e.target)?.role ?? null);
    });
  };
  /** Size of the selected element's text in this format's pixels (for the inspector's font-size box). */
  const measure = () => {
    const doc = frames[active.current]?.current?.contentDocument;
    const r = sel.current.roles?.[sel.current.selected];
    const el = r && doc?.querySelector(r.sel);
    sel.current.onMeasure?.(el ? { fontSize: parseFloat(doc.defaultView.getComputedStyle(el).fontSize) } : null);
  };

  useEffect(() => {
    const my = ++token.current;
    const { formatInfo, ...body } = debounced;
    if (still) body.still = true; // frozen pose: finished motion, effects at rest
    const target = active.current === -1 ? 0 : 1 - active.current;
    const iframe = frames[target].current;
    fetch('/api/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => r.text())
      .then((doc) => {
        if (my !== token.current || !iframe) return;
        iframe.onload = () => {
          const start = performance.now();
          const swapWhenReady = () => {
            if (my !== token.current) return;
            const ready = iframe.contentWindow?.__AD_READY || performance.now() - start > 4000;
            if (!ready) { requestAnimationFrame(swapWhenReady); return; }
            const prev = active.current;
            active.current = target;
            setShown(target);
            wire(iframe);
            paintSelection();
            measure();
            if (prev !== -1 && prev !== target) { const old = frames[prev].current; if (old) { old.onload = null; old.srcdoc = ''; } }
          };
          swapWhenReady();
        };
        iframe.srcdoc = doc;
      })
      .catch(() => {});
  }, [JSON.stringify(debounced), still]);
  useEffect(() => { paintSelection(); measure(); }, [selected]);

  const box = { width: `${fmt.width * s}px`, height: `${fmt.height * s}px` };
  return html`
    <div class="adframe ${onClick ? 'clickable' : ''} ${interactive ? 'interactive' : ''}" style=${box} onClick=${onClick}>
      ${[0, 1].map((i) => html`<iframe key=${i} ref=${frames[i]} width=${fmt.width} height=${fmt.height} tabindex="-1" title="Ad preview"
        class=${shown === i ? 'live' : 'buffer'} style=${{ transform: `scale(${s})` }}></iframe>`)}
    </div>`;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  // Portal to <body>: glass panels use backdrop-filter, which would otherwise trap position:fixed modals inside them.
  return createPortal(html`
    <div class="modal-back" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal ${wide ? 'wide' : ''}">
        <div class="modal-head"><h2>${title}</h2><button class="icon-btn" onClick=${onClose} aria-label="Close">✕</button></div>
        <div class="modal-body">${children}</div>
      </div>
    </div>`, document.body);
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    window.toast = (msg, kind = 'ok') => {
      const id = Math.random();
      setItems((x) => [...x, { id, msg, kind }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'err' ? 6000 : 3000);
    };
  }, []);
  return html`<div class="toasts">${items.map((t) => html`<div class="toast ${t.kind}" key=${t.id}>${t.msg}</div>`)}</div>`;
}
export const toast = (msg, kind) => window.toast?.(msg, kind);

export function Swatches({ palette, size = 14 }) {
  const cols = [palette.bg, palette.fg, palette.accent, palette.ctaBg ?? palette.accent].filter(Boolean);
  return html`<span class="swatches">${cols.map((c, i) => html`<i key=${i} style=${{ background: c, width: `${size}px`, height: `${size}px` }}></i>`)}</span>`;
}

/** Little aspect-ratio rectangle icon for a format. */
export function RatioIcon({ w, h, size = 22 }) {
  const k = size / Math.max(w, h);
  return html`<span class="ratio" style=${{ width: `${Math.max(6, w * k)}px`, height: `${Math.max(6, h * k)}px` }}></span>`;
}

export function Section({ n, title, hint, children, right, open: initial = true }) {
  const [open, setOpen] = useState(initial);
  return html`
    <section class="step ${open ? 'open' : ''}">
      <header onClick=${() => setOpen(!open)}>
        <span class="step-n">${n}</span>
        <div class="step-title"><h3>${title}</h3>${hint && html`<p>${hint}</p>`}</div>
        ${right}
        <span class="chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
      </header>
      ${open && html`<div class="step-body">${children}</div>`}
    </section>`;
}

export function Field({ label, hint, children }) {
  return html`<label class="field"><span class="field-label">${label}${hint && html`<em>${hint}</em>`}</span>${children}</label>`;
}

export function Toggle({ checked, onChange, label }) {
  return html`<label class="toggle"><input type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} /><span class="track"><span class="knob"></span></span>${label}</label>`;
}

export function Segmented({ value, options, onChange }) {
  return html`<div class="seg">${options.map((o) => html`<button type="button" class=${o.value === value ? 'on' : ''} onClick=${() => onChange(o.value)} title=${o.title ?? ''}>${o.label}</button>`)}</div>`;
}

/** Identifies this editor tab, so it can ignore its own workspace updates echoed back by the server. */
export const CLIENT_ID = (crypto.randomUUID?.() ?? String(Math.random())).slice(0, 18);

/** Text colour (near-black or white) that reads best on a background colour. */
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#111111' : '#FFFFFF';
}
