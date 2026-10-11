import { assistantName, assistantReady } from './assistant.js';

const bridge = window.chefLauncher;
const $ = (id) => document.getElementById(id);
let opening = false;
function showError(error) { $('action-error').textContent = error.message || String(error); $('action-error').hidden = false; }
function renderUpdate(state) {
  const { phase, nextVersion, percent, reason } = state;
  const labels = { disabled: reason === 'development' ? 'SOURCE BUILD' : 'MANUAL UPDATES', idle: 'AUTO UPDATES ON', checking: 'CHECKING', current: 'UP TO DATE', downloading: 'DOWNLOADING', ready: 'UPDATE READY', error: 'CHECK AGAIN' };
  const messages = {
    disabled: reason === 'development' ? 'You’re running from source. Installed releases keep the launcher and studio updated automatically.' : 'Install the AppImage release to receive automatic updates on Linux.',
    idle: 'New releases download automatically. Keep creating while we take care of the rest.',
    checking: 'Looking for the latest launcher and studio release…',
    current: 'You’re on the latest release. We’ll check again automatically.',
    downloading: `Getting version ${nextVersion ?? ''} ready. You can keep using the studio.`,
    ready: `Version ${nextVersion} is ready. Restart now, or it will install when you quit.`,
    error: state.error,
  };
  $('update-badge').textContent = labels[phase] ?? 'AUTO UPDATES';
  $('update-badge').className = `launch-badge ${['current', 'ready'].includes(phase) ? 'good' : phase === 'downloading' ? 'warm' : ''}`;
  $('update-message').textContent = messages[phase] ?? messages.idle;
  $('check-updates').hidden = phase === 'ready' || phase === 'disabled';
  $('check-updates').disabled = ['checking', 'downloading'].includes(phase);
  $('install-update').hidden = phase !== 'ready';
  $('update-progress').hidden = phase !== 'downloading';
  const progress = Math.round(Number(percent) || 0);
  $('update-progress').setAttribute('aria-valuenow', String(progress));
  $('update-progress').firstElementChild.style.width = `${progress}%`;
  $('update-detail').textContent = phase === 'downloading' ? `${progress}% downloaded · launcher + studio` : 'Launcher + studio update together.';
}
async function getJson(url) { const res = await fetch(url); if (!res.ok) throw new Error('The local studio could not be reached. Try reopening Content Chef.'); return res.json(); }
$('open-studio').addEventListener('click', async () => {
  if (opening) return;
  opening = true; $('open-studio').disabled = true; $('open-note').textContent = 'Opening your creative workspace…';
  try { if (bridge) await bridge.openStudio(); else location.assign('/'); }
  catch (e) { showError(e); }
  finally { opening = false; $('open-studio').disabled = false; $('open-note').textContent = 'Your brands and projects are ready when you are.'; }
});
$('open-workspace').addEventListener('click', () => { void bridge.openWorkspace().catch(showError); });
$('check-updates').addEventListener('click', () => { void bridge.checkUpdates().then(renderUpdate).catch(showError); });
$('install-update').addEventListener('click', async () => {
  try { if (!await bridge.installUpdate()) throw new Error('The update is not ready yet. Please check again.'); }
  catch (e) { showError(e); }
});
const unsubscribe = bridge?.onUpdate(renderUpdate);
window.addEventListener('pagehide', () => unsubscribe?.(), { once: true });

async function init() {
  const [meta, state] = await Promise.all([getJson('/api/meta'), bridge?.state()]);
  const version = state?.version ?? meta.version;
  $('hero-version').textContent = version ? `v${version}` : 'LOCAL STUDIO';
  $('footer-version').textContent = `CONTENT CHEF ${version ? `/ ${version}` : ''}`;
  $('channel').textContent = state?.packaged ? 'STABLE CHANNEL' : 'DEVELOPMENT';
  $('brand-count').textContent = meta.brands.length;
  document.body.classList.toggle('launch-mac', state?.platform === 'darwin');
  $('workspace-location').textContent = state?.workspace ?? 'Local project workspace';
  $('workspace-location').title = state?.workspace ?? meta.home;
  $('open-workspace').hidden = !bridge;
  // Read the current state last so a slow metadata load never rolls back an update event.
  renderUpdate(bridge ? (await bridge.state()).update : { phase: 'disabled', reason: 'development' });
  const settings = await getJson('/api/settings');
  $('assistant-name').textContent = assistantName(settings);
  $('assistant-status').textContent = assistantReady(settings) ? 'connected & ready' : 'connect in studio settings';
}
init().catch(showError);
window.addEventListener('focus', () => {
  void getJson('/api/meta').then((m) => { $('brand-count').textContent = m.brands.length; }).catch(() => {});
  if (bridge) void bridge.state().then((s) => renderUpdate(s.update)).catch(showError);
});
