// Planner: a content strategy (goals, audience, pillars, rhythm, platforms) and a month calendar
// of posts that walk idea → draft → ready → posted, with the AI drafting plans on request and
// the app holding your hand at each step (open in builder, captions, reminders, calendar file).
import { html, useState, useEffect, useRef, api, store, useApp, Modal, Field, Segmented, toast, plural } from './lib.js';
import { Icon } from './icons.js';
import { assistantName, assistantReady } from './assistant.js';

const STATUS = {
  idea: { label: 'Idea', next: 'draft', hint: 'Turn it into a design', icon: '💡' },
  draft: { label: 'Draft', next: 'ready', hint: 'Finish and export it', icon: '✏️' },
  ready: { label: 'Ready', next: 'posted', hint: 'Post it on the day', icon: '📣' },
  posted: { label: 'Posted', next: null, hint: 'Done', icon: '✓' },
};
const FORMAT = { single: 'Single image', carousel: 'Carousel', bulk: 'Ad set', video: 'Video' };
const PILLAR_COLOURS = ['#E5531A', '#2F80ED', '#27AE60', '#9B51E0', '#F2C94C', '#EB5757', '#00B8A9', '#F78FB3'];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const plain = (s) => String(s ?? '').replace(/[*_|]/g, ' ').replace(/\s+/g, ' ').trim();
const newId = () => (crypto.randomUUID?.() ?? String(Math.random()).slice(2));

