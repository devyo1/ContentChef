import { listItems, parts, pointHtml, rootClass } from './base.js';

// Numbered (or bulleted) tips list. "Title: detail" points get a bold lead-in.
export default {
  id: 'list',
  name: 'List',
  category: 'content',
  description: 'Numbered tips, steps or takeaways (one point per line; "Title: detail" bolds the title). Saves and shares well.',
  fields: ['eyebrow', 'headline', 'points', 'cta', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    let items = listItems(c.points ?? c.body);
    if (!items.length) items = ['Add your points in the Words step', 'One per line', 'Use "Title: detail" to bold a lead-in'];
    const numbered = c.numbered !== false;
    const lis = items.map((it, i) => `<li><span class="n">${numbered ? String(i + 1).padStart(2, '0') : '•'}</span><span class="t">${pointHtml(it)}</span></li>`).join('');
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.2)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.top .logo img{height:calc(var(--u)*4.6)}
.top .wordmark{font-size:calc(var(--u)*2.8)}
.content{flex:1;min-height:0;display:flex;flex-direction:column;gap:calc(var(--gap)*1.4)}
.hbox{flex:0 0 22%;align-items:flex-end}
.headline{width:100%}
.lbox{flex:1;align-items:flex-start}
.list{list-style:none;margin:0;padding:0;width:100%;display:flex;flex-direction:column;gap:.8em;font-family:var(--font-body)}
.list li{display:flex;gap:.85em;align-items:baseline;line-height:1.35;padding-bottom:.8em;border-bottom:1px solid color-mix(in srgb,var(--fg) 12%,transparent)}
.list li:last-child{border-bottom:0;padding-bottom:0}
.list .n{font-family:var(--font-display);font-weight:var(--display-weight);color:var(--accent);min-width:1.5em;font-size:1.1em;line-height:1;font-variant-numeric:tabular-nums;flex:none}
.list b{font-weight:700}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.o-landscape .content{flex-direction:row;gap:calc(var(--pad)*.9)}
.o-landscape .hbox{flex:0 0 36%;align-items:center}
.o-landscape .lbox{align-items:center}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.eyebrow || '<span></span>'}${p.logo}</div>
    <div class="content">
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="8"')}</div>
      <div class="fitbox lbox"><ol class="list" data-fit data-min="1.9" data-max="4.6">${lis}</ol></div>
    </div>
    <div class="bottom"><span class="handle">${p.handle}</span>${p.link}</div>
  </div>
</div>`;
    return { css, body };
  },
};
