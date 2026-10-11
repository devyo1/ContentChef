// Shared building blocks for templates: the HTML document shell, brand CSS variables,
// generated backgrounds, rich-text formatting, and the in-page runtime (fit + animation).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { googleSpec } from '../fonts.js';
import { glowColors } from '../../../public/js/color.js';
import { decorHtml, DECOR_CSS } from './decor.js';

const RUNTIME = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'runtime.client.js'), 'utf8');

export const ANIMATIONS = [
  { id: 'none', name: 'Still', description: 'No motion. A static image.' },
  { id: 'fade-up', name: 'Fade up', description: 'Each element glides up into place, one after another.' },
  { id: 'typewriter', name: 'Typewriter', description: 'The headline types itself out letter by letter with a cursor.' },
  { id: 'word-rise', name: 'Word rise', description: 'Headline words slide up from behind a mask, one by one.' },
  { id: 'pop', name: 'Pop', description: 'Words pop in with a bouncy scale and blur.' },
  { id: 'wipe', name: 'Wipe', description: 'Elements are revealed by a fast left-to-right wipe.' },
];

// Effects layer on top of any motion (or a still): content.effects = ['glimmer', 'holo'].
export const EFFECTS = [
  { id: 'glimmer', name: 'Glimmer', description: 'A soft white light slowly sweeps diagonally across the ad.' },
  { id: 'holo', name: 'Holo shimmer', description: 'Subtle holographic foil drifting across the ad, like a holo trading card.' },
];

// Button animations (content.ctaFx): a little life on the call to action, repeating after the intro.
export const CTA_FX = [
  { id: 'shine', name: 'Shine', description: 'A glint of light runs across the button every few seconds.' },
  { id: 'nudge', name: 'Arrow nudge', description: 'The arrow gives a little "this way" push.' },
  { id: 'pulse', name: 'Pulse', description: 'The button gently swells with a soft ring, like a heartbeat.' },
];

// Seamless loops: effect periods (seconds) so looping clips can snap to lengths that repeat perfectly.
export const LOOP_PERIODS = { glimmer: 3.6, holo: 3.2, shine: 2.4, nudge: 1.6, pulse: 2 };

// Elements you can restyle individually (content.styles[role]); selectors per template.
export const STYLE_ROLES = {
  headline: { label: 'Headline', sel: '.headline, .ln', fitted: true },
  offer: { label: 'Offer', sel: '.offer', fitted: true },
  eyebrow: { label: 'Top line', sel: '.eyebrow' },
  subhead: { label: 'Supporting line', sel: '.sub' },
  cta: { label: 'Button', sel: '.cta, .action', button: true },
  logo: { label: 'Logo', sel: '.logo' },
  attribution: { label: 'Quote source', sel: '.who' },
  footnote: { label: 'Small print', sel: '.foot' },
  clock: { label: 'Clock', sel: '.clock' },
  body: { label: 'Body text', sel: '.body, .post-text, .note-text', fitted: true },
  points: { label: 'List', sel: '.list, .cols', fitted: true },
  stat: { label: 'Big number', sel: '.stat-num', fitted: true },
  link: { label: 'Link', sel: '.link' },
  handle: { label: 'Handle', sel: '.handle, .who-handle' },
};
const CASES = { upper: 'uppercase', lower: 'lowercase', none: 'none', title: 'capitalize' };

/** CSS for per-element overrides. Fitted text scales via --fit-scale (read by the fitter), the rest via zoom. */
function stylesCss(styles = {}) {
  const out = [];
  for (const [role, st] of Object.entries(styles ?? {})) {
    const r = STYLE_ROLES[role];
    if (!r || !st) continue;
    const decl = [];
    if (st.color) decl.push(`color:${st.color} !important`);
    if (st.font) decl.push(`font-family:"${st.font}", system-ui, sans-serif !important`);
    if (st.weight) decl.push(`font-weight:${Number(st.weight)} !important`);
    if (st.case) decl.push(`text-transform:${CASES[st.case] ?? 'none'} !important`);
    if (st.tracking != null && st.tracking !== '') decl.push(`letter-spacing:${Number(st.tracking)}em !important`);
    if (st.italic) decl.push('font-style:italic !important');
    if (r.button && st.bg) decl.push(`background:${st.bg} !important`);
    if (st.scale && Number(st.scale) !== 1) decl.push(r.fitted ? `--fit-scale:${Number(st.scale)}` : `zoom:${Number(st.scale)}`);
    // Position nudge in u (1% of the short side), so a move looks the same at every size.
    if (Number(st.x) || Number(st.y)) decl.push(`translate:calc(var(--u) * ${Number(st.x) || 0}) calc(var(--u) * ${Number(st.y) || 0})`);
    if (decl.length) out.push(`${r.sel.split(',').map((x) => `.ad ${x.trim()}`).join(',')}{${decl.join(';')}}`);
    if (st.highlight) out.push(r.sel.split(',').map((x) => `.ad ${x.trim()} .hl`).join(',') + `{color:${st.highlight} !important}`);
  }
  return out.join('\n');
}

