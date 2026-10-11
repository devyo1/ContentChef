import { parts, rich, rootClass } from './base.js';

// Social-native "highlighted caption" look: text set on solid marker boxes, slightly tilted.
export default {
  id: 'marker',
  name: 'Highlighter',
  description: 'TikTok / Reels caption style: words sit on solid highlight boxes with a slight tilt. Great over photos and video.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const c = ctx.content;
    const css = `
.frame{position:absolute;inset:0;padding:calc(var(--pad-top) + var(--u)*9) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;justify-content:center;gap:calc(var(--gap)*1.4)}
.a-center .frame{align-items:center;text-align:center}
.fitbox{flex:0 1 auto;height:56%;width:100%;align-items:center}
.a-center .fitbox{justify-content:center}
.headline{width:100%;line-height:1.34;rotate:-2.5deg;text-wrap:balance}
.mk{background:var(--fg);color:var(--bg);padding:.04em .22em .08em;-webkit-box-decoration-break:clone;box-decoration-break:clone;border-radius:.08em}
.mk .hl{background:var(--accent);color:var(--cta-text);padding:.04em .22em .08em;margin:0 -.22em;-webkit-box-decoration-break:clone;box-decoration-break:clone;border-radius:.08em}
/* When motion splits the headline into words/letters, each piece carries its own highlight box,
   so the boxes appear with their text instead of showing up empty first. */
.mk.split{background:none;padding:0}
.mk.split .ch,.mk.split .wd:not(.clip),.mk.split .wd.clip .wi{background:var(--fg);color:var(--bg);padding:.04em 0 .08em}
.mk.split .ch{padding-right:1px;margin-right:-1px} /* overlap neighbours so letter boxes join without seams */
.mk.split .wd:not(.clip),.mk.split .wd.clip .wi{padding:.04em .22em .08em;margin-right:-.05em}
.mk.split .hl{background:none;padding:0;margin:0}
.mk.split .hl .ch,.mk.split .hl .wd:not(.clip),.mk.split .hl .wd.clip .wi{background:var(--accent);color:var(--cta-text)}
.tag{align-self:flex-start;rotate:-2.5deg}
.a-center .tag{align-self:center}
.tag .eyebrow{background:var(--accent);color:var(--cta-text);padding:.5em .9em;border-radius:.2em}
.subw{rotate:-2.5deg;max-width:85%}
.subw .sub{display:inline;font-weight:600;line-height:1.75;background:var(--bg);color:var(--fg);opacity:1;padding:.15em .45em;-webkit-box-decoration-break:clone;box-decoration-break:clone;border-radius:.15em}
.cta{rotate:-2.5deg}
.corner{position:absolute;top:var(--pad-top);left:var(--pad)}
.a-center .corner{left:0;right:0;display:flex;justify-content:center}
`;
    const body = `
<div class="${rootClass(ctx, c.align ? '' : 'a-center')}">
  ${p.bg}
  <div class="corner">${p.logo}</div>
  <div class="frame">
    ${p.eyebrow ? `<div class="tag">${p.eyebrow}</div>` : ''}
    <div class="fitbox"><h1 class="headline" data-fit data-min="3" data-max="11"><span class="mk">${rich(c.headline)}</span></h1></div>
    ${c.subhead ? `<div class="subw">${p.sub}</div>` : ''}
    ${p.cta}
  </div>
</div>`;
    return { css, body };
  },
};
