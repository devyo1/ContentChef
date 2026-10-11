import { parts, rich, rootClass } from './base.js';

// Promo: a huge offer ("30% OFF", "2 FOR 1", "FREE") with supporting headline and CTA.
export default {
  id: 'offer',
  name: 'Big Offer',
  description: 'Promotion / sale. The `offer` field ("30% OFF", "2 for 1", "Free\\nshipping") is set huge in the accent colour; headline supports it.',
  fields: ['eyebrow', 'offer', 'headline', 'subhead', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const offer = ctx.content.offer ?? ctx.content.headline;
    const headline = ctx.content.offer ? p.headline('data-min="3" data-max="7.5"') : '';
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--gap)}
.top{display:flex;flex-direction:column;align-items:center;gap:calc(var(--gap)*.8)}
.offerbox{flex:1.6;width:100%;align-items:center;justify-content:center}
.offer{font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:-.03em;line-height:.86;text-transform:var(--headline-case);color:var(--accent);text-align:center;white-space:nowrap;width:100%}
.headbox{flex:.7;width:100%;justify-content:center;align-items:flex-start}
.headline{width:100%;text-align:center}
.cta{align-self:center}
.sub{margin-inline:auto}
.o-landscape .frame{display:grid;grid-template-columns:1.1fr 1fr;grid-template-rows:auto 1fr auto auto auto;text-align:left;align-items:stretch;column-gap:calc(var(--pad)*.9)}
.o-landscape .top{grid-column:1 / -1;flex-direction:row;justify-content:space-between}
.o-landscape .offerbox{grid-column:1;grid-row:2 / 6}
.o-landscape .headbox{grid-column:2;grid-row:2;align-items:flex-end;justify-content:flex-start}
.o-landscape .headline{text-align:left}
.o-landscape .sub{grid-column:2;margin:0}
.o-landscape .cta{grid-column:2;align-self:start;justify-self:start}
.o-landscape .foot{grid-column:2}
.ring{position:absolute;border-radius:50%;border:calc(var(--u)*.35) solid var(--accent);opacity:.18;width:calc(var(--u)*130);height:calc(var(--u)*130);left:50%;top:44%;transform:translate(-50%,-50%)}
.has-bg .ring{display:none}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  ${!ctx.bgUrl && ctx.bgStyle === 'solid' ? '<div class="ring"></div>' : ''}
  <div class="frame">
    <div class="top">${p.logo}${p.eyebrow}</div>
    <div class="fitbox offerbox"><div class="offer" data-fit data-min="8" data-max="40">${rich(offer)}</div></div>
    ${headline ? `<div class="fitbox headbox">${headline}</div>` : ''}
    ${p.sub}
    ${p.cta}
    ${p.foot}
  </div>
</div>`;
    return { css, body };
  },
};
