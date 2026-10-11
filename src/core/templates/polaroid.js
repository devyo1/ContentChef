import { parts, rich, rootClass } from './base.js';

// The photo as a tilted instant print on a brand-colour backdrop, caption written on the print.
export default {
  id: 'polaroid',
  name: 'Polaroid',
  category: 'photo',
  description: 'Your photo as a slightly tilted instant print on a brand-colour background, with the headline written on the print. Warm, personal, behind-the-scenes.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--gap)*1.4)}
.o-landscape .frame{flex-direction:row;gap:calc(var(--pad)*1.1)}
.print{background:#FDFCF8;padding:calc(var(--u)*2.6) calc(var(--u)*2.6) calc(var(--u)*3);border-radius:calc(var(--u)*.6);rotate:-3deg;
  box-shadow:0 calc(var(--u)*1.6) calc(var(--u)*5) rgba(0,0,0,.28),0 calc(var(--u)*.3) calc(var(--u)*.8) rgba(0,0,0,.18);display:flex;flex-direction:column;gap:calc(var(--u)*2.2);width:70%;flex:none}
.o-portrait .print{width:80%}
.o-landscape .print{width:auto;height:88%;aspect-ratio:.86}
.pic{position:relative;aspect-ratio:1;overflow:hidden;background:#ddd;width:100%}
.o-landscape .pic{flex:1;aspect-ratio:auto}
.cap{height:calc(var(--u)*10);display:flex;align-items:center;color:#1d1b18}
.cap .headline{width:100%;text-align:center;color:#1d1b18;line-height:1.05}
.cap .headline .hl{color:var(--accent)}
.side{display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--gap);max-width:86%}
.o-landscape .side{align-items:flex-start;text-align:left;flex:1}
.o-landscape .side .cta{align-self:flex-start}
.side .cta{align-self:center}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${ctx.bgStyle === 'solid' ? '' : p.genbg}
  <div class="frame">
    <div class="print" data-anim-panel>
      <div class="pic">${p.media || '<div class="genbg aurora"><i></i><i></i><i></i><i></i></div>'}</div>
      <div class="fitbox cap"><h1 class="headline" data-fit data-min="2.5" data-max="6">${rich(c.headline)}</h1></div>
    </div>
    <div class="side">${p.eyebrow}${p.sub}${p.cta}${p.logo}</div>
  </div>
</div>`;
    return { css, body };
  },
};