export const BG_STYLES = [
  { id: 'solid', name: 'Solid' },
  { id: 'gradient', name: 'Gradient' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'spotlight', name: 'Spotlight' },
  { id: 'grid', name: 'Grid' },
  { id: 'dots', name: 'Dots' },
];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lightweight markup for ad copy:
 *   *word*  → accent-highlighted
 *   _word_  → italic
 *   \n or | → line break
 */
export function rich(s) {
  return esc(s)
    .replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<i>$2</i>')
    .replace(/\s*(\\n|\n|\|)\s*/g, '<br>');
}

/** Relative luminance (0 dark – 1 light) of a #rrggbb colour. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const CASE = { upper: 'uppercase', lower: 'lowercase', none: 'none', title: 'capitalize' };

const contrastRatio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/**
 * Colour for big solid blocks (split panel, frame surround). Normally the highlight colour, but a
 * near-white highlight (common in bold palettes) would turn the block into a blank page, so use
 * the text colour instead. Ink is whichever colour reads best on the block.
 */
function blockColors(p) {
  const block = p.block ?? (luminance(p.accent) > 0.7 ? p.fg : p.accent);
  const ink = [p.ctaText, p.bg, p.fg, '#FFFFFF', '#111111'].filter(Boolean).reduce((a, b) => (contrastRatio(block, b) > contrastRatio(block, a) ? b : a));
  return { block, ink };
}

function googleFontsHref(brand, styles = {}) {
  const specs = new Set();
  for (const f of Object.values(brand.fonts)) {
    if (f?.google) specs.add(f.google.trim().replace(/\s+/g, '+'));
  }
  for (const st of Object.values(styles ?? {})) if (st?.font) specs.add(googleSpec(st.font));
  if (!specs.size) return null;
  return `https://fonts.googleapis.com/css2?${[...specs].map((s) => `family=${s}`).join('&')}&display=block`;
}

async function localFontFaces(brand, resolve) {
  const out = [];
  for (const f of Object.values(brand.fonts)) {
    for (const file of [].concat(f?.files ?? f?.file ?? [])) {
      const src = typeof file === 'string' ? { path: file } : file;
      const url = await resolve(src.path);
      out.push(`@font-face{font-family:"${f.family}";src:url("${url}");font-weight:${src.weight ?? f.weight ?? 400};font-style:${src.style ?? 'normal'};font-display:block}`);
    }
  }
  return out.join('\n');
}

/** Photo crop: a focus point (pan), zoom and flip, applied identically at every size. */
const clampN = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
function imageFocus(c) {
  if (c.imageX == null && c.imageY == null) return c.imageFocus ?? 'center';
  return `${clampN(c.imageX, 0, 100, 50)}% ${clampN(c.imageY, 0, 100, 50)}%`;
}
const imgZoom = (c) => clampN(c.imageZoom, 1, 5, 1);
/**
 * Pivot for the zoom (and flip). Without a flip it's the focus point. A flip is a mirror of the
 * whole zoomed picture around the frame centre, which equals scaling by -zoom about
 * x' = (100 + x(zoom - 1)) / (1 + zoom), so the mirrored photo still covers the frame.
 */
function imageOrigin(c) {
  if (!c.imageFlip) return imageFocus(c);
  const f = c.imageFocus ?? '';
  const x = clampN(c.imageX, 0, 100, /left/.test(f) ? 0 : /right/.test(f) ? 100 : 50);
  const y = c.imageY != null ? `${clampN(c.imageY, 0, 100, 50)}%` : /top/.test(f) ? '0%' : /bottom/.test(f) ? '100%' : '50%';
  const z = imgZoom(c);
  return `${((100 + x * (z - 1)) / (1 + z)).toFixed(3)}% ${y}`;
}
export const OVERLAYS = ['grid', 'dots', 'glow', 'tint'];

