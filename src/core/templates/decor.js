// Stickers & doodles (content.decor): small, optionally animated SVGs placed on an ad. Either a
// ready-made preset (hand-drawn arrow, circle, underline, sparkles, starburst) or custom SVG that
// Claude writes. Animation uses SVG SMIL or CSS inside the SVG; the runtime drives both from the
// same paused timeline as everything else, so every exported frame is exact.

// Presets draw in the brand's highlight colour (currentColor = var(--accent)) and start drawing
// at `begin` seconds (default 1s), so they land after the copy.
const PRESETS = {
  arrow: {
    name: 'Hand-drawn arrow',
    svg: (b) => `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
<path d="M8 66C30 30 62 14 104 18" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" begin="${b}s" dur=".7s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1"/></path>
<path d="M88 6l18 12-14 16" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" begin="${b + 0.6}s" dur=".3s" fill="freeze"/></path></svg>`,
  },
  circle: {
    name: 'Scribble circle',
    svg: (b) => `<svg viewBox="0 0 200 110" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">
<path d="M150 14C108 0 30 8 12 46c-16 34 40 58 98 56 52-2 88-24 82-52C186 22 140 8 92 12" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" begin="${b}s" dur=".9s" fill="freeze" calcMode="spline" keySplines=".45 0 .2 1" keyTimes="0;1"/></path></svg>`,
  },
  underline: {
    name: 'Wavy underline',
    svg: (b) => `<svg viewBox="0 0 220 30" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round">
<path d="M6 18C40 6 60 26 96 14s60 10 118-6" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" begin="${b}s" dur=".6s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1"/></path></svg>`,
  },
  sparkles: {
    name: 'Twinkling sparkles',
    svg: (b) => {
      const star = (x, y, s, d) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10z" fill="currentColor" opacity="0">
<animate attributeName="opacity" values="0;1;.35;1" keyTimes="0;.2;.6;1" begin="${b + d}s" dur="1.6s" fill="freeze"/>
<animateTransform attributeName="transform" type="scale" additive="sum" values="0;1.15;.85;1" keyTimes="0;.25;.6;1" begin="${b + d}s" dur="1.6s" fill="freeze"/></path>`;
      return `<svg viewBox="0 0 100 100">${star(30, 34, 2.2, 0)}${star(72, 22, 1.2, 0.25)}${star(66, 70, 1.6, 0.5)}</svg>`;
    },
  },
  burst: {
    name: 'Starburst',
    svg: (b) => {
      const pts = Array.from({ length: 24 }, (_, i) => { const r = i % 2 ? 34 : 48; const a = (i * Math.PI) / 12; return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
      return `<svg viewBox="0 0 100 100"><g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${b}s" dur=".3s" fill="freeze"/>
<polygon points="${pts}" fill="currentColor"><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="24s" repeatCount="indefinite"/></polygon></g></svg>`;
    },
  },
};
export const DECOR_PRESETS = Object.fromEntries(Object.entries(PRESETS).map(([id, p]) => [id, p.name]));

/** Keep custom SVG to drawing + animation: no scripts, handlers, foreign HTML or outside links. */
export function sanitizeSvg(svg) {
  const s = String(svg ?? '').slice(0, 60000);
  if (!/^\s*<svg[\s>]/i.test(s)) return '';
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(script|foreignObject|iframe|object|embed|image|use|a)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')(?!#|data:image\/)[^"']*\2/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)\s*(?!#|data:image\/)[^)]*\)/gi, 'none');
}

const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

/** HTML for the stickers on one layer ('back' = behind the copy, 'front' = on top). */
export function decorHtml(content, layer) {
  const items = Array.isArray(content.decor) ? content.decor.slice(0, 12) : [];
  return items.filter((d) => (d.layer === 'back' ? 'back' : 'front') === layer).map((d) => {
    const svg = d.preset ? PRESETS[d.preset]?.svg(num(d.begin, 0, 30, 1)) ?? '' : sanitizeSvg(d.svg);
    if (!svg) return '';
    const style = [
      `left:${num(d.x, -20, 120, 50)}%`, `top:${num(d.y, -20, 120, 50)}%`,
      `width:calc(var(--u) * ${num(d.size, 2, 150, 20)})`,
      `rotate:${num(d.rotate, -360, 360, 0)}deg`, `opacity:${num(d.opacity, 0, 1, 1)}`,
      d.color && /^#[0-9a-f]{3,8}$/i.test(d.color) ? `color:${d.color}` : '',
      d.flip ? 'scale:-1 1' : '',
    ].filter(Boolean).join(';');
    return `<div class="decor" style="${style}">${svg}</div>`;
  }).join('');
}

export const DECOR_CSS = `
.decor{position:absolute;translate:-50% -50%;color:var(--accent);pointer-events:none;line-height:0}
.decor svg{width:100%;height:auto;display:block;overflow:visible}
.decor-front{position:absolute;inset:0;z-index:44;pointer-events:none}
`;
