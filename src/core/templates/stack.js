import { parts, rich, rootClass } from './base.js';

/** Break a headline into stacked lines: explicit "|" / newlines win, otherwise group words. */
export function stackLines(headline) {
  const text = String(headline ?? '').trim();
  if (/\||\\n|\n/.test(text)) return text.split(/\s*(?:\||\\n|\n)\s*/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return words;
  const lines = [];
  for (let i = 0; i < words.length; i += 2) lines.push(words.slice(i, i + 2).join(' '));
  return lines;
}

/** Keep *accent* markup valid per line when a highlight spans a line break. */
function balanceMarkup(lines) {
  let open = false;
  return lines.map((l) => {
    let line = open ? `*${l}` : l;
    if ((line.match(/\*/g) ?? []).length % 2) { line += '*'; open = !open; }
    return line;
  });
}

// Kinetic-poster typography: each line blown up to the full width, alternating solid / outline.
export default {
  id: 'stack',
  name: 'Big Stack',
  description: 'Huge stacked words, each line stretched to full width, alternating solid and outlined. Use "|" to choose the line breaks. Loud and graphic.',
  fields: ['eyebrow', 'headline', 'subhead', 'cta', 'footnote', 'background'],
  render(ctx) {
    const p = parts(ctx);
    const outline = ctx.content.outline !== false;
    const lines = balanceMarkup(stackLines(ctx.content.headline))
      .map((l, i) => `<span class="ln${outline && i % 2 ? ' out' : ''}">${rich(l)}</span>`).join('');
    const css = `
.frame{position:absolute;inset:0;padding:var(--pad-top) var(--pad) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--gap)*1.2)}
.top{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.lines{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:calc(var(--u)*.6)}
.ln{display:block;width:max-content;max-width:none;white-space:nowrap;font-family:var(--font-display);font-weight:var(--display-weight);line-height:.9;letter-spacing:var(--tracking);text-transform:var(--headline-case)}
.ln.out{color:transparent;-webkit-text-stroke:calc(var(--u)*.32) var(--fg)}
.ln.out .hl{color:var(--accent);-webkit-text-stroke:0}
.a-center .ln{margin-inline:auto}
.a-center .top{justify-content:center;flex-direction:column}
.bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:var(--gap)}
.bottom .sub{flex:1 1 0;min-width:0}
.bottom .cta{flex:none}
.o-portrait .bottom{flex-direction:column;align-items:flex-start}
.a-center .bottom{flex-direction:column;align-items:center}
`;
    const body = `
<div class="${rootClass(ctx)}">
  ${p.bg}
  <div class="frame">
    <div class="top">${p.logo}${p.eyebrow}</div>
    <div class="lines" data-fit-lines data-max="34">${lines}</div>
    <div class="bottom">${p.sub}${p.cta}</div>
    ${p.foot}
  </div>
</div>`;
    return { css, body };
  },
};
