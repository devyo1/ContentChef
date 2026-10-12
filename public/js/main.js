import { html, render, useState, useEffect, useRef, api, store, AppCtx, Toasts, Modal, Field, toast, CLIENT_ID, brandAssetUrl, inkOn } from './lib.js';
import { CreatePage } from './create.js';
import { BrandsPage } from './brand-editor.js';
import { SavedPage } from './saved.js';
import { DashboardPage } from './dashboard.js';
import { VideoPage } from './video.js';
import { AiActivity } from './activity.js';
import { SettingsPage } from './settings-page.js';
import { ChatWidget } from './chat-ui.js';
import { Icon } from './icons.js';
import { assistantName, assistantProvider } from './assistant.js';
import { NewBrandModal } from './new-brand.js';

const NAV = [
  ['home', 'grid', 'Dashboard'],
  ['create', 'sparkles', 'Create'],
  ['video', 'film', 'Video'],
  ['brands', 'palette', 'Brand kit'],
  ['saved', 'folder', 'Saved & exports'],
  ['settings', 'settings', 'Settings'],
];

function BrandMark({ brand }) {
  const p = brand.palettes[Object.keys(brand.palettes)[0]];
  return html`<span class="bmark" style=${{ background: brand.logo ? '#fff' : p.accent, color: inkOn(p.accent) }}>
    ${brand.logo ? html`<img src=${brandAssetUrl(brand.id, brand.logo)} alt="" />` : brand.name.trim()[0]}</span>`;
}

function BrandSwitch({ meta, brand, onPick, onNew }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const t = setTimeout(() => addEventListener('click', close, { once: true }));
    return () => { clearTimeout(t); removeEventListener('click', close); };
  }, [open]);
  return html`
    <div class="brand-switch">
      <button class="brand-pill" onClick=${() => setOpen(!open)} title="Switch brand">
        <${BrandMark} brand=${brand} />
        <b class="ellipsis">${brand.name}</b>
        <span class="faint"><${Icon} name="chevron" size=${14} /></span>
      </button>
      ${open && html`
        <div class="menu">
          ${meta.brands.map((b) => html`<button class=${b.id === brand.id ? 'on' : ''} onClick=${() => onPick(b.id)}><${BrandMark} brand=${b} /> ${b.name}</button>`)}
          <hr />
          <button onClick=${onNew}><${Icon} name="plus" /> New brand…</button>
        </div>`}
    </div>`;
}

