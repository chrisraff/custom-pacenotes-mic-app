const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  updateStatus: (callback) => ipcRenderer.on('update-status', callback),
});
