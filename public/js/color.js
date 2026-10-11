// Colour science for palette generation, shared by the browser and the server (pure functions).
// Works in OKLCH (perceptual lightness / chroma / hue) so harmonies look balanced, and checks
// WCAG contrast so generated palettes are always readable.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(String(hex).trim()); // alpha, if any, is ignored
  if (!m) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}

export function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.round(clamp(c, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function linToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLin([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex) {
  const [L, a, b] = linToOklab(hexToRgb(hex).map(toLin));
  return { l: L, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH → hex, reducing chroma until the colour fits in sRGB (keeps hue + lightness). */
export function oklch(l, c, h) {
  const conv = (cc) => {
    const rad = (h * Math.PI) / 180;
    return oklabToLin([l, cc * Math.cos(rad), cc * Math.sin(rad)]);
  };
  const inGamut = (rgb) => rgb.every((x) => x >= -0.0005 && x <= 1.0005);
  let lo = 0;
  let hi = c;
  if (!inGamut(conv(c))) {
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (inGamut(conv(mid))) lo = mid; else hi = mid; }
    c = lo;
  }
  return rgbToHex(conv(c).map((x) => fromLin(clamp(x, 0, 1))));
}

/** Mix two colours in OKLab (t = 0 → a, 1 → b). */
export function mix(a, b, t) {
  const A = linToOklab(hexToRgb(a).map(toLin));
  const B = linToOklab(hexToRgb(b).map(toLin));
  return rgbToHex(oklabToLin(A.map((x, i) => x + (B[i] - x) * t)).map((x) => fromLin(clamp(x, 0, 1))));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const HARMONIES = {
  analogous: { name: 'Analogous', offsets: [0, 30, -30] },
  complementary: { name: 'Complementary', offsets: [0, 180, 20] },
  split: { name: 'Split complementary', offsets: [0, 150, 210] },
  triadic: { name: 'Triadic', offsets: [0, 120, 240] },
  square: { name: 'Square', offsets: [0, 90, 180] },
  mono: { name: 'Monochrome', offsets: [0, 0, 12] },
};

// Lightness / chroma ranges per mood. bg* = background, acc* = highlight colour.
// bgHues = hue ranges (degrees, OKLCH) that look good for that background at that lightness.
// Darkened yellows/greens turn olive and khaki, and mid-light yellow-greens look sickly, so those
// zones are simply not offered.
export const MOODS = {
  dark: { name: 'Dark', bgL: [0.15, 0.24], bgC: [0.02, 0.05], accL: [0.72, 0.85], accC: [0.12, 0.2], bgHues: [[0, 25], [150, 175], [185, 215], [235, 290], [295, 350]] },
  light: { name: 'Light', bgL: [0.955, 0.985], bgC: [0.008, 0.022], accL: [0.48, 0.6], accC: [0.14, 0.21], bgHues: [[0, 30], [55, 85], [150, 175], [200, 265], [280, 350]] },
  bold: { name: 'Bold', bgL: [0.56, 0.68], bgC: [0.16, 0.22], accL: [0.95, 0.98], accC: [0.01, 0.04], fgDark: true, bgHues: [[5, 40], [145, 165], [180, 205], [235, 275], [290, 350]] },
  pastel: { name: 'Pastel', bgL: [0.9, 0.945], bgC: [0.035, 0.065], accL: [0.5, 0.6], accC: [0.12, 0.17], bgHues: [[0, 60], [160, 180], [205, 245], [280, 350]] },
  earthy: { name: 'Earthy', bgL: [0.22, 0.3], bgC: [0.025, 0.045], accL: [0.7, 0.8], accC: [0.08, 0.12], bgHues: [[25, 55], [145, 165]] },
  neon: { name: 'Neon', bgL: [0.13, 0.18], bgC: [0.01, 0.03], accL: [0.82, 0.9], accC: [0.2, 0.28], bgHues: [[230, 300], [300, 340], [180, 210]] },
};

// Highlight colours that are darker than mid-tone avoid the olive/khaki zone the same way.
const OLIVE = [65, 135];
const inRange = (h, [a, b]) => h >= a && h <= b;
const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
/** Move a hue to the nearest allowed range (keeps it if already allowed). */
function snapHue(h, ranges) {
  if (ranges.some((r) => inRange(h, r))) return h;
  let best = h;
  let d = Infinity;
  for (const [a, b] of ranges) for (const edge of [a, b]) if (hueDist(h, edge) < d) { d = hueDist(h, edge); best = edge; }
  return best;
}
const pickHue = (ranges) => { const [a, b] = pick(ranges); return rand(a, b); };

const HUE_NAMES = [[0, 'Rose'], [25, 'Coral'], [50, 'Amber'], [75, 'Gold'], [110, 'Lime'], [150, 'Green'], [175, 'Teal'], [210, 'Sky'], [250, 'Cobalt'], [285, 'Violet'], [315, 'Orchid'], [340, 'Berry'], [360, 'Rose']];
const MOOD_WORDS = { dark: ['Midnight', 'Night', 'Deep'], light: ['Clean', 'Paper', 'Soft'], bold: ['Loud', 'Pop', 'Bright'], pastel: ['Pastel', 'Sorbet', 'Haze'], earthy: ['Clay', 'Earth', 'Field'], neon: ['Neon', 'Electric', 'Volt'] };
const hueName = (h) => HUE_NAMES.reduce((best, [d, n]) => (hueDist(h, d) < hueDist(h, best[0]) ? [d, n] : best))[1];

/** Pick whichever candidate reads best on `on`. */
const bestOn = (on, candidates) => candidates.reduce((a, b) => (contrast(on, b) > contrast(on, a) ? b : a));

/**
 * Generate a harmonious, readable, good-looking ad palette.
 * Background hues come from ranges that look good at the mood's lightness; the highlight follows
 * the harmony but is steered away from muddy olive/khaki when it has to be dark.
 * @param {object} o
 * @param {string} [o.harmony]  key of HARMONIES or 'random'
 * @param {string} [o.mood]     key of MOODS or 'random'
 * @param {object} [o.locked]   roles to keep, e.g. { accent: '#FF5A36' }; the rest is built around them
 * @returns {{ palette: object, name: string, harmony: string, mood: string, contrast: object }}
 */
export function generatePalette({ harmony = 'random', mood = 'random', locked = {} } = {}) {
  let best = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const hk = harmony === 'random' || !HARMONIES[harmony] ? pick(Object.keys(HARMONIES)) : harmony;
    const mk = mood === 'random' || !MOODS[mood] ? pick(Object.keys(MOODS)) : mood;
    const M = MOODS[mk];
    const off = HARMONIES[hk].offsets;

    // Background hue: from a locked colour, or from the mood's good ranges.
    let bgHue;
    if (locked.bg) bgHue = hexToOklch(locked.bg).h;
    else if (locked.accent) bgHue = snapHue((hexToOklch(locked.accent).h - off[1] + 360) % 360, M.bgHues);
    else bgHue = pickHue(M.bgHues);

    const bg = locked.bg ?? oklch(rand(...M.bgL), rand(...M.bgC), bgHue);
    const darkBg = hexToOklch(bg).l < 0.6;
    const fg = locked.fg ?? (M.fgDark || !darkBg ? oklch(rand(0.17, 0.24), rand(0.01, 0.025), bgHue) : oklch(rand(0.955, 0.985), rand(0.005, 0.015), bgHue));

    let accHue = (bgHue + off[1] + 360) % 360;
    const accL = rand(...M.accL);
    if (accL < 0.66 && inRange(accHue, OLIVE)) accHue = accHue < 100 ? rand(40, 58) : rand(145, 160);
    const accent = locked.accent ?? oklch(accL, rand(...M.accC), accHue);

    const muted = locked.muted ?? mix(fg, bg, 0.42);
    const ctaBg = locked.ctaBg ?? accent;
    const ctaText = locked.ctaText ?? bestOn(ctaBg, [bg, fg, '#FFFFFF', '#111111']);
    const scores = { text: contrast(fg, bg), highlight: contrast(accent, bg), button: contrast(ctaText, ctaBg) };
    const ok = scores.text >= 4.5 && scores.highlight >= 2.8 && scores.button >= 4.5;
    const score = Math.min(scores.text / 4.5, scores.highlight / 2.8, scores.button / 4.5);
    // Name it after what you notice first: the background in bold/pastel moods, else the highlight.
    const ac = hexToOklch(accent);
    const named = M.fgDark || mk === 'pastel' || ac.c < 0.06 ? hexToOklch(bg).h : ac.h;
    const result = {
      // No stored glow colours: they're derived from the palette at render time (glowColors).
      palette: { bg, fg, accent, muted, ...(ctaBg !== accent ? { ctaBg } : {}), ctaText },
      name: `${pick(MOOD_WORDS[mk])} ${hueName(named)}`,
      harmony: hk,
      mood: mk,
      contrast: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Number(v.toFixed(2))])),
    };
    if (ok) return result;
    if (!best || score > best.score) best = { ...result, score };
  }
  const { score, ...r } = best; // locked colours made a fully passing palette impossible: return the closest
  return r;
}

/**
 * Glow colours for aurora / gradient backgrounds and glass, derived so they always belong to the
 * palette and keep the text readable on top of them:
 *  - hue comes from the background, or from the highlight when the background is neutral;
 *  - behind LIGHT text, glows are the palette's vivid colour at partial opacity (a neon glow over
 *    the dark base). Darkening a colour instead would turn yellows and limes into olive mud;
 *  - behind DARK text, glows are opaque pastels from the same hue, light enough to read on.
 * Custom glows (palette.gradient) keep their hues and get the same treatment.
 * Returns [g1, g2, g3, base] (CSS colours; base is the palette background).
 */
export function glowColors(p) {
  const bg = hexToOklch(p.bg);
  const ac = hexToOklch(p.accent ?? p.bg);
  const fgLight = hexToOklch(p.fg ?? '#FFFFFF').l > 0.6;
  const alpha = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase()}`;
  const glow = (h, c, strength = 1) => (fgLight
    ? alpha(oklch(0.72, Math.min(Math.max(c, 0.1), 0.2), h), 0.5 * strength)
    : oklch(0.9 - 0.06 * strength, Math.min(Math.max(c, 0.06), 0.12), h));
  const chromatic = (o) => o.c > 0.05;
  if (Array.isArray(p.gradient) && p.gradient.length >= 3) {
    return [...p.gradient.slice(0, 3).map((hex, i) => { const o = hexToOklch(hex); return glow(o.h, o.c, [1, 0.85, 0.7][i]); }), p.bg];
  }
  // Black/white/grey background with a colourful highlight on dark: one concentrated highlight glow
  // plus soft white depth, rather than tinting the whole background (lime over black reads olive).
  if (!chromatic(bg) && chromatic(ac) && fgLight) {
    const vivid = oklch(Math.max(ac.l, 0.7), Math.min(ac.c, 0.22), ac.h);
    return [alpha(vivid, 0.42), '#FFFFFF1A', alpha(vivid, 0.16), p.bg];
  }
  const hue = chromatic(bg) ? bg.h : chromatic(ac) ? ac.h : null;
  if (hue == null) {
    // Neutral palette (black / white / grey): soft monochrome glows.
    return fgLight
      ? ['#FFFFFF2E', '#FFFFFF1F', '#FFFFFF14', p.bg]
      : [oklch(0.86, 0, 0), oklch(0.92, 0, 0), oklch(0.8, 0, 0), p.bg];
  }
  return [
    glow((hue + 345) % 360, 0.17, 1),
    chromatic(ac) ? glow(ac.h, ac.c, 0.9) : glow((hue + 30) % 360, 0.14, 0.9),
    glow((hue + 15) % 360, 0.12, 0.7),
    p.bg,
  ];
}
