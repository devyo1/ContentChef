import { parts, rootClass } from './base.js';

// The photo takes most of the frame; copy lives on a solid brand-colour panel below / beside it.
export default {
  id: 'photo-card',
  name: 'Photo Card',
  category: 'photo',
  description: 'Photo on top (or left), copy on a solid brand-colour panel. The photo is never covered or tinted. Products, places, people. With body text, the body replaces the supporting line.',
  fields: ['eyebrow', 'headline', 'subhead', 'body', 'cta', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const css = `
.wrap{position:absolute;inset:0;display:flex;flex-direction:column}
.o-landscape .wrap{flex-direction:row}
.ph{position:relative;flex:0 0 62%;overflow:hidden}
.o-square .ph{flex-basis:56%}
.o-landscape .ph{flex-basis:56%}
.ph .badge{position:absolute;top:calc(var(--pad-top)*.6 + var(--u)*1);left:calc(var(--pad)*.7);z-index:2;background:var(--bg);padding:calc(var(--u)*1.4) calc(var(--u)*2.2);border-radius:calc(var(--u)*1.6)}
.ph .badge .logo img{height:calc(var(--u)*3.6)}
.ph .badge .wordmark{font-size:calc(var(--u)*2.6)}
.panel{flex:1;min-height:0;min-width:0;background:var(--bg);padding:calc(var(--pad)*.8) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*.8)}
.o-landscape .panel{padding:var(--pad);justify-content:center}
.hbox{flex:1.3 1 0;align-items:center;min-height:calc(var(--u)*8)}
.bbox{flex:1 1 0;min-height:calc(var(--u)*5);align-items:flex-start}
.headline{width:100%}
.panel .body{opacity:.85}
.row{display:flex;align-items:center;justify-content:space-between;gap:var(--gap);flex-wrap:wrap}
.sub{font-size:calc(var(--u)*3.2)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  <div class="wrap">
    <div class="ph">${p.media || p.genbg}${p.logo ? `<div class="badge">${p.logo}</div>` : ''}</div>
    <div class="panel" data-anim-panel>
      ${p.eyebrow}
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="8.5"')}</div>
      ${c.body ? `<div class="fitbox bbox">${p.body(c.body, 'data-fit data-min="1.9" data-max="3.2"')}</div>` : ''}
      <div class="row">${c.body ? '' : p.sub}${p.cta || p.link}</div>
    </div>
  </div>
</div>`;
    return { css, body };
  },
};
