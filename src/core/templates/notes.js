import { esc, listItems, paragraphs, pointHtml, rich, rootClass } from './base.js';

const ic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

// Looks like a note in the iPhone Notes app: title, text and a checklist.
export default {
  id: 'notes',
  name: 'Notes',
  category: 'social',
  description: 'Looks like a note in the iPhone Notes app: bold title, body text and a checklist. Feels personal and unpolished in a good way: lessons, routines, to-dos.',
  fields: ['headline', 'body', 'points', 'background'],
  render(ctx) {
    const c = ctx.content;
    const items = listItems(c.points);
    const done = Number(c.checked ?? 0);
    const date = c.date ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const check = items.length
      ? `<ul class="todo">${items.map((it, i) => `<li class="${i < done ? 'on' : ''}"><span class="box">${i < done ? '✓' : ''}</span><span>${pointHtml(it)}</span></li>`).join('')}</ul>`
      : '';
    const css = `
.paper{position:absolute;inset:0;background:var(--bg)}
.frame{position:absolute;inset:0;padding:calc(var(--safe-top) + var(--u)*4) calc(var(--pad)*.8) var(--pad-bottom);display:flex;flex-direction:column;gap:calc(var(--u)*2.4);font-family:var(--font-body);color:var(--fg)}
.bar{display:flex;justify-content:space-between;align-items:center;color:var(--accent);font-size:calc(var(--u)*3.8);font-weight:500;flex:none}
.bar .back{display:flex;align-items:center;gap:.15em}
.bar svg{width:1.15em;height:1.15em}
.bar .tools{display:flex;gap:.9em}
.date{text-align:center;opacity:.45;font-size:calc(var(--u)*2.6);flex:none}
.nbox{flex:1;align-items:flex-start}
.note-text{width:100%;line-height:1.42}
.note-text h1{font-size:1.55em;font-weight:800;letter-spacing:-.01em;margin:0 0 .45em;line-height:1.15}
.note-text p{margin:0 0 .65em}
.todo{list-style:none;margin:.2em 0 0;padding:0;display:flex;flex-direction:column;gap:.55em}
.todo li{display:flex;gap:.6em;align-items:baseline}
.todo .box{width:1.05em;height:1.05em;border-radius:50%;border:.09em solid color-mix(in srgb,var(--fg) 35%,transparent);flex:none;display:grid;place-items:center;font-size:.8em;transform:translateY(.12em)}
.todo li.on .box{background:var(--accent);border-color:var(--accent);color:var(--cta-text)}
.todo li.on>span:last-child{opacity:.45;text-decoration:line-through}
`;
    const body = `
<div class="${rootClass(ctx)}">
  <div class="paper"></div>
  <div class="frame">
    <div class="bar" data-anim-item><span class="back">${ic('M15 18l-6-6 6-6')}Notes</span><span class="tools">${ic('M12 3v13 M7 8l5-5 5 5 M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5')}${ic('M12 12h.01 M19 12h.01 M5 12h.01')}</span></div>
    <div class="date" data-anim-item>${esc(date)}</div>
    <div class="fitbox nbox"><div class="note-text body" data-fit data-min="2.2" data-max="5">
      ${c.headline ? `<h1>${rich(c.headline)}</h1>` : ''}${c.body ? paragraphs(c.body) : ''}${check}
    </div></div>
  </div>
</div>`;
    return { css, body };
  },
};
