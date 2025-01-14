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

window.electronAPI.playSound(async (event, sound) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const audioBuffer = await audioContext.decodeAudioData(sound.buffer);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    source.connect(audioContext.destination);

    source.start();
  } catch (error) {
    console.error('Error playing WAV data:', error);
  }
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
    setMic(micSelect.value)
  }
}

// Handle microphone selection change
document.getElementById('micSelect').addEventListener('change', (event) => {
  setMic(event.target.value);
});

function setMic(value) {
  if (value == selectedDeviceId)
    return;

  selectedDeviceId = value;

  document.getElementById('micSelect').value = value;

  if (monitoring)
  {
    stopMonitor();
    startMonitor();
  }
}

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

let monitoring = false
// Mic test
function toggleMicMonitor() {
  if (monitoring) {
    stopMonitor();

    monitoring = false;

    document.querySelector('#micTest').textContent = 'Start Mic Test';
    document.querySelector('#micTestData').classList.add('hidden');

  } else {
    startMonitor();

    monitoring = true;

    document.querySelector('#micTest').textContent = 'Stop Mic Test';
    document.querySelector('#micTestData').classList.remove('hidden');
  }
}

let monitorAudioContext;
let monitorGain;
let monitorMic;
let monitorAnalyser;

async function startMonitor() {
  // Check if already monitoring
  if (monitorAudioContext) {
    return;
  }

  // Access the microphone stream
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined },
  });

  // Create an audio context
  monitorAudioContext = new AudioContext();

  // Create a source from the microphone stream
  monitorMic = monitorAudioContext.createMediaStreamSource(stream);

  monitorAnalyser = monitorAudioContext.createAnalyser();

  monitorMic.connect(monitorAnalyser);

  // Configure the analyser
  monitorAnalyser.fftSize = 256; // The size of the FFT. Smaller = smoother bar
  const dataArray = new Uint8Array(monitorAnalyser.frequencyBinCount);

  const volumeBar = document.getElementById('volumeBar');

  function updateVolumeBar() {
    monitorAnalyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const avg = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

    // Update bar width based on average volume
    volumeBar.style.width = `${avg}%`;

    // Call again for the next animation frame
    if (monitoring)
      requestAnimationFrame(updateVolumeBar);
  }
  updateVolumeBar(); // Start the loop

  // Create a gain node for controlling volume
  monitorGain = monitorAudioContext.createGain();
  monitorGain.gain.value = 1.0;

  // Connect the microphone to the gain node and then to the audio context's destination
  monitorMic.connect(monitorGain);
  monitorGain.connect(monitorAudioContext.destination);
}

function stopMonitor() {
  if (monitorAudioContext) {
    // Disconnect all nodes and close the audio context
    monitorMic.disconnect();
    monitorGain.disconnect();
    monitorAnalyser.disconnect();
    monitorAudioContext.close();

    monitorAudioContext = null;
    monitorMic = null;
    monitorGain = null;
  }
}
