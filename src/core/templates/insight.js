import { parts, rootClass } from './base.js';

// Value post: a clear headline and a paragraph of genuinely useful text. No sales button.
export default {
  id: 'insight',
  name: 'Insight',
  category: 'content',
  description: 'A value post: clear headline plus a paragraph of useful text. Tips, lessons, explainers, announcements. Optional quiet text link, no big button.',
  fields: ['eyebrow', 'headline', 'body', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const body = p.body(c.body ?? c.subhead, 'data-fit data-min="2.1" data-max="4.6"');
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.1)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--gap);min-height:calc(var(--u)*4)}
.top .logo img{height:calc(var(--u)*4.6)}
.top .wordmark{font-size:calc(var(--u)*2.8)}
.content{flex:1;min-height:0;display:flex;flex-direction:column;gap:calc(var(--gap)*1.1)}
.hbox{flex:0 0 30%;align-items:flex-end}
.o-portrait .hbox{flex-basis:26%}
.headline{width:100%}
.rule{width:calc(var(--u)*10);height:calc(var(--u)*.55);border-radius:99px;background:var(--accent);flex:none}
.bbox{flex:1;align-items:flex-start}
.body{opacity:.92}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.o-landscape .content{flex-direction:row;align-items:stretch;gap:calc(var(--pad)*.8)}
.o-landscape .hbox{flex:0 0 42%;align-items:center}
.o-landscape .rule{width:calc(var(--u)*.55);height:auto;align-self:stretch}
.o-landscape .bbox{align-items:center}
.a-center .frame{text-align:center}
.a-center .rule{align-self:center}
.a-center .top{justify-content:center}
`;
    const body_ = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.eyebrow || '<span></span>'}${p.logo}</div>
    <div class="content">
      <div class="fitbox hbox">${p.headline('data-min="3" data-max="9"')}</div>
      <div class="rule"></div>
      <div class="fitbox bbox">${body}</div>
    </div>
    <div class="bottom"><span class="handle">${p.handle}</span>${p.link}</div>
    ${p.foot}
  </div>
</div>`;
    return { css, body: body_ };
  },
};
