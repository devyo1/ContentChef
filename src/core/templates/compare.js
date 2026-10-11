import { esc, listItems, parts, pointHtml, rootClass } from './base.js';

// Two-column comparison: myth vs fact, before vs after, don't vs do.
export default {
  id: 'compare',
  name: 'This vs That',
  category: 'content',
  description: 'Two columns side by side: Myth vs Fact, Before vs After, Don’t vs Do. Each side is a short list (one point per line).',
  fields: ['eyebrow', 'headline', 'leftTitle', 'leftPoints', 'rightTitle', 'rightPoints', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const L = listItems(c.leftPoints);
    const R = listItems(c.rightPoints);
    const col = (cls, title, items, mark) => `
      <div class="col ${cls}">
        <div class="ct"><span class="mk">${mark}</span>${esc(title)}</div>
        <ul>${(items.length ? items : ['Add points in the Words step']).map((i) => `<li>${pointHtml(i)}</li>`).join('')}</ul>
      </div>`;
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.2)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.top .logo img{height:calc(var(--u)*4.6)}
.top .wordmark{font-size:calc(var(--u)*2.8)}
.hbox{flex:0 0 18%;align-items:flex-end}
.headline{width:100%}
.cbox{flex:1;align-items:stretch}
.cols{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:.9em;font-family:var(--font-body);align-content:start}
.o-portrait .cols{grid-template-columns:1fr}
.col{border-radius:.8em;padding:1em 1.1em;min-width:0}
.col.l{background:color-mix(in srgb,var(--fg) 7%,transparent)}
.col.r{background:color-mix(in srgb,var(--accent) 16%,transparent);box-shadow:inset 0 0 0 .1em color-mix(in srgb,var(--accent) 55%,transparent)}
.ct{display:flex;align-items:center;gap:.5em;font-weight:800;font-size:1.15em;margin-bottom:.6em;text-transform:uppercase;letter-spacing:.06em}
.mk{display:grid;place-items:center;width:1.4em;height:1.4em;border-radius:50%;font-size:.8em;flex:none}
.l .mk{background:color-mix(in srgb,var(--fg) 18%,transparent)}
.r .mk{background:var(--accent);color:var(--cta-text)}
.col ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.55em;line-height:1.35}
.col li{padding-left:1em;position:relative}
.col li::before{content:"";position:absolute;left:0;top:.55em;width:.4em;height:.4em;border-radius:50%;background:currentColor;opacity:.45}
.l li{opacity:.8}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.eyebrow || '<span></span>'}${p.logo}</div>
    <div class="fitbox hbox">${p.headline('data-min="2.8" data-max="7"')}</div>
    <div class="fitbox cbox"><div class="cols" data-fit data-min="1.8" data-max="4">
      ${col('l', c.leftTitle ?? 'Myth', L, '✕')}${col('r', c.rightTitle ?? 'Fact', R, '✓')}
    </div></div>
    <div class="bottom"><span class="handle">${p.handle}</span>${p.link}</div>
  </div>
</div>`;
    return { css, body };
  },
};
