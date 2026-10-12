// One release updates both launcher and studio; user work lives outside the installation.
// `quick` (optional): code-only updates swapped in place (see quick-update.js), tried before the
// full installer. Full installs run silently (no setup wizard).
export function createUpdater({ updater, packaged, version, supported = true, emit = () => {}, intervalMs = 4 * 60 * 60 * 1000, quick = null, silentInstall = true }) {
  let state = { phase: packaged && supported ? 'idle' : 'disabled', currentVersion: version,
    reason: !packaged ? 'development' : !supported ? 'unsupported' : null };
  let pending = null, disposed = false, installing = false;
  const set = (patch) => { if (!disposed) { state = { ...state, ...patch }; emit({ ...state }); } };
  const status = () => ({ ...state });
  if (state.phase === 'disabled') return { status, check: async () => status(), install: () => false, dispose() {} };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  const failed = (err) => set({ phase: 'error', percent: null, error: /404|No published versions|latest.*not found|ERR_UPDATER_LATEST_VERSION_NOT_FOUND/i.test(err?.message ?? '')
    ? 'No published update is available yet. Your installed studio is ready to use.'
    : 'Could not finish the update. Check your connection and try again. Your installed studio is still available.' });
  const listeners = {
    'checking-for-update': () => set({ phase: 'checking', error: null, percent: null }),
    'update-not-available': () => set({ phase: 'current', checkedAt: Date.now(), nextVersion: null, error: null }),
    'update-available': (info) => set({ phase: 'downloading', nextVersion: info.version, percent: 0, error: null, kind: 'full' }),
    'download-progress': (p) => set({ phase: 'downloading', percent: Math.max(0, Math.min(100, Number(p.percent) || 0)) }),
    'update-downloaded': (info) => set({ phase: 'ready', nextVersion: info.version, percent: 100, error: null, kind: 'full' }),
    error: failed,
  };
  for (const [event, fn] of Object.entries(listeners)) updater.on(event, fn);
  async function check() {
    if (disposed || installing || ['ready', 'downloading'].includes(state.phase)) return status();
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      set({ phase: 'checking', error: null });
      // A quick (code-only) update when the release has one for this runtime; otherwise the installer.
      if (quick) {
        try {
          const u = await quick.find();
          if (u) {
            set({ phase: 'downloading', nextVersion: u.version, percent: 0, error: null, kind: 'quick' });
            await quick.stage(u, (percent) => set({ percent: Math.round(percent) }));
            set({ phase: 'ready', nextVersion: u.version, percent: 100, kind: 'quick' });
            return status();
          }
        } catch { set({ phase: 'checking', percent: null, kind: null }); /* fall back to the full update */ }
      }
      try { const result = await updater.checkForUpdates(); await result?.downloadPromise; }
      catch (e) { failed(e); }
      return status();
    }).finally(() => { pending = null; });
    return pending;
  }
  const timer = setInterval(() => { void check(); }, intervalMs);
  timer.unref?.();
  return { status, check,
    install() {
      if (state.phase !== 'ready' || installing || disposed) return false;
      installing = true;
      if (state.kind === 'quick') {
        set({ phase: 'installing' });
        Promise.resolve().then(() => quick.apply()).then(() => quick.relaunch(), (e) => { installing = false; set({ phase: 'error', error: e.message }); });
        return true;
      }
      try { updater.quitAndInstall(silentInstall, true); return true; }
      catch (e) { installing = false; failed(e); return false; }
    },
    dispose() { disposed = true; clearInterval(timer); for (const [event, fn] of Object.entries(listeners)) updater.removeListener(event, fn); },
  };
}
