import { esc, parts, rootClass } from './base.js';

// iPhone "liquid glass": frosted, specular-edged panels floating over a vivid aurora, photo or video.
export default {
  id: 'glass',
  name: 'Liquid Glass',
  description: 'iPhone-style frosted glass card with specular edges floating over a vivid aurora (or your photo / video). Soft, premium, very iOS.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'footnote', 'badge', 'background'],
  preferBg: 'aurora',
  render(ctx) {
    const p = parts(ctx);
    const badge = ctx.content.badge ? `<div class="orb glass" data-anim-panel><span>${esc(ctx.content.badge)}</span></div>` : '';
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;justify-content:space-between;gap:var(--gap)}
.pill{align-self:flex-start;display:flex;align-items:center;padding:calc(var(--u)*1.5) calc(var(--u)*2.8);border-radius:999px}
.a-center .pill{align-self:center}
.pill .logo img{height:calc(var(--u)*3.6)}
.pill .wordmark{font-size:calc(var(--u)*2.8)}
.card{display:flex;flex-direction:column;gap:var(--gap);padding:calc(var(--u)*6);border-radius:calc(var(--u)*6.5)}
.o-portrait .card{height:60%}
.o-square .card{height:66%}
.o-landscape .frame{flex-direction:row;align-items:stretch;justify-content:flex-end}
.o-landscape .pill{position:absolute;left:var(--pad);top:var(--pad)}
.o-landscape .card{width:56%;height:100%}
.o-landscape.a-center .frame{justify-content:center}
.card .fitbox{flex:1;align-items:flex-end}
.a-center .card .fitbox{align-items:center;justify-content:center}
.headline{width:100%}
.card .eyebrow{align-self:flex-start;color:var(--fg);background:var(--glass-strong);padding:.7em 1.2em;border-radius:999px;letter-spacing:.12em}
.a-center .card .eyebrow{align-self:center}
.card .row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--gap)}
.card .row .sub{flex:1 1 0;min-width:min(16em,100%)}
.a-center .card .row{flex-direction:column}
.o-portrait .card .row{flex-direction:column;align-items:flex-start}
.o-portrait.a-center .card .row{align-items:center}
.card .cta{border-radius:999px;box-shadow:0 calc(var(--u)*.8) calc(var(--u)*2.5) rgba(0,0,0,.18)}
.sub{font-size:calc(var(--u)*3.5)}
.orb{position:absolute;right:calc(var(--pad)*.9);top:calc(var(--pad-top) + var(--u)*2);width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;
  font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*4.4);line-height:1;padding:calc(var(--u)*2);rotate:8deg}
.o-landscape .orb{top:auto;bottom:var(--pad);right:auto;left:calc(var(--pad) + var(--u)*4)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    ${p.logo ? `<div class="pill glass" data-anim-panel>${p.logo}</div>` : '<div></div>'}
    <div class="card glass" data-anim-panel>
      ${p.eyebrow}
      <div class="fitbox">${p.headline('data-min="3" data-max="13"')}</div>
      <div class="row">${p.sub}${p.cta}</div>
      ${p.foot}
    </div>
  </div>
  ${badge}
</div>`;
    return { css, body };
  },
};
