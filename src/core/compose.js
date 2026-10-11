import { loadBrand, dataUriResolver, httpResolver, assetPath } from './brands.js';
import { FORMATS, orientation } from './formats.js';
import { getTemplate } from './templates/index.js';
import { documentHtml, luminance, ANIMATIONS, BG_STYLES, EFFECTS } from './templates/base.js';
import { isVideo, videoPoster } from './media.js';

/**
 * Build the full HTML document for one ad.
 * @param {object} o
 * @param {string|object} o.brand     brand id or loaded brand
 * @param {string} o.template         template id
 * @param {string} [o.palette]        palette name in the brand (default: first)
 * @param {string} o.format           format id (see formats.js)
 * @param {object} o.content          copy + options (headline, subhead, cta, background, animation, ...)
 * @param {'data'|'http'} [o.assets]  'data' inlines assets (rendering); 'http' links to the web server (live preview)
 */
export async function composeAd({ brand, template, palette, format, content: input = {}, assets = 'data', still = false }) {
  const content = normalizeContent(input);
  const b = typeof brand === 'string' ? await loadBrand(brand) : brand;
  const fmt = FORMATS[format];
  if (!fmt) throw new Error(`Unknown format "${format}"`);
  // Per-platform switch: no button on this platform's ads (e.g. TikTok has its own UI for that).
  if (content.platformOpts?.[fmt.platform]?.cta === false) { delete content.cta; delete content.ctaFx; }
  if (palette && !b.palettes[palette]) throw new Error(`Brand "${b.id}" has no palette "${palette}". Has: ${Object.keys(b.palettes).join(', ')}`);
  const paletteName = palette ?? Object.keys(b.palettes)[0];
  const pal = b.palettes[paletteName];
  const tpl = getTemplate(template);
  const preview = assets === 'http';
  const resolve = preview ? httpResolver(b) : dataUriResolver(b);

  const animation = content.animation ?? 'none';
  if (!ANIMATIONS.some((a) => a.id === animation)) throw new Error(`Unknown animation "${animation}". Known: ${ANIMATIONS.map((a) => a.id).join(', ')}`);
  const brandBg = b.style.bgStyle ?? 'solid';
  const bgStyle = content.bgStyle ?? (brandBg === 'solid' && tpl.preferBg ? tpl.preferBg : brandBg);
  if (!BG_STYLES.some((s) => s.id === bgStyle)) throw new Error(`Unknown background style "${bgStyle}"`);

  // Background media: images inline as-is; videos play live in the editor, and for rendering
  // start from a poster frame that the renderer swaps per frame when making a video.
  let bgUrl = null;
  let bgKind = null;
  if (content.background) {
    if (isVideo(content.background)) {
      bgKind = preview ? 'video-live' : 'video-frames';
      bgUrl = preview ? await resolve(content.background) : await resolve(await videoPoster(assetPath(b, content.background)));
    } else {
      bgKind = 'image';
      bgUrl = await resolve(content.background);
    }
  }

  const ctx = {
    brand: b,
    palette: pal,
    paletteName,
    format: fmt,
    formatId: format,
    orient: orientation(fmt),
    u: Math.min(fmt.width, fmt.height) / 100,
    content,
    align: content.align || b.style.align || 'left',
    overlay: Number(content.overlay ?? b.style.overlay ?? 0.45),
    lightBg: luminance(pal.bg) > 0.45,
    bgStyle,
    bgKind,
    bgUrl,
    mode: preview ? 'preview' : 'render',
    still,
    templateId: tpl.id,
    textOnPhoto: !!tpl.textOnPhoto,
    animation,
    effects: content.effects ?? [],
    duration: Number(content.duration ?? 6),
    resolve,
    logoUrl: b.logo ? await resolve(content.logoVariant ?? b.logo) : null,
  };
  return documentHtml(ctx, tpl.render(ctx));
}

/**
 * Older designs used animation 'shine' / 'glimmer'; those are now effects that layer on top of
 * any motion. Map them so saved work keeps rendering the same.
 */
export function normalizeContent(c = {}) {
  const out = { ...c };
  const legacy = { shine: 'holo', glimmer: 'glimmer' };
  if (legacy[out.animation]) {
    out.effects = [...new Set([...(out.effects ?? []), legacy[out.animation]])];
    out.animation = 'fade-up';
  }
  out.effects = (out.effects ?? []).filter((e) => EFFECTS.some((x) => x.id === e));
  return out;
}
