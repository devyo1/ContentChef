import { esc, listItems, parts, rich, rootClass } from './base.js';

/**
 * Chat lines from list points. "me: …" / "> …" = sent by the brand (right, coloured);
 * "them: …" / "< …" = received (left, grey). Unprefixed lines alternate, starting with received.
 */
export function chatLines(points) {
  let flip = false;
  return listItems(points).map((line) => {
    const m = /^(me|us|you|them|they|>|<)\s*[:>]?\s*(.+)$/i.exec(line);
    if (m) {
      const out = /^(me|us|>)$/i.test(m[1]);
      flip = !out;
      return { out, text: m[2] };
    }
    const out = flip;
    flip = !flip;
    return { out, text: line };
  });
}

// An iMessage-style conversation; the headline is the brand's final reply (the punchline).
export default {
  id: 'chat',
  name: 'Chat',
  category: 'social',
  description: 'A text-message conversation (iMessage style). List points are the messages ("me:" for yours, "them:" for theirs); the headline is your final reply. Great for FAQs, objections and funny takes.',
  fields: ['headline', 'points', 'handle', 'background'],
  preferBg: 'gradient',
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    let lines = chatLines(c.points);
    if (!lines.length) lines = [{ out: false, text: 'Is it really that easy?' }, { out: true, text: 'Yep. Takes about two minutes.' }, { out: false, text: 'Okay I need this 😅' }];
    const final = c.headline ? `<div class="msg out final">${rich(c.headline)}</div><div class="delivered">Delivered</div>` : '';
    const dark = !ctx.lightBg;
    const avatar = ctx.logoUrl ? `<span class="av"><img src="${esc(ctx.logoUrl)}" alt=""></span>` : `<span class="av letter">${esc(ctx.brand.name.trim()[0] ?? '•')}</span>`;
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;align-items:center;justify-content:center}
.phone{width:100%;max-width:calc(var(--u)*90);height:100%;display:flex;flex-direction:column;border-radius:calc(var(--u)*5);overflow:hidden;
  background:${dark ? '#000' : '#FFFFFF'};color:${dark ? '#fff' : '#111'};box-shadow:0 calc(var(--u)*2) calc(var(--u)*7) rgba(0,0,0,.28);font-family:-apple-system,"SF Pro Text","Inter",var(--font-body),sans-serif}
.o-landscape .phone{max-width:calc(var(--u)*110)}
.head{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.8);padding:calc(var(--u)*3) 0 calc(var(--u)*2.4);background:${dark ? 'rgba(30,30,32,.9)' : 'rgba(246,246,248,.95)'};border-bottom:1px solid ${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'};flex:none}
.av{width:calc(var(--u)*9);height:calc(var(--u)*9);border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#fff}
.av img{width:74%;height:74%;object-fit:contain}
.av.letter{background:linear-gradient(#a5a9b4,#868a96);color:#fff;font-weight:600;font-size:calc(var(--u)*4.2)}
.cname{font-size:calc(var(--u)*2.6);font-weight:500;opacity:.85}
.tbox{flex:1;min-height:0;padding:calc(var(--u)*3) calc(var(--u)*3.2);align-items:flex-end}
.thread{width:100%;display:flex;flex-direction:column;gap:.35em;font-size:calc(var(--u)*3.6);line-height:1.28}
.msg{max-width:76%;padding:.5em .8em;border-radius:1.1em;position:relative;text-wrap:pretty}
.msg.in{align-self:flex-start;background:${dark ? '#26262A' : '#E9E9EB'};color:${dark ? '#fff' : '#111'};border-bottom-left-radius:.3em}
.msg.out{align-self:flex-end;background:var(--accent);color:var(--cta-text);border-bottom-right-radius:.3em}
.msg.final{font-weight:700;font-size:1.25em;margin-top:.25em}
.msg .hl{color:inherit;text-decoration:underline;text-decoration-thickness:.08em;text-underline-offset:.12em}
.msg.in + .msg.out,.msg.out + .msg.in{margin-top:.35em}
.delivered{align-self:flex-end;font-size:.62em;opacity:.5;margin-top:-.1em}
.foot2{display:flex;justify-content:center;padding:0 0 calc(var(--u)*2.4);font-size:calc(var(--u)*2.4);opacity:.45;flex:none}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="phone" data-anim-panel>
      <div class="head">${avatar}<span class="cname">${esc(ctx.brand.name)} ›</span></div>
      <div class="fitbox tbox"><div class="thread post-text" data-fit data-min="2.2" data-max="${ctx.orient === 'portrait' ? 6 : 4.6}">
        ${lines.map((l) => `<div class="msg ${l.out ? 'out' : 'in'}">${rich(l.text)}</div>`).join('')}${final}
      </div></div>
      <div class="foot2">${p.handle}</div>
    </div>
  </div>
</div>`;
    return { css, body };
  },
};
