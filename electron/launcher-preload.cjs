const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chefLauncher', {
  state: () => ipcRenderer.invoke('launcher:state'),
  openStudio: () => ipcRenderer.invoke('launcher:open'),
  openWorkspace: () => ipcRenderer.invoke('launcher:workspace'),
  checkUpdates: () => ipcRenderer.invoke('launcher:check'),
  installUpdate: () => ipcRenderer.invoke('launcher:install'),
  onUpdate: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('launcher:update', handler);
    return () => ipcRenderer.removeListener('launcher:update', handler);
  },
});
