import { esc, parts, rootClass } from './base.js';

// Testimonial / pull-quote. Headline is the quote; `attribution` (or subhead) names the source.
export default {
  id: 'quote',
  name: 'Quote / Testimonial',
  description: 'Customer review, testimonial or manifesto line. `headline` is the quote, `attribution` the source (e.g. "— Sam R., verified buyer"). Optional `rating` 1–5 shows stars.',
  fields: ['headline', 'attribution', 'rating', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const stars = c.rating ? `<div class="stars">${'★'.repeat(Math.max(0, Math.min(5, Math.round(c.rating))))}</div>` : '';
    const attribution = c.attribution ?? c.subhead;
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:var(--gap)}
.mark{font-family:Georgia, "Times New Roman", serif;font-weight:700;color:var(--accent);font-size:calc(var(--u)*26);line-height:.7;height:calc(var(--u)*13);margin-left:calc(var(--u)*-1)}
.a-center .mark{text-align:center}
.stars{color:var(--accent);font-size:calc(var(--u)*4.4);letter-spacing:.12em}
.fitbox{flex:1;align-items:center}
.a-center .fitbox{justify-content:center}
.headline{width:100%;letter-spacing:-.01em;line-height:1.08;text-transform:none}
.who{font-size:calc(var(--u)*3.4);font-weight:600;opacity:.85}
.bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:var(--gap)}
.a-center .bottom{flex-direction:column;align-items:center}
.o-landscape .mark{font-size:calc(var(--u)*20);height:calc(var(--u)*9)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="mark">“</div>
    ${stars}
    <div class="fitbox">${p.headline('data-min="3" data-max="11"')}</div>
    ${attribution ? `<div class="who">${esc(attribution)}</div>` : ''}
    <div class="bottom">${p.logo}${p.cta}</div>
    ${p.foot}
  </div>
</div>`;
    return { css, body };
  },
};
