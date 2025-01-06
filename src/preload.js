const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendCommand: (command) => ipcRenderer.send('command', command),
});
