import { parts, rootClass } from './base.js';

// Editorial: full-bleed image inside a thin keyline frame, copy on a solid card.
export default {
  id: 'frame',
  name: 'Editorial Frame',
  description: 'Full-bleed photo with an inset keyline and a solid copy card (bottom in portrait/square, right side in landscape). Premium / magazine feel.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const css = `
.ad.no-bg{background:var(--block)}
.keyline{position:absolute;inset:calc(var(--pad)*.45);border:calc(var(--u)*.28) solid var(--fg);opacity:.85;pointer-events:none;z-index:2}
.no-bg .keyline{border-color:var(--block-ink)}
.badge{position:absolute;top:max(calc(var(--pad)*.45 + var(--u)*3.5), var(--safe-top));left:calc(var(--pad)*.45 + var(--u)*3.5);z-index:3}
.has-bg .badge .wordmark{color:var(--fg)}
.no-bg .badge .wordmark{color:var(--block-ink)}
.card{position:absolute;z-index:3;background:var(--bg);padding:calc(var(--pad)*.8);display:flex;flex-direction:column;gap:var(--gap)}
.o-portrait .card,.o-square .card{left:calc(var(--pad)*.45 + var(--u)*3.5);right:calc(var(--pad)*.45 + var(--u)*3.5);bottom:max(calc(var(--pad)*.45 + var(--u)*3.5), var(--safe-bottom));max-height:58%}
.o-square .card{max-height:56%}
.o-landscape .card{top:calc(var(--pad)*.45 + var(--u)*3.5);bottom:calc(var(--pad)*.45 + var(--u)*3.5);right:calc(var(--pad)*.45 + var(--u)*3.5);width:46%}
.fitbox{flex:1 1 auto;align-items:flex-end}
.o-landscape .fitbox{align-items:center}
.o-portrait .fitbox{min-height:calc(var(--u)*20)}
.o-square .fitbox{min-height:calc(var(--u)*14)}
.headline{width:100%}
.row{display:flex;align-items:center;justify-content:space-between;gap:var(--gap)}
.o-landscape .row{flex-direction:column;align-items:flex-start}
.sub{font-size:calc(var(--u)*3.4)}
.o-landscape .sub{font-size:calc(var(--u)*3.6)}
.cta{font-size:calc(var(--u)*3)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${ctx.bgUrl ? p.media : ctx.bgStyle === 'solid' ? '' : p.genbg}
  <div class="keyline"></div>
  <div class="badge">${p.logo}</div>
  <div class="card" data-anim-panel>
    ${p.eyebrow}
    <div class="fitbox">${p.headline('data-min="3" data-max="12"')}</div>
    <div class="row">${p.sub}${p.cta}</div>
    ${p.foot}
  </div>
</div>`;
    return { css, body };
  },
};