function useTheme(theme) {
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = t;
      window.desktop?.setDark(t === 'dark'); // match the native window buttons in the desktop app
    };
    apply();
    try { localStorage.setItem('adgen.theme', theme); } catch { /* private mode */ }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function App() {
  const [meta, setMeta] = useState(null);
  const [settings, setSettings] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTabState] = useState(store.get('tab', 'create') === 'carousel' ? 'create' : store.get('tab', 'create'));
  const [brandId, setBrandId] = useState(store.get('brand', null));
  const [newBrand, setNewBrand] = useState(false);
  const [pending, setPending] = useState(null); // design handed from Saved → Create
  const brandRef = useRef(brandId);
  const headerRef = useRef(null);
  brandRef.current = brandId;

  // Measure the whole header, including desktop controls and changing AI activity labels.
  // Give navigation its own row when it cannot fit, instead of clipping the last tab.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const nav = header.querySelector('.tabs');
    const width = (el) => el.getBoundingClientRect().width;
    const px = (value) => Number.parseFloat(value) || 0;
    const measure = () => {
      const h = getComputedStyle(header), n = getComputedStyle(nav);
      const buttons = [...nav.children];
      const navWidth = buttons.reduce((sum, el) => sum + width(el), 0) + px(n.columnGap) * (buttons.length - 1)
        + px(n.paddingLeft) + px(n.paddingRight) + px(n.borderLeftWidth) + px(n.borderRightWidth);
      const others = [...header.children].filter((el) => el !== nav);
      const needed = navWidth + others.reduce((sum, el) => sum + width(el), 0) + px(h.columnGap) * others.length;
      header.classList.toggle('nav-wrapped', needed > header.clientWidth - px(h.paddingLeft) - px(h.paddingRight));
    };
    const observer = new ResizeObserver(measure);
    [header, ...header.children, ...nav.children].forEach((el) => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [!!meta?.brands.length, !!settings]);

  const reload = async () => {
    try { const m = await api('GET', '/api/meta'); setMeta(m); return m; } catch (e) { setError(e.message); return null; }
  };
  const pickBrand = (id) => { setBrandId(id); store.set('brand', id); };
  const setTab = (t) => { setTabState(t); store.set('tab', t); };
  const saveSettings = async (patch) => { const s = await api('PUT', '/api/settings', patch); setSettings(s); return s; };
  const refreshSettings = async () => { const s = await api('GET', '/api/settings?fresh=1'); setSettings(s); return s; };

  useEffect(() => {
    (async () => {
      const [m, s, ws] = await Promise.all([reload(), api('GET', '/api/settings'), api('GET', '/api/workspace').catch(() => ({}))]);
      setSettings(s);
      if (ws?.design) {
        setWorkspace(ws);
        // While editing a brand kit, preserve that selection instead of reopening an older ad.
        const hasSelectedBrand = m?.brands.some((b) => b.id === brandRef.current);
        if ((tab === 'create' || !hasSelectedBrand) && m?.brands.some((b) => b.id === ws.brand)) pickBrand(ws.brand);
      }
    })();
    // Live updates: Claude (chat or MCP) editing the workspace, brands changing on disk.
    const es = new EventSource('/api/events');
    es.onmessage = async (ev) => {
      const e = JSON.parse(ev.data);
      if (e.type === 'meta') reload();
      if (e.type === 'activity') dispatchEvent(new Event('chef:activity'));
      if (e.type === 'workspace' && e.source !== CLIENT_ID) {
        const ws = await api('GET', '/api/workspace');
        setWorkspace(ws);
        if (ws.brand && ws.brand !== brandRef.current) pickBrand(ws.brand);
        if (['claude', 'assistant'].includes(ws.source)) {
          // An AI changed the design: bring the builder up so you can watch, in the view it asked for.
          setTab('create');
          if (ws.view) { store.set('stage.view', ws.view); dispatchEvent(new CustomEvent('chef:view', { detail: ws.view })); }
          toast(`✦ ${ws.actor ?? 'Assistant'} updated your design`);
        }
      }
    };
    const onFocus = () => reload();
    addEventListener('focus', onFocus);
    return () => { es.close(); removeEventListener('focus', onFocus); };
  }, []);

  useTheme(settings?.theme ?? 'system');

  if (error) return html`<div class="fatal">Couldn't load: ${error}</div>`;
  if (!meta || !settings) return html`<div class="loading-screen">Loading…</div>`;
  if (!meta.brands.length) {
    return html`<div class="loading-screen"><div style=${{ textAlign: 'center', display: 'grid', gap: '14px' }}><h2>Create your first brand</h2>
      <button class="btn primary" onClick=${() => setNewBrand(true)}>＋ New brand</button></div>
      ${newBrand && html`<${NewBrandModal} settings=${settings} onClose=${() => setNewBrand(false)} onCreated=${async (id) => { await reload(); pickBrand(id); setNewBrand(false); setTab('brands'); }} />`}</div>`;
  }
  const brand = meta.brands.find((b) => b.id === brandId) ?? meta.brands[0];
  const collapsed = !!settings.sidebarCollapsed;
  const ctx = { meta, brand, reload, setTab, pickBrand, pending, setPending, settings, saveSettings, refreshSettings, workspace, rememberWorkspace: setWorkspace, openNewBrand: () => setNewBrand(true) };

  const dark = document.documentElement.dataset.theme === 'dark';
  return html`
    <${AppCtx.Provider} value=${ctx}>
      <div class="shell">
        <header class="topbar" ref=${headerRef}>
          <div class="logo"><img class="mark-img" src="logo.svg" alt="" width="34" height="34" /><span class="word">Content Chef</span></div>
          <${BrandSwitch} meta=${meta} brand=${brand} onPick=${pickBrand} onNew=${() => setNewBrand(true)} />
          <nav class="tabs" aria-label="Main navigation">
            ${NAV.map(([id, ico, label]) => html`<button class=${tab === id ? 'on' : ''} onClick=${() => setTab(id)}><${Icon} name=${ico} size=${15} />${label}</button>`)}
          </nav>
          <div class="top-actions">
            ${window.desktop?.showLauncher && html`<button class="btn small ghost" onClick=${() => window.desktop.showLauncher()}>Launcher</button>`}
            <${AiActivity} />
            <button class="icon-btn" title=${dark ? 'Light mode' : 'Dark mode'} onClick=${() => saveSettings({ theme: dark ? 'light' : 'dark' })}><${Icon} name=${dark ? 'sun' : 'moon'} /></button>
            <button class="ask-btn" onClick=${() => dispatchEvent(new Event('chef:chat'))}><span class="spark"><${Icon} name="sparkles" size=${13} stroke=${2} /></span>Ask ${assistantName(settings)}</button>
          </div>
        </header>
        <div class="main">
          ${tab === 'home' && html`<${DashboardPage} />`}
          ${tab === 'create' && html`<${CreatePage} key=${brand.id} />`}
          ${tab === 'video' && html`<${VideoPage} key=${brand.id} />`}
          ${tab === 'brands' && html`<${BrandsPage} key=${brand.id} />`}
          ${tab === 'saved' && html`<${SavedPage} />`}
          ${tab === 'settings' && html`<${SettingsPage} />`}
        </div>
      </div>
      ${newBrand && html`<${NewBrandModal} settings=${settings} onClose=${() => setNewBrand(false)} onCreated=${async (id) => { await reload(); pickBrand(id); setNewBrand(false); setTab('brands'); }} />`}
      <a class="rcm-mark" href="https://realcitymedia.com" target="_blank" rel="noopener" title="Made by RealCityMedia">RCM</a>
      <${ChatWidget} key=${assistantProvider(settings)} />
      <${Toasts} />
    <//>`;
}

// Desktop app: the top bar becomes the window's title bar (drag area + room for window buttons).
if (window.desktop) document.documentElement.classList.add('desktop', `os-${window.desktop.platform}`);

render(html`<${App} />`, document.getElementById('app'));