// ── Posting rhythm ──────────────────────────────────────────────────────────
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PRESETS = [
  { label: 'Once a week', days: [3], times: ['12:00'] },
  { label: '3× a week', days: [1, 3, 5], times: ['10:00'] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5], times: ['09:00'] },
  { label: 'Every day', days: [1, 2, 3, 4, 5, 6, 7], times: ['12:00'] },
  { label: 'Twice a day', days: [1, 2, 3, 4, 5, 6, 7], times: ['09:00', '18:00'] },
];
const perWeek = (s) => (s.days?.length ?? 0) * (s.times?.length ?? 0);
const fmtTime = (t) => new Date(`2000-01-01T${t}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function rhythmLabel(s) {
  const n = perWeek(s);
  if (!n) return 'No posting days set';
  if (s.days.length === 7) return s.times.length === 1 ? `Every day at ${fmtTime(s.times[0])}` : `${s.times.length}× a day (${s.times.map(fmtTime).join(', ')})`;
  return `${n} post${n === 1 ? '' : 's'} a week: ${s.days.map((d) => DAY_NAMES[d - 1]).join(', ')} at ${s.times.map(fmtTime).join(' & ')}`;
}
const dow = (date) => { const d = new Date(`${date}T12:00:00`).getDay(); return d === 0 ? 7 : d; };

/** Choose posting days and times (presets for the common rhythms, or any combination). */
function RhythmEditor({ s, setStrategy }) {
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const setTimes = (times) => setStrategy({ times: [...new Set(times.filter(Boolean))].sort() });
  return html`
    <div class="field pl-rhythm"><span class="field-label">Posting rhythm<em>${perWeek(s)} a week</em></span>
      <div class="pl-presets">${PRESETS.map((p) => html`<button type="button" class=${same(p.days, s.days) && same(p.times, s.times) ? 'on' : ''} onClick=${() => setStrategy({ days: p.days, times: p.times })}>${p.label}</button>`)}</div>
      <div class="pl-days">${DAY_NAMES.map((n, i) => html`<button type="button" class=${s.days.includes(i + 1) ? 'on' : ''} title=${n}
        onClick=${() => setStrategy({ days: s.days.includes(i + 1) ? s.days.filter((d) => d !== i + 1) : [...s.days, i + 1].sort() })}>${n[0]}</button>`)}</div>
      <div class="pl-times">
        ${s.times.map((t, i) => html`<span class="pl-time" key=${t}><input type="time" value=${t} onChange=${(e) => setTimes(s.times.map((x, j) => (j === i ? e.target.value : x)))} />
          ${s.times.length > 1 && html`<button title="Remove this time" onClick=${() => setTimes(s.times.filter((_, j) => j !== i))}>×</button>`}</span>`)}
        ${s.times.length < 6 && html`<button type="button" class="link-btn" onClick=${() => setTimes([...s.times, s.times.includes('18:00') ? '13:00' : '18:00'])}>+ time</button>`}
      </div>
      <p class="hint">${rhythmLabel(s)}</p>
    </div>`;
}

const addDays = (date, n) => ymd(new Date(new Date(`${date}T12:00:00`).getTime() + n * 864e5));
const mondayOf = (date) => addDays(date, 1 - dow(date));

/** Month grid starting on Monday: 6 weeks × 7 days of YYYY-MM-DD. */
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => ymd(new Date(year, month, 1 - offset + i)));
}

export function PlannerPage() {
  const { meta, brand, setTab, pickBrand, setPending, settings, workspace } = useApp();
  const [plan, setPlan] = useState(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [editing, setEditing] = useState(null); // post being edited (copy)
  const [planning, setPlanning] = useState(false);
  const [newPillar, setNewPillar] = useState('');
  const [view, setViewState] = useState(store.get('planner.view', 'week'));
  const setView = (v) => { setViewState(v); store.set('planner.view', v); };
  const [weekStart, setWeekStart] = useState(() => mondayOf(today()));
  const lastSaved = useRef(0);
  const saveTimer = useRef(null);

  const load = () => api('GET', `/api/planner?brand=${encodeURIComponent(brand.id)}`).then((p) => { if (p.updatedAt !== lastSaved.current) setPlan(p); }).catch((e) => toast(e.message, 'err'));
  useEffect(() => {
    load();
    const onChange = (e) => { if (!e.detail || e.detail === brand.id) load(); };
    addEventListener('chef:planner', onChange);
    return () => removeEventListener('chef:planner', onChange);
  }, [brand.id]);

  // Every change saves (lightly debounced); the server pushes changes made by an AI back here.
  const commit = (next) => {
    setPlan(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { const saved = await api('PUT', `/api/planner/${brand.id}`, { strategy: next.strategy, posts: next.posts }); lastSaved.current = saved.updatedAt; } catch (e) { toast(e.message, 'err'); }
    }, 300);
  };
  if (!plan) return html`<div class="page"><div class="page-inner"><p class="muted">Loading planner…</p></div></div>`;

  const s = plan.strategy;
  const setStrategy = (patch) => commit({ ...plan, strategy: { ...s, ...patch } });
  const upsert = (post) => commit({ ...plan, posts: plan.posts.some((p) => p.id === post.id) ? plan.posts.map((p) => (p.id === post.id ? post : p)) : [...plan.posts, post] });
  const remove = (id) => commit({ ...plan, posts: plan.posts.filter((p) => p.id !== id) });
  const colour = (pillar) => PILLAR_COLOURS[Math.max(0, s.pillars.indexOf(pillar)) % PILLAR_COLOURS.length];
  const blank = (date, time) => ({ id: newId(), date, time: time ?? s.times[0] ?? '10:00', platforms: [...s.platforms], pillar: s.pillars[0] ?? '', format: 'single', status: 'idea', headline: '', brief: '', caption: '', notes: '' });

  // Hand-holding: open the post in the builder with its words and caption already filled in.
  const openInBuilder = (post) => {
    const base = (workspace?.brand === brand.id ? workspace.design : store.get(`design.${brand.id}`)) ?? {};
    const captions = Object.fromEntries((post.platforms.length ? post.platforms : s.platforms).map((p) => [p, post.caption]).filter(([, c]) => c));
    if (post.format === 'carousel') {
      setPending({ brand: brand.id, design: { ...base, mode: 'carousel', variants: [], templates: ['carousel-slide'], formats: [base.formats?.[0] || 'ig-portrait'], carousel: {}, slides: [], campaign: plain(post.headline).slice(0, 40) || 'carousel' } });
      navigator.clipboard?.writeText([post.headline, post.brief].filter(Boolean).join('\n')).catch(() => {});
      toast('Carousel mode is open: press "Build from a brief" and paste the brief (copied for you).');
    } else {
      setPending({ brand: brand.id, design: { ...base, mode: 'single', variants: [], content: { ...(base.content ?? {}), headline: post.headline || base.content?.headline, eyebrow: post.pillar || base.content?.eyebrow }, captions, campaign: plain(post.headline).slice(0, 40) || 'post' } });
      toast('Opened in the builder with the headline and caption filled in.');
    }
    if (post.status === 'idea') upsert({ ...post, status: 'draft' });
    pickBrand(brand.id);
    setTab(post.format === 'video' ? 'video' : 'create');
  };

  const grid = monthGrid(cursor.y, cursor.m);
  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const byDate = (d) => plan.posts.filter((p) => p.date === d).sort((a, b) => a.time.localeCompare(b.time));
  const unscheduled = plan.posts.filter((p) => !p.date);
  const weekEnd = ymd(new Date(Date.now() + 6 * 864e5));
  const upcoming = plan.posts.filter((p) => p.date && p.date >= today() && p.date <= weekEnd && p.status !== 'posted').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, plan.posts.filter((p) => p.status === k).length]));
  const move = (id, date, time) => { const p = plan.posts.find((x) => x.id === id); if (p) upsert({ ...p, date, ...(time ? { time } : {}) }); };
  // Open slots: days/times in your rhythm (from today on) that have no post yet.
  const openSlots = (d) => (d >= today() && s.days.includes(dow(d)) ? s.times.filter((t) => !byDate(d).some((p) => p.time === t)) : []);
  const isOpenSlot = (d, t) => d >= today() && s.days.includes(dow(d)) && s.times.includes(t);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekTimes = [...new Set([...s.times, ...plan.posts.filter((p) => weekDays.includes(p.date)).map((p) => p.time)])].sort();
  const weekLabel = `${new Date(`${weekDays[0]}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(`${weekDays[6]}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const openThisView = (view === 'week' ? weekDays : grid.filter((d) => Number(d.slice(5, 7)) - 1 === cursor.m)).reduce((n, d) => n + openSlots(d).length, 0);
  const step = (dir) => (view === 'week' ? setWeekStart((w) => addDays(w, 7 * dir)) : setCursor(({ y, m }) => { const x = new Date(y, m + dir, 1); return { y: x.getFullYear(), m: x.getMonth() }; }));
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setWeekStart(mondayOf(today())); };
  // A post in the week view: status, pillar colour, format, headline and platforms.
  const card = (p) => html`
    <button type="button" class="pl-card-post st-${p.status}" key=${p.id} draggable="true" onDragStart=${(e) => e.dataTransfer.setData('text/plain', p.id)}
      onClick=${(e) => { e.stopPropagation(); setEditing({ ...p }); }}>
      <span class="pl-cp-top"><i style=${{ background: colour(p.pillar) }}></i>${STATUS[p.status].label}<small>${FORMAT[p.format]}</small></span>
      <b>${plain(p.headline) || 'Untitled post'}</b>
      <small class="muted ellipsis">${p.platforms.map((k) => k[0].toUpperCase() + k.slice(1)).join(' · ')}</small>
    </button>`;
  const chip = (p) => html`
    <button type="button" class="pl-chip st-${p.status}" key=${p.id} draggable="true" onDragStart=${(e) => e.dataTransfer.setData('text/plain', p.id)}
      onClick=${(e) => { e.stopPropagation(); setEditing({ ...p }); }} title=${`${STATUS[p.status].label} · ${FORMAT[p.format]} · ${plain(p.headline) || 'Untitled'}`}>
      <i style=${{ background: colour(p.pillar) }}></i><span class="ellipsis">${plain(p.headline) || 'Untitled post'}</span><small>${STATUS[p.status].icon}</small>
    </button>`;

  return html`
    <div class="page"><div class="page-inner planner">
      <div class="dash-head">
        <div><h2>Planner</h2><p class="muted">${brand.name} · ${plural(plan.posts.length, 'post')} planned · ${counts.posted} posted</p></div>
        <div class="row">
          <a class="btn" href=${`/api/planner/${brand.id}/calendar.ics`} download title="Add the plan to Google, Apple or Outlook Calendar, with a reminder 30 minutes before each post"><${Icon} name="calendar" size=${15} /> Add to my calendar</a>
          <button class="btn" onClick=${() => setEditing(blank(today()))}><${Icon} name="plus" size=${15} /> Add post</button>
          <button class="btn primary" disabled=${!assistantReady(settings)} onClick=${() => setPlanning(true)} title=${assistantReady(settings) ? '' : 'Connect an assistant in Settings first'}><${Icon} name="sparkles" size=${15} /> Plan with ${assistantName(settings)}</button>
        </div>
      </div>

      <div class="pl-steps">
        ${Object.entries(STATUS).map(([k, v]) => html`<div class="pl-step st-${k}"><b>${counts[k]}</b><span>${v.label}</span><small>${v.hint}</small></div>`)}
      </div>

      <div class="pl-layout">
        <aside class="pl-side">
          <section class="card pl-card">
            <h3>Strategy</h3>
            <${Field} label="Goals" hint="what success looks like"><textarea rows="2" value=${s.goals} placeholder="e.g. 20 new bookings a month, grow Instagram to 5k" onChange=${(e) => setStrategy({ goals: e.target.value })}></textarea><//>
            <${Field} label="Audience"><textarea rows="2" value=${s.audience} placeholder="e.g. busy locals 25–40 who care about good coffee" onChange=${(e) => setStrategy({ audience: e.target.value })}></textarea><//>
            <div class="field"><span class="field-label">Content pillars<em>the themes you rotate</em></span>
              <div class="pl-pillars">${s.pillars.map((p) => html`<span class="pl-pillar" key=${p}><i style=${{ background: colour(p) }}></i>${p}<button title="Remove" onClick=${() => setStrategy({ pillars: s.pillars.filter((x) => x !== p) })}>×</button></span>`)}
                <input class="pl-pillar-add" value=${newPillar} placeholder="+ add pillar" onInput=${(e) => setNewPillar(e.target.value)}
                  onKeyDown=${(e) => { if (e.key === 'Enter' && newPillar.trim()) { setStrategy({ pillars: [...new Set([...s.pillars, newPillar.trim()])] }); setNewPillar(''); } }} /></div>
            </div>
            <${RhythmEditor} s=${s} setStrategy=${setStrategy} />
            <div class="field"><span class="field-label">Platforms</span>
              <div class="pl-plats">${Object.entries(meta.platforms).filter(([k]) => k !== 'display').map(([k, v]) => html`<button type="button" class=${s.platforms.includes(k) ? 'on' : ''} onClick=${() => setStrategy({ platforms: s.platforms.includes(k) ? s.platforms.filter((x) => x !== k) : [...s.platforms, k] })}>${v.label}</button>`)}</div>
            </div>
          </section>

          <section class="card pl-card">
            <h3>This week</h3>
            ${upcoming.length ? upcoming.map((p) => html`
              <button type="button" class="pl-up" key=${p.id} onClick=${() => setEditing({ ...p })}>
                <span class="pl-up-date">${new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}<small>${p.time}</small></span>
                <span class="grow ellipsis"><b>${plain(p.headline) || 'Untitled post'}</b><small class="muted">${STATUS[p.status].label} → ${STATUS[p.status].hint}</small></span>
              </button>`) : html`<p class="muted small">Nothing due in the next 7 days.${plan.posts.length ? '' : ` Press "Plan with ${assistantName(settings)}" to draft a plan.`}</p>`}
          </section>

          ${unscheduled.length > 0 && html`
            <section class="card pl-card" onDragOver=${(e) => e.preventDefault()} onDrop=${(e) => move(e.dataTransfer.getData('text/plain'), null)}>
              <h3>Ideas without a date</h3>
              <p class="muted small">Drag one onto a day to schedule it.</p>
              <div class="pl-backlog">${unscheduled.map(chip)}</div>
            </section>`}
        </aside>

        <section class="pl-cal card">
          <div class="pl-cal-head">
            <button class="icon-btn" onClick=${() => step(-1)} title=${view === 'week' ? 'Previous week' : 'Previous month'}>‹</button>
            <h3>${view === 'week' ? weekLabel : monthName}</h3>
            <button class="icon-btn" onClick=${() => step(1)} title=${view === 'week' ? 'Next week' : 'Next month'}>›</button>
            <button class="btn small ghost" onClick=${goToday}>Today</button>
            <span class="grow"></span>
            <span class="muted small">${openThisView} open slot${openThisView === 1 ? '' : 's'}</span>
            <${Segmented} value=${view} onChange=${setView} options=${[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          </div>
          ${view === 'week' ? html`
            <div class="pl-week" style=${{ gridTemplateColumns: `64px repeat(7, minmax(0, 1fr))` }}>
              <div></div>
              ${weekDays.map((d) => html`<div class="pl-wk-head ${d === today() ? 'today' : ''}" key=${d}><small>${DAY_NAMES[dow(d) - 1]}</small><b>${Number(d.slice(8))}</b></div>`)}
              ${weekTimes.map((t) => html`
                <div class="pl-wk-time" key=${`t${t}`}>${fmtTime(t)}</div>
                ${weekDays.map((d) => {
                  const here = byDate(d).filter((p) => p.time === t);
                  const open = !here.length && isOpenSlot(d, t);
                  return html`<div key=${`${d}${t}`} class="pl-wk-cell ${d < today() ? 'past' : ''} ${open ? 'open' : ''}"
                    onDragOver=${(e) => e.preventDefault()} onDrop=${(e) => { e.preventDefault(); move(e.dataTransfer.getData('text/plain'), d, t); }}
                    onClick=${() => setEditing(blank(d, t))}>
                    ${here.map(card)}
                    ${open && html`<span class="pl-slot">+ Plan a post</span>`}
                  </div>`;
                })}`)}
            </div>`
          : html`
            <div class="pl-grid">
              ${DAY_NAMES.map((d) => html`<div class="pl-dow">${d}</div>`)}
              ${grid.map((d) => {
                const inMonth = Number(d.slice(5, 7)) - 1 === cursor.m;
                const open = openSlots(d);
                return html`<div key=${d} class="pl-day ${inMonth ? '' : 'out'} ${d === today() ? 'today' : ''} ${d < today() ? 'past' : ''}"
                  onClick=${() => setEditing(blank(d, open[0]))} onDragOver=${(e) => e.preventDefault()} onDrop=${(e) => { e.preventDefault(); move(e.dataTransfer.getData('text/plain'), d); }}>
                  <span class="pl-num">${Number(d.slice(8))}</span>
                  ${byDate(d).map(chip)}
                  ${inMonth && open.map((t) => html`<button type="button" class="pl-open" key=${t} title="Open slot in your rhythm" onClick=${(e) => { e.stopPropagation(); setEditing(blank(d, t)); }}>+ ${fmtTime(t)}</button>`)}
                </div>`;
              })}
            </div>`}
        </section>
      </div>

      ${editing && html`<${PostEditor} post=${editing} strategy=${s} colour=${colour} platforms=${meta.platforms} brand=${brand}
        onClose=${() => setEditing(null)}
        onSave=${(p) => { upsert(p); setEditing(null); }}
        onDelete=${(id) => { remove(id); setEditing(null); }}
        onOpen=${(p) => { upsert(p); setEditing(null); openInBuilder(p); }} />`}
      ${planning && html`<${PlanModal} brand=${brand} strategy=${s} settings=${settings} onClose=${() => setPlanning(false)}
        onKeep=${(posts, pillars) => { commit({ ...plan, strategy: pillars?.length && !s.pillars.length ? { ...s, pillars } : s, posts: [...plan.posts, ...posts] }); setPlanning(false); toast(`Added ${plural(posts.length, 'post')} to your calendar`); }} />`}
    </div></div>`;
}

// Each platform's "new post" page; X and LinkedIn take the text pre-filled, the rest get it on the clipboard.
const COMPOSE = {
  x: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}`,
  linkedin: (t) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(t)}`,
  facebook: () => 'https://www.facebook.com/',
  instagram: () => 'https://www.instagram.com/',
  tiktok: () => 'https://www.tiktok.com/upload',
  pinterest: () => 'https://www.pinterest.com/pin-builder/',
  youtube: () => 'https://studio.youtube.com/',
};
function publishTo(platform, post) {
  const text = post.caption || plain(post.headline);
  navigator.clipboard?.writeText(text).catch(() => {});
  const url = COMPOSE[platform]?.(text);
  if (url) window.open(url, '_blank', 'noopener');
  toast(COMPOSE[platform] && !['x', 'linkedin'].includes(platform) ? 'Caption copied: paste it into the post' : 'Opening the composer…');
}

