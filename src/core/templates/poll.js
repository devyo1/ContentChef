import { listItems, parts, rich, rootClass } from './base.js';

// "This or that?" engagement post: a question and 2–4 answer options people reply with.
export default {
  id: 'poll',
  name: 'Poll',
  category: 'social',
  description: 'An engagement post: a question plus 2–4 answer options (list points, or the left/right titles) for people to answer in the comments. Drives replies.',
  fields: ['eyebrow', 'headline', 'points', 'cta', 'handle', 'background'],
  preferBg: 'aurora',
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    let opts = listItems(c.points).slice(0, 4);
    if (opts.length < 2) opts = [c.leftTitle ?? 'This', c.rightTitle ?? 'That'];
    const letters = 'ABCD';
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.1)}
.top{display:flex;justify-content:space-between;align-items:center}
.top .logo img{height:calc(var(--u)*4.6)}
.card{flex:1;min-height:0;display:flex;flex-direction:column;gap:calc(var(--gap)*1.2);padding:calc(var(--u)*6);border-radius:calc(var(--u)*5)}
.hbox{flex:1;min-height:calc(var(--u)*12);align-items:center}
.headline{width:100%}
.opts{display:grid;gap:calc(var(--u)*2);grid-template-columns:1fr}
.o-landscape .opts{grid-template-columns:repeat(${Math.min(opts.length, 2)},1fr)}
.opt{display:flex;align-items:center;gap:calc(var(--u)*2.4);padding:calc(var(--u)*2.3) calc(var(--u)*2.8);border-radius:calc(var(--u)*2.6);
  background:color-mix(in srgb,var(--fg) 8%,transparent);border:calc(var(--u)*.3) solid color-mix(in srgb,var(--fg) 16%,transparent);font-weight:700;font-size:calc(var(--u)*${opts.length > 2 ? 3.6 : 4.2})}
.opt .k{flex:none;width:1.7em;height:1.7em;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--cta-text);font-size:.8em}
.opt:nth-child(2) .k{background:var(--fg);color:var(--bg)}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.reply{display:inline-flex;align-items:center;gap:.5em;font-weight:700;font-size:calc(var(--u)*3);color:var(--accent)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.eyebrow || '<span class="eyebrow">Quick question</span>'}${p.logo}</div>
    <div class="card glass" data-anim-panel>
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="9"')}</div>
      <div class="opts" data-anim-item>${opts.map((o, i) => `<div class="opt"><span class="k">${letters[i]}</span><span>${rich(o)}</span></div>`).join('')}</div>
    </div>
    <div class="bottom"><span class="reply">💬 ${rich(c.cta ?? 'Answer in the comments')}</span><span class="handle">${p.handle}</span></div>
  </div>
</div>`;
    return { css, body };
  },
};
