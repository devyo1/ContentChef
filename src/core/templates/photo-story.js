import { parts, rootClass } from './base.js';

// Full-bleed photo kept true-colour; a neutral dark fade only where the text sits.
export default {
  id: 'photo-story',
  name: 'Photo Story',
  category: 'photo',
  description: 'Your photo full-bleed and untouched, with white text on a soft dark fade at the bottom. The classic photo post / Story.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'background'],
  textOnPhoto: true,
  render(ctx) {
    const p = parts(ctx);
    const css = `
.shade{position:absolute;inset:0;pointer-events:none;opacity:calc(var(--overlay) + .5);
  background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.5) 34%,rgba(0,0,0,0) 62%),linear-gradient(to bottom,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 22%)}
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;justify-content:space-between;gap:var(--gap)}
.bottom{display:flex;flex-direction:column;gap:calc(var(--gap)*.9)}
.hbox{height:calc(var(--u)*30);align-items:flex-end}
.o-portrait .hbox{height:calc(var(--u)*38)}
.o-landscape .bottom{max-width:62%}
.headline{width:100%}
.row{display:flex;align-items:center;justify-content:space-between;gap:var(--gap);flex-wrap:wrap}
.a-center .frame{text-align:center}
.a-center .row{justify-content:center}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.media || p.genbg}
  <div class="shade"></div>
  <div class="frame">
    <div>${p.logo}</div>
    <div class="bottom">
      ${p.eyebrow}
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="11"')}</div>
      <div class="row">${p.sub}${p.cta}</div>
    </div>
  </div>
</div>`;
    return { css, body };
  },
};
