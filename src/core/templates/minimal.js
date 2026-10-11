import { parts, rootClass } from './base.js';

// Quiet luxury: lots of space, centred, fine rules, text-link CTA.
export default {
  id: 'minimal',
  name: 'Minimal',
  description: 'Calm and premium: centred type with lots of breathing room, hairline rules and an underlined text link instead of a button.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const css = `
.frame{position:absolute;inset:0;padding:calc(var(--pad-top)*1.3) calc(var(--pad)*1.5) calc(var(--pad-bottom)*1.3);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:calc(var(--gap)*1.3)}
.rule{width:calc(var(--u)*9);height:calc(var(--u)*.18);background:var(--accent);flex:none}
.eyebrow{color:var(--muted);letter-spacing:.32em;font-weight:600;font-size:calc(var(--u)*2.5)}
.fitbox{width:100%;height:34%;align-items:center;justify-content:center}
.o-portrait .fitbox{height:28%}
.o-landscape .fitbox{height:38%;width:80%}
.headline{width:100%;text-align:center}
.sub{font-size:calc(var(--u)*3.3);color:var(--muted);opacity:1;max-width:28em}
.cta{background:none;color:var(--fg);padding:0 0 .35em;border-radius:0;border-bottom:calc(var(--u)*.25) solid var(--accent);font-weight:600;letter-spacing:.05em;align-self:center;font-size:calc(var(--u)*3)}
.brandmark{position:absolute;left:0;right:0;bottom:var(--pad-bottom);display:flex;justify-content:center}
.brandmark .logo img{height:calc(var(--u)*4.5)}
.brandmark .wordmark{font-size:calc(var(--u)*2.8);letter-spacing:.2em;text-transform:uppercase}
.foot{max-width:40em}
`;
    const body = `
<div class="${rootClass(ctx, 'a-center')}">
  ${p.bg}
  <div class="frame">
    ${p.eyebrow}
    <div class="rule"></div>
    <div class="fitbox">${p.headline('data-min="3" data-max="9.5"')}</div>
    ${p.sub}
    ${p.cta}
    ${p.foot}
  </div>
  <div class="brandmark">${p.logo}</div>
</div>`;
    return { css, body };
  },
};
