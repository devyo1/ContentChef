import { esc, parts, rich, rootClass } from './base.js';

// One striking number, what it means, and where it comes from.
export default {
  id: 'stat',
  name: 'Big Stat',
  category: 'content',
  description: 'One striking number (“73%”, “2.4×”, “£1.2M”), a line saying what it means, optional context and a source. Data-led, credible.',
  fields: ['eyebrow', 'stat', 'headline', 'body', 'source', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const stat = c.stat ?? '73%';
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.1)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.top .logo img{height:calc(var(--u)*4.6)}
.top .wordmark{font-size:calc(var(--u)*2.8)}
.content{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--gap)*1.1)}
.sbox{flex:0 0 34%;align-items:flex-end}
.stat-num{font-family:var(--font-display);font-weight:var(--display-weight);color:var(--accent);line-height:.88;letter-spacing:-.035em;white-space:nowrap;width:100%;text-transform:var(--headline-case)}
.hbox{flex:0 0 20%;align-items:flex-start}
.headline{width:100%;line-height:1.08}
.bbox{flex:1;align-items:flex-start}
.body{opacity:.82}
.src{font-size:calc(var(--u)*2.3);opacity:.6}
.bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:var(--gap)}
.o-landscape .content{display:grid;grid-template-columns:1.05fr 1fr;grid-template-rows:auto 1fr;column-gap:calc(var(--pad)*.8);row-gap:var(--gap)}
.o-landscape .sbox{grid-row:1 / 3;align-items:center}
.o-landscape .hbox{align-items:flex-end;min-height:calc(var(--u)*16)}
.a-center .frame{text-align:center}
.a-center .top{justify-content:center}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.eyebrow || '<span></span>'}${p.logo}</div>
    <div class="content">
      <div class="fitbox sbox"><div class="stat-num" data-fit data-min="8" data-max="34">${rich(stat)}</div></div>
      <div class="fitbox hbox">${p.headline('data-min="2.8" data-max="6.5"')}</div>
      <div class="fitbox bbox">${p.body(c.body, 'data-fit data-min="2" data-max="3.6"')}</div>
    </div>
    <div class="bottom"><span class="src">${c.source ? `Source: ${esc(c.source)}` : `<span class="handle">${p.handle}</span>`}</span>${p.link}</div>
  </div>
</div>`;
    return { css, body };
  },
};
