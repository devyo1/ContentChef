import { parts, rootClass } from './base.js';

export default {
  id: 'carousel-slide', name: 'Carousel Story', category: 'content', textOnPhoto: true,
  description: 'A connected carousel slide with position, reading cues, body copy and a final CTA.',
  fields: ['eyebrow', 'headline', 'subhead', 'body', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx), c = ctx.content;
    const count = Math.max(2, Math.min(20, Math.floor(Number(c.slideCount) || 5)));
    const number = Math.max(1, Math.min(count, Math.floor(Number(c.slideNumber) || 1)));
    const final = number === count, hook = number === 1;
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:var(--gap)}
.top,.bottom{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.top .logo img{height:calc(var(--u)*4.5)}
.slide-index{font-size:calc(var(--u)*2.5);font-weight:700;letter-spacing:.08em;opacity:.7}
.story{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--gap)*1.4)}
.hbox{flex:0 1 ${hook || final ? '48%' : '32%'};min-height:0;align-items:center}
.headline{width:100%}.bbox{flex:0 1 42%;min-height:0}.body{opacity:.92}
.sub{font-size:calc(var(--u)*3.5)}
.bottom{padding-top:calc(var(--gap)*.8);border-top:calc(var(--u)*.15) solid color-mix(in srgb,var(--fg) 20%,transparent)}
.read-cue{font-size:calc(var(--u)*2.4);font-weight:600;white-space:nowrap}
.page-dots{display:flex;gap:calc(var(--u)*.6)}.page-dots i{width:calc(var(--u)*.7);height:calc(var(--u)*.7);border-radius:99px;background:currentColor;opacity:.2}.page-dots i.active{width:calc(var(--u)*2);opacity:1;background:var(--accent)}
.a-center .story{text-align:center;align-items:center}.a-center .fitbox{width:100%}.a-center .headline{text-align:center}
`;
    return { css, body: `<div class="${rootClass(ctx)}">${p.bg}<div class="frame">
      <div class="top">${p.logo}<span class="slide-index">${String(number).padStart(2, '0')} / ${String(count).padStart(2, '0')}</span></div>
      <div class="story">${p.eyebrow}<div class="fitbox hbox">${p.headline(`data-min="3" data-max="${hook || final ? 14 : 10}"`)}</div>${p.sub}
      ${c.body ? `<div class="fitbox bbox">${p.body(c.body, 'data-fit data-min="2" data-max="4.2"')}</div>` : ''}${final ? p.cta : ''}</div>
      ${p.foot}<div class="bottom"><span class="page-dots">${Array.from({ length: count }, (_, i) => `<i${i + 1 === number ? ' class="active"' : ''}></i>`).join('')}</span><span class="read-cue">${final ? 'Your next step ↑' : 'Swipe to continue →'}</span></div>
    </div></div>` };
  },
};
