import { esc, parts, rich, rootClass } from './base.js';

// iOS lock screen: big clock + a glass push notification carrying the message.
export default {
  id: 'lockscreen',
  name: 'iPhone Notification',
  description: 'Looks like an iPhone lock screen: big clock, and your message as a glass push notification from your brand. Thumb-stopping for Stories/Reels.',
  fields: ['headline', 'subhead', 'cta', 'time', 'date', 'background'],
  preferBg: 'aurora',
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const time = c.time ?? '9:41';
    const date = c.date ?? new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const icon = ctx.logoUrl
      ? `<div class="icon"><img src="${esc(ctx.logoUrl)}" alt=""></div>`
      : `<div class="icon letter">${esc(ctx.brand.name.trim()[0] ?? '•')}</div>`;
    const css = `
.ad{--ls:1}
.o-portrait{--ls:1.3}
.frame{position:absolute;inset:0;padding:calc(var(--pad-top) + var(--u)*2) calc(var(--pad)*.75) var(--pad-bottom);display:flex;flex-direction:column;align-items:center;gap:var(--gap)}
.clock{text-align:center;display:flex;flex-direction:column;align-items:center;color:var(--fg)}
.date{font-family:var(--font-body);font-weight:600;font-size:calc(var(--u)*4*var(--ls));opacity:.9;letter-spacing:.01em}
.time{font-family:var(--font-body);font-weight:700;font-size:calc(var(--u)*25);line-height:1;letter-spacing:-.035em;font-variant-numeric:tabular-nums;margin-top:calc(var(--u)*.5)}
.spacer{flex:1}
.stack{position:relative;width:100%}
.notif{padding:calc(var(--u)*3.4*var(--ls)) calc(var(--u)*3.8*var(--ls));border-radius:calc(var(--u)*5*var(--ls));display:flex;gap:calc(var(--u)*3*var(--ls));align-items:flex-start;color:var(--fg)}
/* Real iOS notifications are dense frosted cards: tint with the palette background so text stays readable on any photo or glow. */
.notif.glass,.action.glass,.ghost.glass{background:color-mix(in srgb,var(--bg) 58%,transparent)}
.light .notif.glass,.light .action.glass,.light .ghost.glass{background:color-mix(in srgb,var(--bg) 70%,transparent)}
.ghost{position:absolute;left:5%;right:5%;bottom:calc(var(--u)*-2.4);height:60%;border-radius:calc(var(--u)*4.5);opacity:.75;z-index:-1}
.ghost.g2{left:10%;right:10%;bottom:calc(var(--u)*-4.6);opacity:.5;z-index:-2}
.icon{flex:none;width:calc(var(--u)*9.5*var(--ls));height:calc(var(--u)*9.5*var(--ls));border-radius:calc(var(--u)*2.3*var(--ls));background:var(--accent);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 calc(var(--u)*.4) calc(var(--u)*1.2) rgba(0,0,0,.2)}
.icon:not(.letter){background:#fff}
.icon img{width:78%;height:78%;object-fit:contain}
.icon.letter{color:var(--cta-text);font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*5.4*var(--ls))}
.txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(var(--u)*.6)}
.meta{display:flex;justify-content:space-between;gap:1em;font-size:calc(var(--u)*3.1*var(--ls));font-weight:600;opacity:.75}
.notif .headline{font-family:var(--font-body);font-weight:700;letter-spacing:-.01em;text-transform:none;line-height:1.22;font-size:calc(var(--u)*4.3*var(--ls));text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.notif .headline .hl{color:inherit}
.notif .sub{font-size:calc(var(--u)*3.8*var(--ls));line-height:1.3;opacity:.9;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;max-width:none}
.action{margin-top:calc(var(--u)*5.5);align-self:center;padding:calc(var(--u)*2.3*var(--ls)) calc(var(--u)*5*var(--ls));border-radius:999px;font-weight:700;font-size:calc(var(--u)*3.5*var(--ls));display:flex;gap:.6em;align-items:center;color:var(--fg)}
.o-landscape .frame{flex-direction:row;align-items:center;padding:var(--pad);gap:calc(var(--pad)*.8)}
.o-landscape .clock{flex:1}
.o-landscape .side{flex:1.15;display:flex;flex-direction:column;justify-content:center}
.o-landscape .spacer{display:none}
.o-square .time{font-size:calc(var(--u)*19)}
`;
    const notif = `
      <div class="stack" data-anim-panel>
        <div class="notif glass">
          ${icon}
          <div class="txt">
            <div class="meta"><span>${esc(ctx.brand.name)}</span><span>${esc(c.when ?? 'now')}</span></div>
            <h1 class="headline">${rich(c.headline)}</h1>
            ${c.subhead ? `<p class="sub">${rich(c.subhead)}</p>` : ''}
          </div>
        </div>
        <div class="ghost glass"></div><div class="ghost glass g2"></div>
      </div>
      ${c.cta ? `<div class="action glass" data-anim-item>${esc(c.cta)} <span>→</span></div>` : ''}`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="clock" data-anim-item><div class="date">${esc(date)}</div><div class="time">${esc(time)}</div></div>
    <div class="spacer"></div>
    ${ctx.orient === 'landscape' ? `<div class="side">${notif}</div>` : notif}
  </div>
</div>`;
    return { css, body };
  },
};
