import { esc, parts, rich, rootClass } from './base.js';

// Product spotlight: the photo in a big circle inside a rotating text ring, with a price sticker.
export default {
  id: 'spotlight',
  name: 'Spotlight',
  category: 'photo',
  description: 'Put one product or person in the spotlight: your photo in a big circle wrapped in a slowly turning text ring (your brand name), a round price / offer sticker, headline and button.',
  fields: ['eyebrow', 'headline', 'subhead', 'offer', 'cta', 'background'],
  preferBg: 'spotlight',
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const ringText = `${ctx.brand.name} • ${c.eyebrow ? c.eyebrow.replace(/[*_|]/g, '') : 'new in'} • `.toUpperCase();
    const ring = `<svg class="ring" viewBox="0 0 200 200"><defs><path id="rp" d="M100,100 m-88,0 a88,88 0 1,1 176,0 a88,88 0 1,1 -176,0"/></defs>
<text><textPath href="#rp" textLength="548" lengthAdjust="spacing">${esc(ringText.repeat(Math.max(1, Math.ceil(60 / ringText.length))).slice(0, 80))}</textPath></text></svg>`;
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--gap)*1.1);text-align:center}
.o-landscape .frame{flex-direction:row;text-align:left;gap:calc(var(--pad)*.9)}
.stage{position:relative;flex:none;width:calc(var(--u)*50);aspect-ratio:1}
.o-portrait .stage{width:calc(var(--u)*72)}
.o-landscape .stage{width:calc(var(--u)*66)}
.ring{position:absolute;inset:0;width:100%;height:100%;font-family:var(--font-body);font-weight:800;font-size:11.5px;letter-spacing:.06em;fill:var(--fg);animation:spin 24s linear infinite}
@keyframes spin{to{rotate:360deg}}
.circle{position:absolute;inset:13%;border-radius:50%;overflow:hidden;background:var(--block);box-shadow:0 calc(var(--u)*1.6) calc(var(--u)*5) rgba(0,0,0,.3)}
.circle .bg{position:absolute;inset:0}
.circle .ph{position:absolute;inset:0;display:grid;place-items:center;color:var(--block-ink);font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*6)}
.sticker{position:absolute;right:-2%;top:4%;width:calc(var(--u)*19);aspect-ratio:1;border-radius:50%;background:var(--accent);color:var(--cta-text);display:grid;place-items:center;text-align:center;
  font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*4.6);line-height:.95;padding:calc(var(--u)*2);rotate:12deg;box-shadow:0 calc(var(--u)*.8) calc(var(--u)*2.4) rgba(0,0,0,.3)}
.side{display:flex;flex-direction:column;align-items:center;gap:calc(var(--gap)*.8);width:100%;min-width:0}
.o-landscape .side{align-items:flex-start;flex:1}
.hbox{height:calc(var(--u)*16);width:100%;justify-content:center;align-items:center}
.o-landscape .hbox{height:calc(var(--u)*26);justify-content:flex-start}
.headline{width:100%}
.a-left .headline,.o-landscape .headline{text-align:inherit}
.side .cta{align-self:center}
.o-landscape .side .cta{align-self:flex-start}
`;
    const body = `
<div class="${rootClass(ctx, 'a-center')}">
  ${p.genbg}
  <div class="frame">
    <div class="stage" data-anim-panel>
      ${ring}
      <div class="circle">${p.media || `<div class="ph">${esc(ctx.brand.name.trim()[0] ?? '★')}</div>`}</div>
      ${c.offer ? `<div class="sticker offer">${rich(c.offer)}</div>` : ''}
    </div>
    <div class="side">
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="8"')}</div>
      ${p.sub}
      ${p.cta}
    </div>
  </div>
</div>`;
    return { css, body };
  },
};
