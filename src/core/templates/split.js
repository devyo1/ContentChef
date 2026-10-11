import { esc, parts, rootClass } from './base.js';

// Image on one side, copy on the other. Image goes top in portrait, left in landscape/square.
export default {
  id: 'split',
  name: 'Split Panel',
  description: 'Image panel + solid copy panel. Product shots, people, places. Without an image the panel becomes an accent block with the brand mark.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const media = ctx.bgUrl
      ? p.media
      : `${ctx.bgStyle === 'solid' ? '' : p.genbg}<div class="mark"><span>${esc(ctx.content.mark ?? ctx.brand.name)}</span></div>`;
    const css = `
.wrap{position:absolute;inset:0;display:flex}
.o-landscape .wrap,.o-square .wrap{flex-direction:row}
.o-portrait .wrap{flex-direction:column}
.media{position:relative;flex:0 0 50%;overflow:hidden;background:var(--block)}
.o-portrait .media{flex-basis:52%}
.flip.o-landscape .wrap,.flip.o-square .wrap{flex-direction:row-reverse}
.mark{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding:var(--pad);color:var(--block-ink);font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*7);letter-spacing:var(--tracking);line-height:1;text-align:center}
.copy{background:var(--bg);flex:1;min-width:0;min-height:0;padding:var(--pad) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:var(--gap)}
.o-landscape .copy,.o-square .copy{padding:calc(var(--pad)*.85)}
.fitbox{flex:1;align-items:center}
.a-center .fitbox{justify-content:center}
.headline{width:100%}
.o-square .sub,.o-landscape .sub{font-size:calc(var(--u)*3.3)}
.o-square .cta,.o-landscape .cta{font-size:calc(var(--u)*2.9)}
.o-square .logo img{height:calc(var(--u)*5)}
`;
    const body = `
<div class="${rootClass(ctx, ctx.content.flip ? 'flip' : '')}">
  <div class="wrap">
    <div class="media">${media}</div>
    <div class="copy" data-anim-panel>
      ${ctx.bgUrl ? p.logo : ''}
      ${p.eyebrow}
      <div class="fitbox">${p.headline('data-min="3" data-max="13"')}</div>
      ${p.sub}
      ${p.cta}
      ${p.foot}
    </div>
  </div>
</div>`;
    return { css, body };
  },
};
