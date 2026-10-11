import { esc, parts, paragraphs, rich, rootClass } from './base.js';

const ICONS = {
  reply: 'M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z',
  repost: 'M17 2l4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3',
  like: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  share: 'M12 3v13 M7 8l5-5 5 5 M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
};
const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

// A social text post (X / Threads style) as an image: avatar, name, handle and the post text.
export default {
  id: 'textpost',
  name: 'Text Post',
  category: 'social',
  description: 'Looks like a post on X / Threads: avatar, name, handle and your text. Perfect for opinions, quotes, hot takes and short threads.',
  fields: ['headline', 'body', 'handle', 'background'],
  preferBg: 'gradient',
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const text = c.body ? `${c.headline ? `<p class="lead">${rich(c.headline)}</p>` : ''}${paragraphs(c.body)}` : `<p>${rich(c.headline ?? '')}</p>`;
    const avatar = ctx.logoUrl
      ? `<span class="av"><img src="${esc(ctx.logoUrl)}" alt=""></span>`
      : `<span class="av letter">${esc(ctx.brand.name.trim()[0] ?? '•')}</span>`;
    const when = c.date ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;align-items:center;justify-content:center}
.post{width:100%;max-width:calc(var(--u)*92);height:100%;display:flex;flex-direction:column;gap:calc(var(--u)*3);padding:calc(var(--u)*5.5);border-radius:calc(var(--u)*4.5);
  background:${ctx.lightBg ? '#FFFFFF' : 'color-mix(in srgb, var(--bg) 82%, #ffffff 9%)'};color:var(--fg);box-shadow:0 calc(var(--u)*2) calc(var(--u)*7) rgba(0,0,0,.22);border:1px solid color-mix(in srgb,var(--fg) 10%,transparent)}
.o-landscape .post{max-width:calc(var(--u)*125)}
.who{display:flex;align-items:center;gap:calc(var(--u)*2.4);flex:none}
.av{width:calc(var(--u)*10);height:calc(var(--u)*10);border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#fff;flex:none;border:1px solid color-mix(in srgb,var(--fg) 12%,transparent)}
.av img{width:72%;height:72%;object-fit:contain}
.av.letter{background:var(--accent);color:var(--cta-text);font-family:var(--font-display);font-weight:var(--display-weight);font-size:calc(var(--u)*5)}
.names{display:flex;flex-direction:column;min-width:0;font-family:var(--font-body)}
.name{display:flex;align-items:center;gap:.3em;font-weight:700;font-size:calc(var(--u)*3.6)}
.tick{width:1em;height:1em;color:var(--accent)}
.who-handle{opacity:.6;font-size:calc(var(--u)*3.1)}
.tbox{flex:1;align-items:flex-start}
.post-text{font-family:var(--font-body);line-height:1.42;width:100%;text-wrap:pretty}
.post-text p+p{margin-top:.7em}
.post-text .lead{font-weight:700}
.meta{opacity:.55;font-size:calc(var(--u)*2.8);font-family:var(--font-body);flex:none}
.acts{display:flex;justify-content:space-between;border-top:1px solid color-mix(in srgb,var(--fg) 12%,transparent);padding-top:calc(var(--u)*2.6);opacity:.55;flex:none}
.acts svg{width:calc(var(--u)*4.4);height:calc(var(--u)*4.4)}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="post" data-anim-panel data-shrinkwrap>
      <div class="who">${avatar}<div class="names"><span class="name">${esc(ctx.brand.name)}<svg class="tick" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5l2.6 2 3.3-.2.9 3.2 2.7 1.9-1.2 3.1 1.2 3.1-2.7 1.9-.9 3.2-3.3-.2-2.6 2-2.6-2-3.3.2-.9-3.2-2.7-1.9 1.2-3.1-1.2-3.1 2.7-1.9.9-3.2 3.3.2z"/><path d="M8 12.2l2.6 2.6L16.4 9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="who-handle">${p.handle}</span></div></div>
      <div class="fitbox tbox"><div class="post-text" data-fit data-min="2.4" data-max="${ctx.orient === 'portrait' ? 7.5 : 5.6}">${text}</div></div>
      <div class="meta">${esc(c.time ?? '9:41 AM')} · ${esc(when)}</div>
      <div class="acts">${icon(ICONS.reply)}${icon(ICONS.repost)}${icon(ICONS.like)}${icon(ICONS.share)}</div>
    </div>
  </div>
</div>`;
    return { css, body };
  },
};
