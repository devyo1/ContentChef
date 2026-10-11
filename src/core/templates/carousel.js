import { parts, rootClass } from './base.js';

// The first slide of a carousel: a big hook, a "swipe" cue and page dots, so people keep swiping.
export default {
  id: 'carousel',
  name: 'Carousel Cover',
  category: 'content',
  description: 'The cover slide of an Instagram / LinkedIn carousel: a big hook headline, a short promise underneath, a "Swipe" cue and page dots.',
  fields: ['eyebrow', 'headline', 'subhead', 'handle', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.2)}
.top{display:flex;justify-content:space-between;align-items:center}
.top .logo img{height:calc(var(--u)*4.6)}
.num{font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*3.4);opacity:.5;letter-spacing:.04em}
.hbox{flex:1;min-height:0;align-items:center}
.headline{width:100%}
.sub{max-width:30em;font-size:calc(var(--u)*3.8)}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:var(--gap);padding-top:calc(var(--gap)*.6);border-top:calc(var(--u)*.25) solid color-mix(in srgb,var(--fg) 18%,transparent)}
.swipe{display:inline-flex;align-items:center;gap:.6em;padding:.75em 1.2em;border-radius:99px;background:var(--cta-bg);color:var(--cta-text);font-weight:800;font-size:calc(var(--u)*3);letter-spacing:.02em}
.swipe .arrow{display:inline-block}
.dots{display:flex;gap:calc(var(--u)*1.1);align-items:center}
.dots i{width:calc(var(--u)*1.4);height:calc(var(--u)*1.4);border-radius:99px;background:currentColor;opacity:.25}
.dots i:first-child{width:calc(var(--u)*4.2);opacity:1;background:var(--accent)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.logo}<span class="num" data-anim-item>01</span></div>
    ${p.eyebrow}
    <div class="fitbox hbox">${p.headline('data-min="4" data-max="15"')}</div>
    ${p.sub}
    <div class="bottom" data-anim-item><span class="handle">${p.handle}</span><span class="dots"><i></i><i></i><i></i><i></i><i></i></span><span class="swipe">Swipe <span class="arrow">→</span></span></div>
  </div>
</div>`;
    return { css, body };
  },
};
