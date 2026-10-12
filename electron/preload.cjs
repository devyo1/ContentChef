// Minimal bridge between the editor page and the desktop shell. The page stays a normal web
// app; this only lets it match the native window chrome to its theme.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  setDark: (dark) => ipcRenderer.send('theme', !!dark),
  showLauncher: () => ipcRenderer.send('launcher:show'),
  // Posting kit: drag a finished post's image out into a browser composer, or copy it to the clipboard.
  // `file` is a path inside the output folder (as the Planner stores it).
  dragFile: (file) => ipcRenderer.send('file:drag', String(file)),
  copyImage: (file) => ipcRenderer.invoke('file:copy-image', String(file)),
  // One-click publishing: opens the platform's composer with the image(s) and caption filled in.
  publish: (req) => ipcRenderer.invoke('publish:post', { platform: String(req.platform), files: (req.files ?? []).map(String), caption: String(req.caption ?? ''), autoPost: req.autoPost === true }),
  publishLogin: (platform) => ipcRenderer.invoke('publish:login', String(platform)),
  publishForget: () => ipcRenderer.invoke('publish:forget'),
  publishPlatforms: ['instagram', 'facebook', 'x', 'linkedin', 'tiktok', 'pinterest'],
});
