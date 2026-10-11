import { parts, rootClass } from './base.js';

// Typographic poster: a big auto-fitted headline dominates; works with or without a background image.
export default {
  id: 'headline',
  name: 'Headline Poster',
  description: 'Big typographic statement that fills the space. Optional background image with brand-tinted scrim. Best all-rounder.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:var(--gap)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.fitbox{flex:1;align-items:flex-end}
.a-center .fitbox{align-items:center;justify-content:center}
.a-center .top{justify-content:center;flex-direction:column}
.headline{width:100%}
.bottom{display:flex;flex-direction:column;gap:calc(var(--gap)*1.2)}
.o-landscape .bottom{flex-direction:row;align-items:flex-end;justify-content:space-between}
.o-landscape.a-center .bottom{flex-direction:column;align-items:center}
.o-landscape .sub{max-width:60%}
.o-portrait .fitbox{flex:1.4}
.no-bg .rule{height:calc(var(--u)*.5);width:calc(var(--u)*12);background:var(--accent)}
.a-center .rule{margin-inline:auto}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.logo}${p.eyebrow}</div>
    <div class="fitbox">${p.headline('data-min="4" data-max="21"')}</div>
    ${ctx.bgUrl ? '' : '<div class="rule"></div>'}
    <div class="bottom">${p.sub}${p.cta}</div>
    ${p.foot}
  </div>
</div>`;
    return { css, body };
  },
};
