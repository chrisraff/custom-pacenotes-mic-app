// TODO handle index.html stuff here

window.electronAPI.updateStatus((event, status) => {
  document.getElementById('last-command').textContent = `Last Command: ${status.lastCommand}`;
  document.getElementById('mission-path').textContent = `Mission Path: ${status.missionPath || 'Not set'}`;
  document.getElementById('output-path').textContent = `Output Path: ${status.outputPath || 'Not set'}`;
  document.getElementById('recording').textContent = `Recording: ${status.recording ? 'Yes' : 'No'}`;
  document.getElementById('counter').textContent = `Counter: ${status.counter}`;
});