function baseCss(ctx) {
  const { brand, palette: p, format, u } = ctx;
  const s = brand.style;
  const radius = s.radius >= 999 ? '999px' : `calc(var(--u) * ${(s.radius / 10.8).toFixed(3)})`;
  const g = glowColors(p); // always palette-derived and readable (see color.js)
  const blk = blockColors(p);
  return `
:root{
  --u:${u}px; --w:${format.width}px; --h:${format.height}px;
  --bg:${p.bg}; --fg:${p.fg}; --accent:${p.accent}; --muted:${p.muted ?? p.fg};
  --cta-bg:${p.ctaBg ?? p.accent}; --cta-text:${p.ctaText ?? p.bg};
  --block:${blk.block}; --block-ink:${blk.ink};
  --g1:${g[0]}; --g2:${g[1]}; --g3:${g[2]}; --g4:${g[3]};
  --glass:${ctx.lightBg ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.13)'};
  --glass-strong:${ctx.lightBg ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.2)'};
  --glass-edge:${ctx.lightBg ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.55)'};
  --font-display:"${brand.fonts.display.family}", system-ui, sans-serif;
  --font-body:"${brand.fonts.body.family}", system-ui, sans-serif;
  --display-weight:${brand.fonts.display.weight ?? 800};
  --body-weight:${brand.fonts.body.weight ?? 400};
  --tracking:${s.headlineTracking}; --leading:${s.headlineLeading};
  --headline-case:${CASE[s.headlineCase] ?? 'none'}; --eyebrow-case:${CASE[s.eyebrowCase] ?? 'uppercase'};
  --radius:${radius}; --overlay:${ctx.overlay};
  --glim:${ctx.lightBg ? 0.5 : 0.17}; --holo-a:${ctx.lightBg ? 0.38 : 0.42}; --holo-g:${ctx.lightBg ? 0.18 : 0.28};
  --pad:calc(var(--u) * 7); --gap:calc(var(--u) * 3.2);
  --safe-top:${Math.round((format.safe?.top ?? 0) * format.height)}px; --safe-bottom:${Math.round((format.safe?.bottom ?? 0) * format.height)}px;
  --pad-top:max(var(--pad), var(--safe-top)); --pad-bottom:max(var(--pad), var(--safe-bottom));
  --focus:${imageFocus(ctx.content)}; --img-zoom:${imgZoom(ctx.content)}; --img-sx:${ctx.content.imageFlip ? -imgZoom(ctx.content) : imgZoom(ctx.content)}; --img-origin:${imageOrigin(ctx.content)};
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${format.width}px;height:${format.height}px;overflow:hidden;background:var(--bg)}
body{font-family:var(--font-body);font-weight:var(--body-weight);color:var(--fg);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-kerning:normal;font-feature-settings:"kern","liga"}
.ad{position:relative;width:100%;height:100%;overflow:hidden;background:var(--bg)}
.layer{position:absolute;inset:0}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--focus);scale:var(--img-sx) var(--img-zoom);transform-origin:var(--img-origin)}
/* Patterns layered over a photo (content.bgOverlay) */
.bg-ov{position:absolute;inset:0;pointer-events:none}
.bg-ov.grid{background-image:linear-gradient(rgba(255,255,255,.16) calc(var(--u)*.14),transparent calc(var(--u)*.14)),linear-gradient(90deg,rgba(255,255,255,.16) calc(var(--u)*.14),transparent calc(var(--u)*.14));background-size:calc(var(--u)*8) calc(var(--u)*8);background-position:center}
.bg-ov.dots{background-image:radial-gradient(rgba(255,255,255,.28) calc(var(--u)*.32),transparent calc(var(--u)*.4));background-size:calc(var(--u)*4.5) calc(var(--u)*4.5)}
.bg-ov.glow{mix-blend-mode:soft-light;opacity:.85;background:radial-gradient(circle at 20% 15%,var(--g1),transparent 55%),radial-gradient(circle at 85% 80%,var(--g2),transparent 55%)}
.bg-ov.tint{mix-blend-mode:color;opacity:.35;background:var(--accent)}
/* Neutral darkening over photos: never tint the picture with the palette colour. */
.scrim{position:absolute;inset:0;background:linear-gradient(to top,
  rgba(0,0,0,calc(var(--overlay) * .9 + .2)) 0%,
  rgba(0,0,0,calc(var(--overlay) * .7)) 55%,
  rgba(0,0,0,calc(var(--overlay) * .35)) 100%)}
/* Text placed directly on a photo turns white (accent highlights stay brand-coloured). */
.on-photo{--fg:#FFFFFF;--muted:rgba(255,255,255,.78);color:#FFFFFF}
.genbg{position:absolute;inset:0;overflow:hidden;background:var(--bg)}
.genbg.gradient{background:linear-gradient(160deg,var(--g1) 0%,var(--g2) 48%,var(--g4) 100%)}
.genbg.spotlight{background:radial-gradient(ellipse 80% 60% at 50% 0%,color-mix(in srgb,var(--accent) 50%,var(--bg)) 0%,var(--bg) 70%)}
.genbg.aurora{background:var(--g4)}
.genbg.aurora i{position:absolute;border-radius:50%;filter:blur(calc(var(--u)*13));opacity:.95}
.genbg.aurora i:nth-child(1){width:95%;height:80%;left:-25%;top:-20%;background:var(--g1)}
.genbg.aurora i:nth-child(2){width:85%;height:75%;right:-30%;top:25%;background:var(--g2)}
.genbg.aurora i:nth-child(3){width:80%;height:70%;left:-10%;bottom:-35%;background:var(--g3)}
.genbg.aurora i:nth-child(4){width:40%;height:35%;right:5%;top:-10%;background:var(--g1);opacity:.6}
.genbg.grid{background-image:linear-gradient(color-mix(in srgb,var(--fg) 10%,transparent) calc(var(--u)*.14),transparent calc(var(--u)*.14)),linear-gradient(90deg,color-mix(in srgb,var(--fg) 10%,transparent) calc(var(--u)*.14),transparent calc(var(--u)*.14));background-size:calc(var(--u)*8) calc(var(--u)*8);background-position:center}
.genbg.dots{background-image:radial-gradient(color-mix(in srgb,var(--fg) 16%,transparent) calc(var(--u)*.32),transparent calc(var(--u)*.4));background-size:calc(var(--u)*4.5) calc(var(--u)*4.5)}
.genbg.grid::after,.genbg.dots::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 30%,var(--bg) 85%)}
.eyebrow{font-family:var(--font-body);font-weight:700;font-size:calc(var(--u)*2.9);letter-spacing:.16em;text-transform:var(--eyebrow-case);color:var(--accent);line-height:1.2}
.headline{font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--tracking);line-height:var(--leading);text-transform:var(--headline-case);overflow-wrap:normal;word-break:keep-all;text-wrap:balance;hyphens:none}
.hl{color:var(--accent)}
.sub{font-size:calc(var(--u)*3.9);line-height:1.38;opacity:.88;text-wrap:pretty;max-width:34em}
.cta{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:.6em;align-self:flex-start;white-space:nowrap;background:var(--cta-bg);color:var(--cta-text);font-family:var(--font-body);font-weight:700;font-size:calc(var(--u)*3.3);line-height:1;padding:.95em 1.5em;border-radius:var(--radius)}
.cta .cta-shine{position:absolute;top:-30%;bottom:-30%;left:0;width:42%;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.6),transparent);transform:translateX(-170%) skewX(-18deg)}
.cta .arrow,.link .arrow{display:inline-block}
.cta .arrow{font-weight:400;transform:translateY(-.03em)}
.logo{display:flex;align-items:center}
.logo img{height:calc(var(--u)*6);width:auto;max-width:calc(var(--u)*34);object-fit:contain}
.wordmark{font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*3.4);letter-spacing:var(--tracking);line-height:1}
.foot{font-size:calc(var(--u)*1.9);line-height:1.35;opacity:.6}
/* align-items:flex-start so fitted text keeps its natural height (a stretched item would always "fit") */
.fitbox{min-height:0;min-width:0;display:flex;align-items:flex-start}
.a-center{text-align:center}
.a-center .cta{align-self:center}
.a-center .sub{margin-inline:auto}
.wd{display:inline-block}
.wd.clip{overflow:clip;padding:.12em .03em .16em;margin:-.12em -.03em -.16em;vertical-align:top}
.wi{display:inline-block}
/* Holographic foil (the "shine" animation): a rainbow foil layer + soft glint drifting across the whole ad */
.holo{position:absolute;inset:0;pointer-events:none;z-index:45;overflow:hidden}
.holo .foil{position:absolute;inset:-60%;mix-blend-mode:soft-light;opacity:var(--holo-a);
  background:repeating-linear-gradient(115deg,#ff9ad1 0%,#ffe2a1 5%,#a6ffd5 10%,#a1dcff 15%,#d5b4ff 20%,#ff9ad1 25%);
  -webkit-mask-image:linear-gradient(115deg,transparent 28%,#000 46%,#000 54%,transparent 72%);mask-image:linear-gradient(115deg,transparent 28%,#000 46%,#000 54%,transparent 72%)}
.holo .glint{position:absolute;inset:-50%;mix-blend-mode:overlay;opacity:var(--holo-g);
  background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.9) 50%,transparent 60%)}
.holo .sweep{position:absolute;inset:-60%;pointer-events:none;
  background:linear-gradient(120deg,transparent 38%,rgba(255,255,255,var(--glim)) 50%,transparent 62%)}
.holo .spark{position:absolute;width:calc(var(--u)*2.4);height:calc(var(--u)*2.4);margin:calc(var(--u)*-1.2);opacity:0;
  background:radial-gradient(circle,#fff 0 12%,rgba(255,255,255,.5) 22%,transparent 60%);
  -webkit-mask:conic-gradient(from 45deg,#000 0 6%,transparent 6% 25%,#000 25% 31%,transparent 31% 50%,#000 50% 56%,transparent 56% 75%,#000 75% 81%,transparent 81%);mix-blend-mode:screen}
/* Shared value-post styles */
.body{font-family:var(--font-body);line-height:1.5;text-wrap:pretty;width:100%}
.body p+p{margin-top:.75em}
.link{display:inline-flex;align-items:center;gap:.45em;font-weight:700;color:var(--accent);font-size:calc(var(--u)*3.1);white-space:nowrap}
.handle{font-weight:600;opacity:.7;font-size:calc(var(--u)*2.7)}
.grain::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.08;mix-blend-mode:soft-light;z-index:40;background-size:calc(var(--u)*22) calc(var(--u)*22);
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
/* iOS-style glass surface, shared by glass + lockscreen templates */
.glass{position:relative;background:var(--glass);-webkit-backdrop-filter:blur(calc(var(--u)*3.2)) saturate(180%);backdrop-filter:blur(calc(var(--u)*3.2)) saturate(180%);border-radius:calc(var(--u)*5.5);box-shadow:0 calc(var(--u)*2.5) calc(var(--u)*7) rgba(0,0,0,.22), inset 0 calc(var(--u)*-.6) calc(var(--u)*2) rgba(255,255,255,.08)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:calc(var(--u)*.22);pointer-events:none;
  background:linear-gradient(140deg,var(--glass-edge),rgba(255,255,255,.08) 32%,rgba(255,255,255,.04) 62%,var(--glass-edge));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.glass::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(170deg,rgba(255,255,255,.22),rgba(255,255,255,0) 38%)}
.glass>*{position:relative;z-index:1}
${DECOR_CSS}`;
}

