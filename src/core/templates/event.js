import { esc, parts, rich, rootClass } from './base.js';

/** "Sat 18 Oct" → { big: '18', small: 'Sat Oct' }: the day number goes big, the rest small. */
export function splitDate(text) {
  const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const big = tokens.find((t) => /^\d{1,2}(st|nd|rd|th)?\.?$/i.test(t)) ?? tokens[0] ?? '';
  const rest = tokens.filter((t) => t !== big);
  return { big: big.replace(/(st|nd|rd|th)?\.?$/i, ''), top: rest[0] ?? '', bottom: rest.slice(1).join(' ') };
}

// An event / launch / workshop announcement built around a big calendar date.
export default {
  id: 'event',
  name: 'Event',
  category: 'promo',
  description: 'Announce an event, launch, workshop or live: a big calendar date block, the event name, time and place. Clear and save-the-date friendly.',
  fields: ['eyebrow', 'headline', 'subhead', 'date', 'time', 'cta', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const d = splitDate(c.date ?? 'Sat 18 Oct');
    const pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
    const clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.1)}
.top{display:flex;justify-content:space-between;align-items:center}
.top .logo img{height:calc(var(--u)*4.6)}
.main{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--gap)*1.3)}
.o-landscape .main{flex-direction:row;align-items:center;gap:calc(var(--pad)*.9)}
.cal{flex:none;align-self:flex-start;width:calc(var(--u)*30);border-radius:calc(var(--u)*3.4);overflow:hidden;background:var(--block);color:var(--block-ink);text-align:center;
  box-shadow:0 calc(var(--u)*1.4) calc(var(--u)*4) rgba(0,0,0,.25)}
.o-landscape .cal{align-self:center;width:calc(var(--u)*34)}
.o-portrait .cal{width:calc(var(--u)*40)}
.o-portrait .cal .day{font-size:calc(var(--u)*23)}
.o-portrait .facts{font-size:calc(var(--u)*4)}
.cal .mon{background:color-mix(in srgb,var(--block-ink) 14%,transparent);font-weight:800;letter-spacing:.18em;text-transform:uppercase;font-size:calc(var(--u)*2.7);padding:calc(var(--u)*1.4) 0}
.cal .day{font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*17);line-height:1;padding:calc(var(--u)*1.6) 0 0}
.cal .wd{font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:calc(var(--u)*2.4);opacity:.8;padding:0 0 calc(var(--u)*2)}
.info{display:flex;flex-direction:column;gap:calc(var(--gap)*.9);min-width:0;flex:1}
.hbox{height:calc(var(--u)*24);align-items:flex-end}
.o-portrait .hbox{height:calc(var(--u)*44)}
.headline{width:100%}
.facts{display:flex;flex-wrap:wrap;gap:calc(var(--u)*1.4) calc(var(--u)*3.2);font-size:calc(var(--u)*3.3);font-weight:600}
.facts span{display:inline-flex;align-items:center;gap:.45em}
.facts svg{width:1.05em;height:1.05em;color:var(--accent)}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.eyebrow || '<span></span>'}${p.logo}</div>
    <div class="main">
      <div class="cal" data-anim-panel><div class="mon">${esc(d.bottom || d.top || 'Save the date')}</div><div class="day">${esc(d.big)}</div><div class="wd">${esc(d.bottom ? d.top : '')}</div></div>
      <div class="info">
        <div class="fitbox hbox">${p.headline('data-min="3" data-max="9"')}</div>
        <div class="facts" data-anim-item>${c.time ? `<span>${clock}${esc(c.time)}</span>` : ''}${c.subhead ? `<span>${pin}${rich(c.subhead)}</span>` : ''}</div>
      </div>
    </div>
    <div class="bottom">${p.cta || '<span></span>'}<span class="handle">${p.handle}</span></div>
  </div>
</div>`;
    return { css, body };
  },
};
