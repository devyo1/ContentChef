// Launcher and studio share a release, runtime, and local workspace.
import { app, BrowserWindow, shell, ipcMain, nativeTheme, Menu, dialog, nativeImage, clipboard } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUpdater } from './updater.js';
import { publishPost, openLogin, forgetLogins, RECIPES } from './publisher.js';

const here = path.dirname(fileURLToPath(import.meta.url));
if (app.isPackaged) process.env.CONTENT_CHEF_HOME ||= path.join(app.getPath('documents'), 'Content Chef');
const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();
let launcher = null, studio = null, server = null, origin = null, updates = null;
let quitting = false, opening = null;
const overlay = (dark) => ({ color: '#00000000', symbolColor: dark ? '#eeeef3' : '#14141a', height: 58 });
const focus = (win) => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } };
function openExternal(url) {
  try { if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch { /* not a web link */ }
}
function makeWindow(isLauncher) {
  const dark = isLauncher || nativeTheme.shouldUseDarkColors;
  const win = new BrowserWindow({
    width: isLauncher ? 1140 : 1440, height: isLauncher ? 790 : 900,
    minWidth: isLauncher ? 800 : 980, minHeight: isLauncher ? 680 : 620,
    show: false, title: isLauncher ? 'Content Chef Launcher' : 'Content Chef',
    backgroundColor: dark ? '#09090c' : '#eceef3', icon: path.join(here, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 21 } } : { titleBarOverlay: overlay(dark) }),
    webPreferences: { preload: path.join(here, isLauncher ? 'launcher-preload.cjs' : 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: !isLauncher },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => {
    const expected = `${origin}/${isLauncher ? 'launcher.html' : ''}`;
    if (url !== expected) { event.preventDefault(); openExternal(url); }
  });
  return win;
}
async function openStudio() {
  if (studio && !studio.isDestroyed()) { focus(studio); launcher?.hide(); return; }
  if (opening) return opening;
  opening = (async () => {
    studio = makeWindow(false);
    const window = studio;
    window.on('closed', () => { studio = null; if (!quitting) focus(launcher); });
    try { await window.loadURL(`${origin}/`); focus(window); launcher?.hide(); }
    catch (err) { window.destroy(); throw err; }
  })().finally(() => { opening = null; });
  return opening;
}
function fromWindow(event, win, pathname) {
  return win && !win.isDestroyed() && event.sender === win.webContents
    && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === `${origin}${pathname}`;
}
function handle(channel, work) {
  ipcMain.handle(channel, async (event) => {
    if (!fromWindow(event, launcher, '/launcher.html')) throw new Error('Unknown launcher window');
    return work();
  });
}
ipcMain.on('theme', (event, dark) => {
  if (!fromWindow(event, studio, '/')) return;
  studio.setBackgroundColor(dark ? '#09090c' : '#eceef3');
  if (process.platform !== 'darwin') studio.setTitleBarOverlay(overlay(!!dark));
});
ipcMain.on('launcher:show', (event) => { if (fromWindow(event, studio, '/')) focus(launcher); });
// Only files Content Chef rendered (inside the output folder) can be dragged out or copied.
let outputDir = null;
function outputFile(rel) {
  if (!outputDir || typeof rel !== 'string') return null;
  const file = path.resolve(outputDir, rel);
  return file.startsWith(outputDir + path.sep) ? file : null;
}
ipcMain.on('file:drag', (event, rel) => {
  const file = fromWindow(event, studio, '/') && outputFile(rel);
  if (!file) return;
  const icon = nativeImage.createFromPath(file);
  // Videos have no thumbnail here: use the app icon so the drag still shows something.
  event.sender.startDrag({ file, icon: (icon.isEmpty() ? nativeImage.createFromPath(path.join(here, '../build/icon.png')) : icon).resize({ width: 96 }) });
});
// One-click publishing: the studio asks for a post to go to a platform; files must be renders in output/.
ipcMain.handle('publish:post', async (event, req) => {
  if (!fromWindow(event, studio, '/')) throw new Error('Unknown window');
  const files = (Array.isArray(req?.files) ? req.files : []).map(outputFile);
  if (!files.length || files.some((f) => !f)) throw new Error('Nothing to publish');
  if (!RECIPES[req.platform]) throw new Error(`Publishing to ${req.platform} isn't supported yet`);
  return publishPost({ platform: req.platform, files, caption: String(req.caption ?? '').slice(0, 5000), autoPost: req.autoPost === true, parent: studio });
});
ipcMain.handle('publish:login', (event, platform) => { if (fromWindow(event, studio, '/')) openLogin(String(platform), { parent: studio }); });
ipcMain.handle('publish:forget', (event) => (fromWindow(event, studio, '/') ? forgetLogins() : null));
ipcMain.handle('file:copy-image', async (event, rel) => {
  const file = fromWindow(event, studio, '/') && outputFile(rel);
  const img = file && nativeImage.createFromPath(file);
  if (!img || img.isEmpty()) return false;
  await clipboard.writeImage(img);
  return true;
});
async function start() {
  await app.whenReady();
  const { startServer } = await import('../src/server.js');
  const { HOME, OUTPUT_DIR } = await import('../src/core/paths.js');
  outputDir = path.resolve(OUTPUT_DIR);
  const started = await startServer({ port: 0 });
  server = started.server;
  origin = `http://127.0.0.1:${started.port}`;
  launcher = makeWindow(true);
  launcher.on('close', (event) => {
    if (studio && !studio.isDestroyed() && !quitting) { event.preventDefault(); launcher.hide(); focus(studio); }
  });
  updates = createUpdater({ updater: electronUpdater.autoUpdater, packaged: app.isPackaged, version: app.getVersion(),
    supported: process.platform !== 'linux' || !!process.env.APPIMAGE,
    emit: (state) => { if (launcher && !launcher.isDestroyed()) launcher.webContents.send('launcher:update', state); },
  });
  handle('launcher:state', () => ({ version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, workspace: HOME, update: updates.status() }));
  handle('launcher:open', openStudio);
  handle('launcher:workspace', async () => { const error = await shell.openPath(HOME); if (error) throw new Error(error); });
  handle('launcher:check', () => updates.check());
  handle('launcher:install', () => {
    if (studio && !studio.isDestroyed()) throw new Error('Close the studio before restarting to update.');
    return updates.install();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Content Chef', submenu: [
      { label: 'Launcher', click: () => focus(launcher) },
      { label: 'Open studio', click: () => { void openStudio().catch((e) => dialog.showErrorBox('Could not open studio', e.message)); } },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' },
  ]));
  await launcher.loadURL(`${origin}/launcher.html`);
  focus(launcher);
  void updates.check();
}
app.on('second-instance', () => focus(studio ?? launcher));
app.on('activate', () => focus(studio ?? launcher));
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { updates?.dispose(); server?.close(); void import('../src/core/renderer.js').then((m) => m.closeBrowser()).catch(() => {}); });
app.on('window-all-closed', () => app.quit());
if (ownsLock) void start().catch((err) => { dialog.showErrorBox('Content Chef could not start', err.message); app.quit(); });