function PostEditor({ post, strategy, colour, platforms, brand, onClose, onSave, onDelete, onOpen }) {
  const [p, setP] = useState(post);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const st = STATUS[p.status];
  const writeCaption = async () => {
    setBusy(true);
    try {
      const plats = p.platforms.length ? p.platforms : ['instagram'];
      const r = await api('POST', '/api/captions/ai', { brand: brand.id, content: { headline: p.headline, subhead: p.brief }, platforms: [plats[0]], prompt: p.brief });
      const c = r[plats[0]];
      set({ caption: typeof c === 'object' && c ? `${c.title}\n\n${c.description}` : c ?? p.caption });
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return html`
    <${Modal} title=${post.headline ? 'Planned post' : 'New post'} onClose=${onClose}>
      <div class="pl-flow">${Object.entries(STATUS).map(([k, v]) => html`<button type="button" class="${p.status === k ? 'on' : ''} st-${k}" onClick=${() => set({ status: k })}>${v.icon} ${v.label}</button>`)}</div>
      <p class="hint pl-next">Next step: <b>${st.hint}</b></p>
      <div class="two">
        <${Field} label="Date"><input type="date" value=${p.date ?? ''} onInput=${(e) => set({ date: e.target.value || null })} /><//>
        <${Field} label="Time"><input type="time" value=${p.time} onInput=${(e) => set({ time: e.target.value || '10:00' })} /><//>
      </div>
      <${Field} label="Headline" hint="the hook on the image"><input value=${p.headline} placeholder="e.g. 3 signs your *website* is losing you sales" onInput=${(e) => set({ headline: e.target.value })} /><//>
      <${Field} label="Brief" hint="what it says and why"><textarea rows="2" value=${p.brief} onInput=${(e) => set({ brief: e.target.value })}></textarea><//>
      <div class="two">
        <${Field} label="Pillar">
          <select value=${p.pillar} onChange=${(e) => set({ pillar: e.target.value })}><option value="">None</option>${strategy.pillars.map((x) => html`<option value=${x}>${x}</option>`)}</select>
        <//>
        <${Field} label="Format">
          <select value=${p.format} onChange=${(e) => set({ format: e.target.value })}>${Object.entries(FORMAT).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
        <//>
      </div>
      <div class="field"><span class="field-label">Platforms</span>
        <div class="pl-plats">${Object.entries(platforms).filter(([k]) => k !== 'display').map(([k, v]) => html`<button type="button" class=${p.platforms.includes(k) ? 'on' : ''} onClick=${() => set({ platforms: p.platforms.includes(k) ? p.platforms.filter((x) => x !== k) : [...p.platforms, k] })}>${v.label}</button>`)}</div>
      </div>
      <${Field} label="Caption" hint=${html`<button type="button" class="link-btn" disabled=${busy} onClick=${(e) => { e.preventDefault(); writeCaption(); }}>${busy ? 'Writing…' : '✦ Write it for me'}</button>`}>
        <textarea rows="4" value=${p.caption} onInput=${(e) => set({ caption: e.target.value })}></textarea>
      <//>
      <${Field} label="Notes"><input value=${p.notes} placeholder="Photo to use, offer details, who's posting…" onInput=${(e) => set({ notes: e.target.value })} /><//>
      ${(p.status === 'ready' || p.status === 'draft') && (p.platforms.length > 0) && html`
        <div class="pl-publish">
          <div class="row between"><b>Post it</b><span class="muted small">Copies the caption, then opens each app's composer</span></div>
          <div class="pl-pub-row">${p.platforms.map((k) => html`
            <button type="button" class="pl-pub" key=${k} onClick=${() => publishTo(k, p)}>${platforms[k]?.label ?? k} ↗</button>`)}</div>
          <button type="button" class="btn small soft wide" onClick=${() => { set({ status: 'posted' }); onSave({ ...p, status: 'posted' }); toast('Marked as posted'); }}>✓ I've posted it</button>
          <p class="hint">Automatic publishing (no clicks) needs your accounts connected through each platform's API. It's on the roadmap.</p>
        </div>`}
      <div class="row between">
        <div class="row">
          ${post.headline !== undefined && html`<button class="btn small ghost" onClick=${() => { if (confirm('Delete this post from the plan?')) onDelete(p.id); }}>Delete</button>`}
          ${p.caption && html`<button class="btn small" onClick=${() => navigator.clipboard.writeText(p.caption).then(() => toast('Caption copied'))}>Copy caption</button>`}
        </div>
        <div class="row">
          ${p.status !== 'posted' && html`<button class="btn" onClick=${() => onOpen(p)}><${Icon} name="sparkles" size=${14} /> ${p.format === 'video' ? 'Open Video' : 'Open in builder'}</button>`}
          <button class="btn primary" onClick=${() => onSave(p)}>Save</button>
        </div>
      </div>
    <//>`;
}

function PlanModal({ brand, strategy, settings, onClose, onKeep }) {
  const [weeks, setWeeks] = useState(2);
  const [start, setStart] = useState(() => ymd(new Date(Date.now() + 864e5)));
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [keep, setKeep] = useState({});
  const run = async () => {
    setBusy(true);
    try {
      const r = await api('POST', `/api/planner/${brand.id}/plan`, { weeks, start, prompt: prompt.trim() || undefined });
      setResult(r);
      setKeep(Object.fromEntries(r.posts.map((p) => [p.id, true])));
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const chosen = result?.posts.filter((p) => keep[p.id]) ?? [];
  return html`
    <${Modal} title=${`Plan with ${assistantName(settings)}`} wide onClose=${onClose}>
      ${!result ? html`
        <p class="muted">${assistantName(settings)} drafts post ideas for the next few weeks from your strategy${strategy.pillars.length ? '' : ' (and suggests content pillars, since you have none yet)'}. Nothing is added until you choose what to keep.</p>
        <div class="two">
          <${Field} label="How many weeks"><${Segmented} value=${weeks} onChange=${setWeeks} options=${[1, 2, 3, 4].map((w) => ({ value: w, label: `${w}` }))} /><//>
          <${Field} label="Starting"><input type="date" value=${start} onInput=${(e) => setStart(e.target.value)} /><//>
        </div>
        <p class="hint">${rhythmLabel(strategy)} on ${strategy.platforms.join(', ') || 'Instagram'} → ${Math.min(60, perWeek(strategy) * weeks)} post ideas. Change the rhythm and platforms in Strategy.</p>
        <${Field} label="Anything specific?" hint="optional"><textarea rows="3" value=${prompt} placeholder="e.g. launching our new website packages in November, a Black Friday offer, hiring a designer" onInput=${(e) => setPrompt(e.target.value)}></textarea><//>
        <div class="row end"><button class="btn primary" disabled=${busy} onClick=${run}>${busy ? html`<span class="spin"></span> Planning…` : html`<${Icon} name="sparkles" size=${15} /> Draft my plan`}</button></div>`
      : html`
        ${result.pillars?.length > 0 && !strategy.pillars.length && html`<p class="hint">Suggested pillars (saved with the plan): <b>${result.pillars.join(' · ')}</b></p>`}
        <div class="pl-proposal">${result.posts.map((p) => html`
          <label class="pl-prop ${keep[p.id] ? 'on' : ''}" key=${p.id}>
            <input type="checkbox" checked=${!!keep[p.id]} onChange=${(e) => setKeep({ ...keep, [p.id]: e.target.checked })} />
            <span class="pl-up-date">${new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span class="grow"><b>${plain(p.headline)}</b><small class="muted">${p.pillar} · ${FORMAT[p.format]}</small><small>${p.brief}</small></span>
          </label>`)}</div>
        <div class="row between">
          <button class="btn ghost" onClick=${() => setResult(null)}>Back</button>
          <button class="btn primary" disabled=${!chosen.length} onClick=${() => onKeep(chosen, result.pillars)}>Add ${plural(chosen.length, 'post')} to the calendar</button>
        </div>`}
    <//>`;
}

/**
 * Gentle reminders while the app is open: when a planned post's time arrives (and it isn't
 * posted yet), show a notification with the caption ready to copy.
 */
export function PlannerReminders() {
  const { brand, setTab } = useApp();
  useEffect(() => {
    const check = async () => {
      const p = await api('GET', `/api/planner?brand=${encodeURIComponent(brand.id)}`).catch(() => null);
      if (!p) return;
      const now = new Date();
      const due = p.posts.filter((x) => x.date === ymd(now) && x.status !== 'posted' && !x.reminded && x.time <= `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      if (!due.length) return;
      for (const x of due) {
        const title = `Time to post: ${plain(x.headline) || 'your planned post'}`;
        toast(`📣 ${title}`);
        try {
          if (Notification.permission === 'default') await Notification.requestPermission();
          if (Notification.permission === 'granted') { const n = new Notification(title, { body: x.caption ? 'Caption is ready in the Planner.' : x.brief }); n.onclick = () => { window.focus(); setTab('planner'); }; }
        } catch { /* notifications unavailable */ }
      }
      await api('PUT', `/api/planner/${brand.id}`, { strategy: p.strategy, posts: p.posts.map((x) => (due.some((d) => d.id === x.id) ? { ...x, reminded: true } : x)) }).catch(() => {});
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [brand.id]);
  return null;
}
