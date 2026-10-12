// Live "what is the AI doing" indicator for the top bar: shows when Claude / ChatGPT / any MCP
// client is working, and a feed of recent actions (from data/activity.json via /api/activity).
import { html, useState, useEffect, api } from './lib.js';
import { Icon } from './icons.js';

const LABELS = {
  get_editor: 'Looking at your design', update_editor: 'Building in your editor', preview_ad: 'Checking a preview',
  export_editor: 'Exporting your design', generate_ads: 'Rendering files', generate_bulk: 'Rendering a bulk campaign',
  render_catalog: 'Rendering a saved campaign', list_brands: 'Reading your brands', get_brand: 'Reading a brand',
  save_brand: 'Saving brand changes', generate_palettes: 'Generating colours', add_library_palette: 'Adding a colourway',
  build_captions: 'Writing captions', list_templates: 'Browsing templates', save_template: 'Designing a template',
  template_guide: 'Reading the template guide', get_template: 'Reading a template', list_exports: 'Checking exports',
  view_export: 'Looking at an export', add_brand_asset: 'Adding media', save_campaign: 'Saving a campaign',
  add_catalog_item: 'Saving to a campaign', list_fonts: 'Browsing fonts', list_styles: 'Checking styles', list_formats: 'Checking sizes',
};
const label = (t) => LABELS[t] ?? t.replace(/_/g, ' ');
const ago = (ms) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

export function AiActivity() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const load = () => api('GET', '/api/activity').then(setItems).catch(() => {});
  useEffect(() => {
    load();
    addEventListener('chef:activity', load);
    const t = setInterval(() => tick((n) => n + 1), 5000); // keep "x s ago" and the live state fresh
    return () => { removeEventListener('chef:activity', load); clearInterval(t); };
  }, []);
  // "Live" = something started in the last 2 minutes and hasn't finished.
  const live = items.filter((e) => e.status === 'running' && Date.now() - e.at < 120000);
  const latest = live[live.length - 1] ?? items[items.length - 1];
  const recent = latest && Date.now() - (latest.doneAt ?? latest.at) < 15000;
  if (!items.length) return null;
  return html`
    <div class="ai-activity">
      <button class="ai-pill ${live.length ? 'live' : recent ? 'recent' : 'idle'}" onClick=${() => setOpen(!open)} title="AI activity: what connected AIs have been doing">
        <span class="dot"></span>
        ${live.length
          ? html`<span class="ellipsis"><b>${latest.who}</b> · ${label(latest.tool)}…</span>`
          : recent && html`<span class="ellipsis"><b>${latest.who}</b> · ${label(latest.tool)}</span>`}
      </button>
      ${open && html`
        <div class="ai-feed" onClick=${(e) => e.stopPropagation()}>
          <div class="row between"><b>AI activity</b><button class="icon-btn" onClick=${() => setOpen(false)}><${Icon} name="x" size=${14} /></button></div>
          <p class="muted small">Everything Claude, ChatGPT or another connected AI does with Content Chef shows up here. Changes to your design appear live in the builder.</p>
          <div class="ai-list">
            ${[...items].reverse().slice(0, 25).map((e) => html`
              <div class="ai-item ${e.status}" key=${e.id}>
                <span class="st">${e.status === 'running' ? html`<span class="spin"></span>` : e.status === 'error' ? '⚠' : '✓'}</span>
                <span class="grow">
                  <span><b>${e.who}</b> · ${label(e.tool)}</span>
                  ${e.detail && html`<small class="muted ellipsis">${e.detail}</small>`}
                  ${e.error && html`<small class="err-text">${e.error}</small>`}
                </span>
                <small class="faint">${ago(e.at)}</small>
              </div>`)}
          </div>
        </div>`}
    </div>`;
}
