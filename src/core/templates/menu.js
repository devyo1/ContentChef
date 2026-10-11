import { esc, listItems, parts, rich, rootClass } from './base.js';

/** "Oat flat white: £3.20" / "Croissant — 2.80" → { name, price }; lines without a price keep just a name. */
export function menuItem(line) {
  const m = /^(.*?)\s*(?::|–|—|-{1,2}|\.{2,}|\|)\s*([£$€¥]?\s?\d[\d.,]*\s?(?:[£$€]|k|p)?(?:\s*\/\s*\S+)?)\s*$/i.exec(line);
  return m ? { name: m[1], price: m[2] } : { name: line, price: '' };
}

// A menu / price list board: item names, dotted leaders, prices.
export default {
  id: 'menu',
  name: 'Menu',
  category: 'promo',
  description: 'A menu or price list: one item per line as "Name: price" with dotted leaders. Cafés, salons, services, packages.',
  fields: ['eyebrow', 'headline', 'points', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    let items = listItems(c.points).map(menuItem);
    if (!items.length) items = ['Espresso: 2.80', 'Flat white: 3.40', 'Oat latte: 3.60', 'Filter, by the cup: 3.00'].map(menuItem);
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;align-items:center;gap:calc(var(--gap)*1.1);text-align:center}
.board{width:100%;max-width:calc(var(--u)*86);flex:1;min-height:0;display:flex;flex-direction:column;gap:calc(var(--gap)*1.1);padding:calc(var(--u)*5.5) calc(var(--u)*6);
  border:calc(var(--u)*.35) solid color-mix(in srgb,var(--fg) 30%,transparent);border-radius:calc(var(--u)*2);outline:calc(var(--u)*.2) solid color-mix(in srgb,var(--fg) 15%,transparent);outline-offset:calc(var(--u)*-1.6)}
.o-landscape .board{max-width:calc(var(--u)*140)}
.hbox{height:calc(var(--u)*16);justify-content:center;align-items:center}
.headline{width:100%;text-align:center}
.mbox{flex:1;min-height:0;align-items:center}
.items{list-style:none;margin:0;padding:0;width:100%;display:flex;flex-direction:column;gap:.75em;font-size:calc(var(--u)*3.8);text-align:left}
.o-landscape .items{display:grid;grid-template-columns:1fr 1fr;column-gap:2.2em}
.items li{display:flex;align-items:baseline;gap:.5em}
.items .nm{font-weight:600}
.items .ld{flex:1;border-bottom:.12em dotted color-mix(in srgb,var(--fg) 45%,transparent);transform:translateY(-.25em);min-width:1em}
.items .pr{font-family:var(--font-display);font-weight:var(--display-weight);color:var(--accent);font-variant-numeric:tabular-nums}
.foot{opacity:.7}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    ${p.logo}
    <div class="board" data-anim-panel>
      ${p.eyebrow}
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="8"')}</div>
      <div class="fitbox mbox"><ul class="items list" data-fit data-min="2" data-max="${ctx.orient === 'portrait' ? 5 : 4.2}">
        ${items.map((it) => `<li><span class="nm">${rich(it.name)}</span>${it.price ? `<span class="ld"></span><span class="pr">${esc(it.price)}</span>` : ''}</li>`).join('')}
      </ul></div>
    </div>
    ${p.foot}
  </div>
</div>`;
    return { css, body };
  },
};
