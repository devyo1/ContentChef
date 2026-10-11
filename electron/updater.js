// One release updates both launcher and studio; user work lives outside the installation.
export function createUpdater({ updater, packaged, version, supported = true, emit = () => {}, intervalMs = 4 * 60 * 60 * 1000 }) {
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
    'update-available': (info) => set({ phase: 'downloading', nextVersion: info.version, percent: 0, error: null }),
    'download-progress': (p) => set({ phase: 'downloading', percent: Math.max(0, Math.min(100, Number(p.percent) || 0)) }),
    'update-downloaded': (info) => set({ phase: 'ready', nextVersion: info.version, percent: 100, error: null }),
    error: failed,
  };
  for (const [event, fn] of Object.entries(listeners)) updater.on(event, fn);
  async function check() {
    if (disposed || installing || ['ready', 'downloading'].includes(state.phase)) return status();
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      set({ phase: 'checking', error: null });
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
      try { updater.quitAndInstall(false, true); return true; }
      catch (e) { installing = false; failed(e); return false; }
    },
    dispose() { disposed = true; clearInterval(timer); for (const [event, fn] of Object.entries(listeners)) updater.removeListener(event, fn); },
  };
}
