let selectedDeviceId = null;
let mediaRecorder = null;
let audioChunks = [];

window.electronAPI.updateStatus((event, status) => {
  document.getElementById('last-command').textContent = `Last Command: ${status.lastCommand}`;
  document.getElementById('mission-path').textContent = `Mission Path: ${status.missionPath || 'Not set'}`;
  document.getElementById('output-path').textContent = `Output Path: ${status.outputPath || 'Not set'}`;
  document.getElementById('recording').textContent = `Recording: ${status.recording ? 'Yes' : 'No'}`;
  document.getElementById('counter').textContent = `Counter: ${status.counter}`;
});

window.electronAPI.startRecording((event) => {
  startRecording();
});
window.electronAPI.stopRecording((event) => {
  stopRecording();
});

document.addEventListener('DOMContentLoaded', () => {
  populateMicrophoneList();
});

// Populate microphone list
async function populateMicrophoneList() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const micSelect = document.getElementById('micSelect');

  // Store the currently selected device ID
  const previousSelectedDeviceId = micSelect.value;

  micSelect.innerHTML = ''; // Clear existing options

  let isPreviousDeviceStillAvailable = false;

  devices
    .filter(device => device.kind === 'audioinput')
    .forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      micSelect.appendChild(option);

      // Check if the previously selected device is still available
      if (device.deviceId === previousSelectedDeviceId) {
        isPreviousDeviceStillAvailable = true;
      }
    });

  // Reapply the previous selection if the device is still available
  if (isPreviousDeviceStillAvailable) {
    micSelect.value = previousSelectedDeviceId;
  } else {
    // Update `selectedDeviceId` to the new default if previous is unavailable
    console.warn('Previously selected device is no longer available. Selecting the first available microphone.');
    selectedDeviceId = micSelect.value;
  }
}

// Handle microphone selection change
document.getElementById('micSelect').addEventListener('change', (event) => {
  selectedDeviceId = event.target.value;
});

// Start recording
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined },
  });

  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    console.log('Recording stopped. Saving audio...');
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    // Send audio to main process for saving
    window.electronAPI.saveAudio(arrayBuffer);

    audioChunks = []; // Clear chunks for the next recording
  };

  mediaRecorder.start();
  console.log('Recording started...');
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    console.log('Recording stopped.');
  }
}
