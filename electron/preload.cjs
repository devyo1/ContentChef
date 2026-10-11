// Minimal bridge between the editor page and the desktop shell. The page stays a normal web
// app; this only lets it match the native window chrome to its theme.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  setDark: (dark) => ipcRenderer.send('theme', !!dark),
});
