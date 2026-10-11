import { esc, parts, paragraphs, rich, rootClass } from './base.js';

// A newspaper front page: masthead, dateline, a big headline, a deck, and body text in columns.
export default {
  id: 'newspaper',
  name: 'Newspaper',
  category: 'content',
  description: 'A newspaper front page: your brand as the masthead, a big "breaking" headline, a deck line and body text in columns (with your photo inset if you pick one). Announcements and news with a wink.',
  fields: ['eyebrow', 'headline', 'subhead', 'body', 'date', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const when = c.date ?? new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const text = c.body ? paragraphs(c.body) : '<p>Add body text in the Words step to fill the columns with the story behind the headline.</p>';
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--u)*2)}
.mast{text-align:center;border-bottom:calc(var(--u)*.6) double currentColor;padding-bottom:calc(var(--u)*1.2)}
.mbox{height:calc(var(--u)*11);justify-content:center;align-items:center}
.mname{width:100%;font-family:var(--font-display);font-weight:var(--display-weight);text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;line-height:1;text-align:center}
.dateline{display:flex;justify-content:space-between;gap:var(--gap);font-size:calc(var(--u)*2.1);letter-spacing:.12em;text-transform:uppercase;font-weight:700;border-bottom:calc(var(--u)*.2) solid currentColor;padding:calc(var(--u)*.6) 0 calc(var(--u)*1.2)}
.kicker{display:inline-block;align-self:flex-start;background:var(--accent);color:var(--cta-text);font-weight:800;letter-spacing:.16em;text-transform:uppercase;font-size:calc(var(--u)*2.3);padding:.4em .8em}
.hbox{flex:0 0 auto;height:calc(var(--u)*26);align-items:flex-end}
.o-portrait .hbox{height:calc(var(--u)*34)}
.headline{width:100%}
.deck{font-family:var(--font-display);font-size:calc(var(--u)*3.6);line-height:1.25;font-style:italic;opacity:.85;border-bottom:calc(var(--u)*.2) solid color-mix(in srgb,currentColor 35%,transparent);padding-bottom:calc(var(--u)*1.8)}
.story{flex:1;min-height:0;display:flex;gap:calc(var(--u)*3)}
.pic{flex:0 0 42%;position:relative;overflow:hidden;filter:grayscale(.15) contrast(1.05)}
.bbox{flex:1;min-height:0;align-items:flex-start}
.body{columns:2;column-gap:calc(var(--u)*3);column-rule:1px solid color-mix(in srgb,currentColor 25%,transparent);text-align:justify;hyphens:auto;line-height:1.4}
.has-bg .body{columns:1}
.o-landscape .body{columns:3}
.o-landscape.has-bg .body{columns:2}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.genbg}
  <div class="frame">
    <div class="mast" data-anim-item><div class="fitbox mbox"><div class="mname" data-fit data-min="4" data-max="12">The ${esc(ctx.brand.name)} Times</div></div></div>
    <div class="dateline" data-anim-item><span>${esc(when)}</span><span>${p.handle}</span></div>
    <span class="kicker" data-anim-item>${rich(c.eyebrow ?? 'Breaking')}</span>
    <div class="fitbox hbox">${p.headline('data-min="3.5" data-max="13"')}</div>
    ${c.subhead ? `<div class="deck" data-anim-item>${rich(c.subhead)}</div>` : ''}
    <div class="story">
      ${p.media ? `<div class="pic" data-anim-item>${p.media}</div>` : ''}
      <div class="fitbox bbox"><div class="body" data-fit data-min="1.8" data-max="3.3">${text}</div></div>
    </div>
  </div>
</div>`;
    return { css, body };
  },
};
