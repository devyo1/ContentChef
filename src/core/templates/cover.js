import { esc, listItems, parts, pointHtml, rich, rootClass } from './base.js';

// Magazine cover: huge masthead, photo full-bleed, cover lines and an optional sticker.
export default {
  id: 'cover',
  name: 'Magazine Cover',
  category: 'photo',
  description: 'Your photo as a magazine cover: brand name as a huge masthead, the headline as the cover story, list points as cover lines, and an optional round sticker (offer or stat).',
  fields: ['eyebrow', 'headline', 'points', 'offer', 'stat', 'background'],
  textOnPhoto: true,
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const lines = listItems(c.points).slice(0, 4);
    const sticker = c.offer ?? c.stat;
    const css = `
.shade{position:absolute;inset:0;pointer-events:none;opacity:calc(var(--overlay) + .45);
  background:linear-gradient(to bottom,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 30%),linear-gradient(to top,rgba(0,0,0,.75) 0%,rgba(0,0,0,0) 45%)}
.frame{position:absolute;inset:0;padding:calc(var(--pad-top)*.8) calc(var(--pad)*.8) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--u)*1.6)}
.mbox{flex:0 0 auto;height:calc(var(--u)*22)}
.masthead{width:100%;font-family:var(--font-display);font-weight:var(--display-weight);text-transform:uppercase;letter-spacing:-.02em;line-height:.82;white-space:nowrap;text-align:center}
.issue{display:flex;justify-content:space-between;font-size:calc(var(--u)*2.3);font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.9;border-top:calc(var(--u)*.25) solid currentColor;padding-top:calc(var(--u)*1)}
.spacer{flex:1}
.story{display:flex;flex-direction:column;gap:calc(var(--u)*1.6);max-width:78%}
.o-landscape .story{max-width:55%}
.hbox{height:calc(var(--u)*24);align-items:flex-end}
.headline{width:100%}
.clines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:calc(var(--u)*.9);font-size:calc(var(--u)*2.9);line-height:1.25}
.clines b{color:var(--accent);text-transform:uppercase;letter-spacing:.04em}
.sticker{position:absolute;right:calc(var(--pad)*.8);top:calc(var(--pad-top)*.8 + var(--u)*30);width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;background:var(--accent);color:var(--cta-text);
  display:grid;place-items:center;text-align:center;padding:calc(var(--u)*2.5);font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*5);line-height:.95;rotate:10deg;box-shadow:0 calc(var(--u)*1) calc(var(--u)*3) rgba(0,0,0,.3)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.media || p.genbg}
  <div class="shade"></div>
  <div class="frame">
    <div class="fitbox mbox"><div class="masthead" data-fit data-min="8" data-max="30">${esc(ctx.brand.name)}</div></div>
    <div class="issue" data-anim-item><span>${c.eyebrow ? rich(c.eyebrow) : ''}</span><span>${p.handle}</span></div>
    <div class="spacer"></div>
    <div class="story">
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="10"')}</div>
      ${lines.length ? `<ul class="clines" data-anim-item>${lines.map((l) => `<li>${pointHtml(l)}</li>`).join('')}</ul>` : ''}
    </div>
  </div>
  ${sticker ? `<div class="sticker" data-anim-item>${rich(sticker)}</div>` : ''}
</div>`;
    return { css, body };
  },
};
