// Bulk mode: a spreadsheet-like table of ads. Paste from Excel / Google Sheets, import CSV, or type.
import { html, useState, Modal, toast } from './lib.js';

// Columns; `needs` = only shown when a selected template uses that field.
export const BULK_COLUMNS = [
  { key: 'headline', label: 'Headline', placeholder: 'Say it *big*.', wide: true },
  { key: 'eyebrow', label: 'Top line', placeholder: 'New in' },
  { key: 'subhead', label: 'Supporting line', placeholder: 'One line that sells it', wide: true, needs: 'subhead' },
  { key: 'body', label: 'Body text', placeholder: 'A useful paragraph…', wide: true, needs: 'body' },
  { key: 'points', label: 'List points', placeholder: 'One per line', wide: true, needs: 'points' },
  { key: 'stat', label: 'Big number', placeholder: '73%', needs: 'stat' },
  { key: 'cta', label: 'Button / link', placeholder: 'Shop now' },
  { key: 'offer', label: 'Offer', placeholder: '30% OFF', needs: 'offer' },
];
/** Fields edited per-row in bulk mode (hidden from the shared "for your templates" fields). */
export const BULK_FIELDS = ['offer', 'body', 'points', 'stat'];

const ALIASES = {
  headline: ['headline', 'headlines', 'title', 'heading', 'main', 'hook', 'quote'],
  eyebrow: ['top line', 'topline', 'eyebrow', 'kicker', 'label', 'tag', 'tagline'],
  subhead: ['supporting line', 'subhead', 'subheading', 'sub', 'subtitle'],
  body: ['body', 'body text', 'description', 'text', 'copy', 'paragraph'],
  points: ['points', 'list', 'list points', 'bullets', 'tips'],
  stat: ['stat', 'big number', 'number', 'figure'],
  cta: ['button', 'cta', 'call to action', 'button text', 'action'],
  offer: ['offer', 'deal', 'promo', 'discount'],
  attribution: ['attribution', 'source', 'author', 'name of reviewer'],
  id: ['id', 'ad name', 'name'],
};

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, newlines inside quotes). */
export function parseCSV(text, delim = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/**
 * Turn pasted / imported text into ad rows.
 * - Tab-separated (copied from a spreadsheet) or CSV: columns matched by header names when present,
 *   otherwise read as Headline, Supporting line, Button, Top line.
 * - Plain text: one headline per line.
 */
export function parseRows(text, { csv = false } = {}) {
  const t = text.replace(/^﻿/, '');
  const tabbed = /\t/.test(t);
  if (!tabbed && !csv) return t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((headline) => ({ headline }));
  const table = parseCSV(t, tabbed ? '\t' : ',');
  if (!table.length) return [];
  const head = table[0].map((h) => h.trim().toLowerCase());
  const mapped = head.map((h) => Object.keys(ALIASES).find((k) => ALIASES[k].includes(h)));
  const hasHeader = mapped.filter(Boolean).length >= 1 && mapped.includes('headline');
  const cols = hasHeader ? mapped : ['headline', 'subhead', 'cta', 'eyebrow'];
  return (hasHeader ? table.slice(1) : table).map((r) => {
    const row = {};
    cols.forEach((k, i) => { if (k && r[i]?.trim()) row[k] = r[i].trim(); });
    return row;
  }).filter((r) => r.headline || r.offer);
}

function PasteModal({ onClose, onRows }) {
  const [text, setText] = useState('');
  const rows = text.trim() ? parseRows(text) : [];
  return html`
    <${Modal} title="Paste your ads" onClose=${onClose} wide>
      <p class="muted">Copy cells from Excel or Google Sheets and paste them here, or type one headline per line.
        Columns can be in any order if the first row has headers like <b>Headline</b>, <b>Top line</b>, <b>Supporting line</b>, <b>Button</b>, <b>Offer</b>.</p>
      <textarea class="paste" rows="10" autofocus value=${text} onInput=${(e) => setText(e.target.value)}
        placeholder=${'Pumpkin spice, done right.\nSweater weather, sorted.\nYour new autumn ritual.'}></textarea>
      <div class="row between">
        <span class="muted">${rows.length ? `${rows.length} ads found` : 'Nothing found yet'}</span>
        <div class="row">
          <button class="btn" disabled=${!rows.length} onClick=${() => onRows(rows, 'replace')}>Replace table</button>
          <button class="btn primary" disabled=${!rows.length} onClick=${() => onRows(rows, 'append')}>Add ${rows.length || ''} ads</button>
        </div>
      </div>
    <//>`;
}

export function BulkTable({ rows, setRows, fields }) {
  const [paste, setPaste] = useState(false);
  const cols = BULK_COLUMNS.filter((c) => !c.needs || fields?.has(c.needs));
  const update = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const importCSV = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const parsed = parseRows(await f.text(), { csv: true });
    if (!parsed.length) return toast('No rows with a Headline column found in that file', 'err');
    setRows([...rows.filter((r) => r.headline || r.offer), ...parsed]);
    toast(`Imported ${parsed.length} ads`);
  };
  return html`
    <div class="bulk">
      <div class="bulk-actions">
        <button class="btn small" onClick=${() => setPaste(true)}>📋 Paste from spreadsheet</button>
        <label class="btn small">📄 Import CSV<input type="file" accept=".csv,.tsv,.txt" hidden onChange=${importCSV} /></label>
        <div class="grow"></div>
        ${rows.length > 0 && html`<button class="btn small ghost" onClick=${() => confirm('Remove all rows?') && setRows([])}>Clear</button>`}
      </div>
      <div class="bulk-table">
        <table>
          <thead><tr><th>#</th>${cols.map((c) => html`<th class=${c.wide ? 'wide' : ''}>${c.label}</th>`)}<th></th></tr></thead>
          <tbody>
            ${rows.map((r, i) => html`
              <tr key=${i}>
                <td class="n">${i + 1}</td>
                ${cols.map((c) => html`<td><textarea rows="1" value=${r[c.key] ?? ''} placeholder=${i === 0 ? c.placeholder : ''} onInput=${(e) => update(i, c.key, e.target.value)}></textarea></td>`)}
                <td><button class="icon-btn" title="Remove" onClick=${() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      <button class="btn small wide" onClick=${() => setRows([...rows, { headline: '' }])}>＋ Add a row</button>
      <p class="hint">Empty cells use the “Same for every ad” values below.</p>
      ${paste && html`<${PasteModal} onClose=${() => setPaste(false)} onRows=${(rs, how) => { setRows(how === 'replace' ? rs : [...rows.filter((r) => r.headline || r.offer), ...rs]); setPaste(false); toast(`Added ${rs.length} ads`); }} />`}
    </div>`;
}
