// Video mode (bare bones): pick a clip, trim it, crop it to a social shape, change speed / mute,
// export an MP4, and optionally add it to the brand's media to use as an ad background.
import { html, useState, useEffect, useRef, api, useApp, toast, uploadFile, isVideo, brandAssetUrl, Field, Segmented, Toggle } from './lib.js';
import { Icon } from './icons.js';

const ASPECTS = [['original', 'Original'], ['9:16', '9:16 Story'], ['4:5', '4:5 Feed'], ['1:1', '1:1 Square'], ['16:9', '16:9 Wide']];
const RATIO = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };
const fmtT = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function VideoPage() {
  const { brand, reload } = useApp();
  const clips = brand.assets.filter(isVideo);
  const [ref, setRef] = useState(clips[0] ?? null);
  const [dur, setDur] = useState(0);
  const [range, setRange] = useState([0, 0]);
  const [aspect, setAspect] = useState('9:16');
  const [focusX, setFocusX] = useState(0.5);
  const [speed, setSpeed] = useState(1);
  const [mute, setMute] = useState(false);
  const [toBrand, setToBrand] = useState(true);
  const [name, setName] = useState('');
  const [job, setJob] = useState(null);
  const [now, setNow] = useState(0);
  const vid = useRef();
  useEffect(() => { if (!ref && clips[0]) setRef(clips[0]); }, [clips.join()]);
  useEffect(() => {
    if (job?.status !== 'running') return undefined;
    const t = setInterval(async () => {
      const j = await api('GET', `/api/jobs/${job.id}`).catch(() => null);
      if (!j) return;
      setJob(j);
      if (j.status === 'done') { toast(j.result.assetRef ? 'Exported and added to brand media' : 'Exported'); if (j.result.assetRef) reload(); }
      if (j.status === 'error') toast(j.error, 'err');
    }, 600);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);
  const [a, b] = range;
  // Play only the kept part, on a loop, so you hear/see exactly what you'll export.
  const onTime = () => {
    const v = vid.current;
    if (!v) return;
    setNow(v.currentTime);
    if (b > a && (v.currentTime > b || v.currentTime < a - 0.05)) v.currentTime = a;
  };
  const upload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { const r = await uploadFile(brand.id, f); await reload(); setRef(r); toast(`Added ${f.name}`); } catch (err) { toast(err.message, 'err'); }
  };
  const exportClip = async () => {
    try {
      const r = await api('POST', '/api/video/trim', { brand: brand.id, ref, name: name || undefined, start: a, end: b, aspect, focusX, mute, speed, saveToBrand: toBrand });
      setJob({ id: r.id, status: 'running' });
    } catch (e) { toast(e.message, 'err'); }
  };
  const R = RATIO[aspect];
  const frame = R ? (R >= 1 ? { width: '100%', aspectRatio: `${R}` } : { height: '100%', aspectRatio: `${R}` }) : { width: '100%', height: '100%' };
  return html`
    <div class="video-page">
      <aside class="panel-card glass video-clips">
        <h3>Clips</h3>
        <p class="muted small">${brand.name}'s videos. Add MP4, MOV, WebM or GIF.</p>
        <div class="clip-list">
          ${clips.map((c) => html`
            <button type="button" key=${c} class="clip ${c === ref ? 'on' : ''}" onClick=${() => { setRef(c); setRange([0, 0]); }}>
              <video src=${brandAssetUrl(brand.id, c)} muted preload="metadata"></video>
              <span class="ellipsis">${c.replace(/^assets\//, '')}</span>
            </button>`)}
          <label class="clip add"><${Icon} name="plus" /><span>Add clip</span><input type="file" accept="video/*,.gif" hidden onChange=${upload} /></label>
        </div>
      </aside>
      <section class="video-stage">
        ${ref ? html`
          <div class="video-view">
            <div class="video-frame" style=${frame}>
              <video ref=${vid} src=${brandAssetUrl(brand.id, ref)} controls muted=${mute} playsinline
                style=${{ objectFit: R ? 'cover' : 'contain', objectPosition: `${focusX * 100}% 50%` }}
                onLoadedMetadata=${(e) => { setDur(e.target.duration); setRange([0, e.target.duration]); }}
                onTimeUpdate=${onTime} onRateChange=${() => {}} onPlay=${(e) => { e.target.playbackRate = speed; }}></video>
            </div>
          </div>
          <div class="trim">
            <div class="trim-bar">
              <div class="trim-keep" style=${{ left: `${(a / (dur || 1)) * 100}%`, width: `${((b - a) / (dur || 1)) * 100}%` }}></div>
              <div class="trim-head" style=${{ left: `${(now / (dur || 1)) * 100}%` }}></div>
              <input type="range" min="0" max=${dur} step="0.05" value=${a} onInput=${(e) => setRange([Math.min(Number(e.target.value), b - 0.2), b])} />
              <input type="range" min="0" max=${dur} step="0.05" value=${b} onInput=${(e) => setRange([a, Math.max(Number(e.target.value), a + 0.2)])} />
            </div>
            <div class="row between small">
              <span>Start <b>${fmtT(a)}</b> <button class="link-btn" onClick=${() => setRange([Math.min(now, b - 0.2), b])}>set to playhead</button></span>
              <span class="muted">Keeping ${fmtT(Math.max(0, b - a) / speed)}${speed !== 1 ? ` at ${speed}×` : ''}</span>
              <span>End <b>${fmtT(b)}</b> <button class="link-btn" onClick=${() => setRange([a, Math.max(now, a + 0.2)])}>set to playhead</button></span>
            </div>
          </div>`
          : html`<div class="empty">Add a clip to get started.</div>`}
      </section>
      <aside class="panel-card glass video-side">
        <h3>Video</h3>
        <${Field} label="Shape"><div class="seg wrap">${ASPECTS.map(([v, l]) => html`<button type="button" class=${aspect === v ? 'on' : ''} onClick=${() => setAspect(v)}>${l}</button>`)}</div><//>
        ${R && html`<${Field} label="Keep in view" hint=${focusX < 0.4 ? 'left' : focusX > 0.6 ? 'right' : 'centre'}>
          <input type="range" min="0" max="1" step="0.01" value=${focusX} onInput=${(e) => setFocusX(Number(e.target.value))} />
        <//>`}
        <${Field} label="Speed"><${Segmented} value=${speed} onChange=${(v) => { setSpeed(v); if (vid.current) vid.current.playbackRate = v; }}
          options=${[0.5, 1, 1.5, 2].map((v) => ({ value: v, label: `${v}×` }))} /><//>
        <${Toggle} checked=${mute} onChange=${setMute} label="Remove sound" />
        <${Toggle} checked=${toBrand} onChange=${setToBrand} label="Add to brand media (use as a background)" />
        <${Field} label="File name" hint="optional"><input value=${name} onInput=${(e) => setName(e.target.value)} placeholder=${ref ? ref.replace(/^assets\//, '').replace(/\.[^.]+$/, '') : 'clip'} /><//>
        <button class="btn primary big" disabled=${!ref || job?.status === 'running'} onClick=${exportClip}>
          ${job?.status === 'running' ? 'Exporting…' : html`<${Icon} name="download" /> Export MP4`}
        </button>
        ${job?.status === 'done' && html`
          <div class="done-box">
            <span>✓ ${job.result.ads[0].files[0].file}</span>
            <div class="row"><a class="btn small" href=${job.result.ads[0].files[0].url} target="_blank">Play</a>
              <button class="btn small" onClick=${() => api('POST', '/api/open', { path: job.result.dir })}><${Icon} name="folder" size=${14} /> Open folder</button></div>
          </div>`}
        <p class="faint small">More tools (captions, text, cuts) can come later; this is the basic cutting board.</p>
      </aside>
    </div>`;
}
