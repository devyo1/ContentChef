import { esc, parts, rich, rootClass } from './base.js';

// An event ticket: perforated stub with "admit one" (or a price) and a barcode.
export default {
  id: 'ticket',
  name: 'Ticket',
  category: 'promo',
  description: 'A paper event ticket with a tear-off stub: event name, date, time and place, plus "Admit one" or a price on the stub. Launches, gigs, workshops, giveaways.',
  fields: ['eyebrow', 'headline', 'subhead', 'date', 'time', 'offer', 'background'],
  preferBg: 'grid',
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    // Barcode: deterministic bar widths from the headline so it never changes between renders.
    const seed = [...String(c.headline ?? 'ticket')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const bars = Array.from({ length: 34 }, (_, i) => 1 + ((seed >> (i % 24)) + i * 7) % 3);
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--gap)}
.ticket{--tk:var(--block);--ink:var(--block-ink);position:relative;width:100%;max-width:calc(var(--u)*90);display:flex;flex-direction:column;filter:drop-shadow(0 calc(var(--u)*1.4) calc(var(--u)*3) rgba(0,0,0,.3));rotate:-2deg}
.o-landscape .ticket{flex-direction:row;max-width:calc(var(--u)*150);rotate:-1.5deg}
.part{background:var(--tk);color:var(--ink);padding:calc(var(--u)*5.5)}
.main{display:flex;flex-direction:column;gap:calc(var(--u)*2.4);border-radius:calc(var(--u)*3) calc(var(--u)*3) 0 0;
  -webkit-mask:radial-gradient(circle calc(var(--u)*3) at 0 100%,#0000 98%,#000) left/51% 100% no-repeat,radial-gradient(circle calc(var(--u)*3) at 100% 100%,#0000 98%,#000) right/51% 100% no-repeat}
.o-landscape .main{flex:1;border-radius:calc(var(--u)*3) 0 0 calc(var(--u)*3);
  -webkit-mask:radial-gradient(circle calc(var(--u)*3) at 100% 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle calc(var(--u)*3) at 100% 100%,#0000 98%,#000) bottom/100% 51% no-repeat}
.stub{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*3);border-radius:0 0 calc(var(--u)*3) calc(var(--u)*3);border-top:calc(var(--u)*.4) dashed color-mix(in srgb,var(--ink) 45%,transparent);
  -webkit-mask:radial-gradient(circle calc(var(--u)*3) at 0 0,#0000 98%,#000) left/51% 100% no-repeat,radial-gradient(circle calc(var(--u)*3) at 100% 0,#0000 98%,#000) right/51% 100% no-repeat}
.o-landscape .stub{flex-direction:column;justify-content:center;width:calc(var(--u)*30);border-radius:0 calc(var(--u)*3) calc(var(--u)*3) 0;border-top:0;border-left:calc(var(--u)*.4) dashed color-mix(in srgb,var(--ink) 45%,transparent);
  -webkit-mask:radial-gradient(circle calc(var(--u)*3) at 0 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle calc(var(--u)*3) at 0 100%,#0000 98%,#000) bottom/100% 51% no-repeat}
.eyebrow{color:inherit;opacity:.75}
.hbox{height:calc(var(--u)*22);align-items:center}
.headline{width:100%;color:inherit}
.headline .hl{color:inherit;text-decoration:underline;text-decoration-thickness:.06em;text-underline-offset:.1em}
.meta{display:grid;grid-template-columns:repeat(3,auto);justify-content:start;gap:calc(var(--u)*1) calc(var(--u)*5);font-size:calc(var(--u)*3)}
.meta small{display:block;font-size:.7em;letter-spacing:.14em;text-transform:uppercase;opacity:.65;font-weight:700}
.meta b{font-weight:700}
.admit{min-width:0;font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*5.5);line-height:.95;text-transform:uppercase}
.o-landscape .admit{text-align:center}
.code{flex:none;display:flex;gap:calc(var(--u)*.35);height:calc(var(--u)*9);align-items:stretch}
.code i{display:block;background:currentColor}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="ticket" data-anim-panel>
      <div class="part main">
        ${p.eyebrow || `<div class="eyebrow">${esc(ctx.brand.name)} presents</div>`}
        <div class="fitbox hbox">${p.headline('data-min="3" data-max="9"')}</div>
        <div class="meta">
          ${c.date ? `<span><small>Date</small><b>${esc(c.date)}</b></span>` : ''}
          ${c.time ? `<span><small>Time</small><b>${esc(c.time)}</b></span>` : ''}
          ${c.subhead ? `<span><small>Where</small><b>${rich(c.subhead)}</b></span>` : ''}
        </div>
      </div>
      <div class="part stub">
        <div class="admit">${rich(c.offer ?? 'Admit one')}</div>
        <div class="code">${bars.map((w) => `<i style="width:calc(var(--u)*${(w * 0.35).toFixed(2)})"></i>`).join('')}</div>
      </div>
    </div>
    ${p.logo}
  </div>
</div>`;
    return { css, body };
  },
};
