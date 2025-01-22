const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  updateStatus: (callback) => ipcRenderer.on('update-status', callback),
  addTerminalEntry: (callback) => ipcRenderer.on('add-terminal-entry', callback),
  startRecording: (callback) => ipcRenderer.on('start-recording', callback),
  stopRecording: (callback) => ipcRenderer.on('stop-recording', callback),
  playSound: (callback) => ipcRenderer.on('play-sound', callback),
  audioDataConfirm: (callback) => ipcRenderer.on('audio-data-confirm', callback),
  audioPlayConfirm: (callback) => ipcRenderer.on('audio-play-confirm', callback),
  saveAudio: (buffer) => ipcRenderer.send('save-audio', buffer),
});
