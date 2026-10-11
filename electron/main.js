// Content Chef desktop app. Starts the same local editor server in-process (localhost, a free
// port) and shows it in a native window with an integrated title bar. User work lives in
// Documents/Content Chef so the app folder can stay read-only.
import { app, BrowserWindow, shell, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Installed app: Documents/Content Chef. Running from source (`npm run desktop`): the project folder.
if (app.isPackaged) process.env.CONTENT_CHEF_HOME ||= path.join(app.getPath('documents'), 'Content Chef');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let server = null;
const BG = { dark: '#09090c', light: '#eceef3' };
const overlay = (dark) => ({ color: '#00000000', symbolColor: dark ? '#eeeef3' : '#14141a', height: 58 });

async function createWindow() {
  // Imported after CONTENT_CHEF_HOME is set so the core picks up the right workspace.
  const { startServer } = await import('../src/server.js');
  const started = await startServer({ port: 0 });
  server = started.server;
  const dark = nativeTheme.shouldUseDarkColors;

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    show: false,
    title: 'Content Chef',
    backgroundColor: dark ? BG.dark : BG.light,
    icon: path.join(here, '..', 'build', 'icon.png'),
    // Integrated title bar: the app's own top bar doubles as the window's drag area.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 21 } } : { titleBarOverlay: overlay(dark) }),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${started.port}/`);
  win.once('ready-to-show', () => win.show());

  // Links that open new windows (exported files, docs) go to the system browser / viewer.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // Never navigate the app window away from the editor.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${started.port}`)) { e.preventDefault(); shell.openExternal(url); }
  });
}

// The page tells us its theme so the native window buttons match.
ipcMain.on('theme', (_e, dark) => {
  if (!win) return;
  win.setBackgroundColor(dark ? BG.dark : BG.light);
  if (process.platform !== 'darwin') win.setTitleBarOverlay?.(overlay(dark));
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  try {
    const { closeBrowser } = await import('../src/core/index.js');
    await closeBrowser();
  } catch { /* nothing to close */ }
  server?.close();
  app.quit();
});

app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