/** Element styles for one size: the shared styles with this size's own overrides (content.formatStyles[format]) on top. */
export function effectiveStyles(content, formatId) {
  const base = content.styles ?? {};
  const own = content.formatStyles?.[formatId];
  if (!own) return base;
  const out = { ...base };
  for (const [role, st] of Object.entries(own)) out[role] = { ...(base[role] ?? {}), ...st };
  return out;
}

export async function documentHtml(ctx, { css, body }) {
  const styles = effectiveStyles(ctx.content, ctx.formatId);
  const href = googleFontsHref(ctx.brand, styles);
  const decorFront = decorHtml(ctx.content, 'front');
  const faces = await localFontFaces(ctx.brand, ctx.resolve);
  const AD = { mode: ctx.mode, anim: ctx.animation, effects: ctx.effects, duration: ctx.duration, still: !!ctx.still, loop: !!ctx.content.loop, ctaFx: CTA_FX.some((f) => f.id === ctx.content.ctaFx) ? ctx.content.ctaFx : null };
  return `<!doctype html><html><head><meta charset="utf-8">
${href ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${href}">` : ''}
<style>${faces}${baseCss(ctx)}${css ?? ''}${stylesCss(styles)}</style></head>
<body>${body}${decorFront ? `<div class="decor-front">${decorFront}</div>` : ''}<script>window.__AD=${JSON.stringify(AD)};</script><script>${RUNTIME}</script></body></html>`;
}

/** Common pieces most templates use. */
export function parts(ctx) {
  const { content: c, brand } = ctx;
  const media = !ctx.bgUrl ? ''
    : ctx.bgKind === 'video-live'
      ? `<video class="bg" src="${esc(ctx.bgUrl)}" autoplay muted loop playsinline></video>`
      : `<img class="bg" src="${esc(ctx.bgUrl)}" alt=""${ctx.bgKind === 'video-frames' ? ' data-video="1"' : ''}>`;
  const genbg = ctx.bgStyle === 'aurora'
    ? '<div class="genbg aurora"><i></i><i></i><i></i><i></i></div>'
    : `<div class="genbg ${esc(ctx.bgStyle)}"></div>`;
  return {
    media,
    genbg,
    bg: (media ? `${media}${ctx.overlay > 0 ? '<div class="scrim"></div>' : ''}${OVERLAYS.includes(c.bgOverlay) ? `<div class="bg-ov ${c.bgOverlay}"></div>` : ''}` : genbg) + decorHtml(c, 'back'),
    logo: c.showLogo === false ? '' : ctx.logoUrl
      ? `<div class="logo"><img src="${esc(ctx.logoUrl)}" alt="${esc(brand.name)}"></div>`
      : `<div class="logo wordmark">${esc(brand.name)}</div>`,
    eyebrow: c.eyebrow ? `<div class="eyebrow">${rich(c.eyebrow)}</div>` : '',
    sub: c.subhead ? `<p class="sub">${rich(c.subhead)}</p>` : '',
    cta: c.cta ? `<div class="cta"><span>${esc(c.cta)}</span>${c.ctaArrow === false ? '' : '<span class="arrow">→</span>'}</div>` : '',
    foot: c.footnote ? `<div class="foot">${rich(c.footnote)}</div>` : '',
    headline: (attrs = '') => `<h1 class="headline" data-fit ${attrs}>${rich(c.headline)}</h1>`,
    // Value-post pieces: long-form body, lists, a quiet text link instead of a button, the brand handle.
    body: (text = c.body, attrs = '') => (text ? `<div class="body" ${attrs}>${paragraphs(text)}</div>` : ''),
    link: c.cta ? `<div class="link">${esc(c.cta)} <span class="arrow">→</span></div>` : '',
    handle: esc(c.handle || brand.handle || `@${String(brand.id).replace(/-/g, '')}`),
  };
}

/** Body copy: blank lines separate paragraphs; markup (*accent*, _italic_) works inside. */
export function paragraphs(text) {
  return String(text).split(/\n\s*\n|\\n\\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${rich(p)}</p>`).join('');
}

/** List points from an array or one-per-line text; strips typed bullets/numbers ("- ", "• ", "1. "). */
export function listItems(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/\n|\\n/);
  return arr.map((x) => String(x).replace(/^\s*([-*•–]|\d+[.)])\s+/, '').trim()).filter(Boolean);
}

/** A list point as HTML; "Title: rest" gets a bold lead-in. */
export function pointHtml(item) {
  const m = /^([^:]{2,60}):\s+(.+)$/.exec(item);
  return m ? `<b>${rich(m[1])}:</b> ${rich(m[2])}` : rich(item);
}

export function rootClass(ctx, extra = '') {
  return `ad t-${ctx.templateId} ${ctx.bgUrl && ctx.textOnPhoto ? 'on-photo' : ''} o-${ctx.orient} a-${ctx.align} ${ctx.brand.style.grain ? 'grain' : ''} ${ctx.bgUrl ? 'has-bg' : 'no-bg'} ${ctx.lightBg ? 'light' : 'dark'} ${extra}`;
}
