const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  updateStatus: (callback) => ipcRenderer.on('update-status', callback),
  startRecording: (callback) => ipcRenderer.on('start-recording', callback),
  stopRecording: (callback) => ipcRenderer.on('stop-recording', callback),
  playSound: (callback) => ipcRenderer.on('play-sound', callback),
  saveAudio: (buffer) => ipcRenderer.send('save-audio', buffer),
});
