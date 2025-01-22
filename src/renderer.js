let selectedDeviceId = null;
let mediaRecorder = null;
let audioChunks = [];
let audioContext =  new (window.AudioContext || window.webkitAudioContext)();

let confirmSoundBuffer = null;

window.electronAPI.updateStatus((event, status) => {
  document.getElementById('mission-path').textContent = `Mission Path: ${status.missionPath || 'Not set'}`;
  document.getElementById('output-path').textContent = `Output Path: ${status.outputPath || 'Not set'}`;
  document.getElementById('counter').textContent = `Counter: ${status.counter}`;

  document.getElementById('serverStatusMessage').textContent = status.hostingStatus;
  document.getElementById('connectedStatus').classList.toggle('hidden', !status.isHosting);
  document.getElementById('recordingStatus').classList.toggle('hidden', !status.isHosting);

  document.getElementById('recordingLamp').classList.toggle('active', status.recording);
  document.getElementById('isConnectedLamp').classList.toggle('active', status.isConnected);
});

window.electronAPI.startRecording((event) => {
  startRecording();
});
window.electronAPI.stopRecording((event) => {
  stopRecording();
});

window.electronAPI.playSound(async (event, sound) => {
  try {
    const audioBuffer = await audioContext.decodeAudioData(sound.buffer);

    playSound(audioBuffer);
  } catch (error) {
    console.error('Error playing sound data:', error);
  }
});

window.electronAPI.audioDataConfirm(async (event, data) => {
  try {
    confirmSoundBuffer = await audioContext.decodeAudioData(data.buffer);
  } catch (error) {
    console.error('Error decoding confirm sound data:', error);
  }
});

window.electronAPI.audioPlayConfirm(async (event) => {
  if (confirmSoundBuffer) {
    playSound(confirmSoundBuffer);
  }
});

async function playSound(buffer) {
  const source = audioContext.createBufferSource();
  source.buffer = buffer;

  source.connect(audioContext.destination);

  logWithTimestamp('Starting to play sound');

  source.start();
}

function logWithTimestamp(...message) {
  const now = new Date();
  const timestamp = now.toISOString(); // Format: YYYY-MM-DDTHH:mm:ss.sssZ
  console.log(`[${timestamp}]`);
  console.log(...message);
}

document.addEventListener('DOMContentLoaded', () => {
  populateMicrophoneList();
});

// Populate microphone list
async function populateMicrophoneList() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const micSelect = document.getElementById('micSelect');

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
      if (device.deviceId === selectedDeviceId) {
        isPreviousDeviceStillAvailable = true;
      }
    });

  // Reapply the previous selection if the device is still available
  if (isPreviousDeviceStillAvailable) {
    micSelect.value = selectedDeviceId;
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
  logWithTimestamp('Setting mic to', value)

  if (value == selectedDeviceId)
    return;

  selectedDeviceId = value;

  document.getElementById('micSelect').value = value;

  if (isMonitoring)
  {
    stopMonitor();
    startMonitor();
  }

  localStorage.setItem('mic', value);
}

function loadMic() {
  const savedMic = localStorage.getItem('mic');
  if (savedMic) {
    setMic(savedMic);
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
    logWithTimestamp('Recording stopped. Saving audio...');
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    // Send audio to main process for saving
    window.electronAPI.saveAudio(arrayBuffer);

    audioChunks = []; // Clear chunks for the next recording
  };

  mediaRecorder.start();
  logWithTimestamp('Recording started...');
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    logWithTimestamp('Recording stopped.');
  }
}

let isMonitoring = false;
// Mic test
function toggleMicMonitor() {
  if (isMonitoring) {
    stopMonitor();

    document.querySelector('#micTest').textContent = 'Start Mic Test';
    document.querySelector('#micTestData').classList.add('hidden');

  } else {
    startMonitor();

    document.querySelector('#micTest').textContent = 'Stop Mic Test';
    document.querySelector('#micTestData').classList.remove('hidden');
  }
}

let monitorGain;
let monitorMic;
let monitorAnalyser;

async function startMonitor() {
  // Check if already monitoring
  if (isMonitoring) {
    return;
  }
  isMonitoring = true;

  // Access the microphone stream
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined },
  });

  // Create a source from the microphone stream
  monitorMic = audioContext.createMediaStreamSource(stream);

  monitorAnalyser = audioContext.createAnalyser();

  monitorMic.connect(monitorAnalyser);

  // Configure the analyser
  monitorAnalyser.fftSize = 256; // The size of the FFT. Smaller = smoother bar
  const dataArray = new Uint8Array(monitorAnalyser.frequencyBinCount);

  const volumeBar = document.querySelector('#volumeBar>div');

  function updateVolumeBar() {
    monitorAnalyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const avg = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

    // Update bar width based on average volume
    volumeBar.style.width = `${avg}%`;

    // Call again for the next animation frame
    if (isMonitoring)
      requestAnimationFrame(updateVolumeBar);
  }
  updateVolumeBar(); // Start the loop

  // Create a gain node for controlling volume
  monitorGain = audioContext.createGain();
  monitorGain.gain.value = 1.0;

  // Connect the microphone to the gain node and then to the audio context's destination
  monitorMic.connect(monitorGain);
  monitorGain.connect(audioContext.destination);
}

function stopMonitor() {
  if (isMonitoring) {
    monitorMic.disconnect();
    monitorGain.disconnect();
    monitorAnalyser.disconnect();

    monitorMic = null;
    monitorGain = null;

    isMonitoring = false;
  }
}

// On startup, load the saved theme from localStorage:
function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.body.setAttribute('data-theme', savedTheme);
  } else {
    // Fallback to system preference if no saved theme
    applySystemTheme();
  }
}

// Detect system theme on page load
function applySystemTheme() {
  const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

  // Apply the detected theme to the body element
  if (prefersDarkScheme.matches) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }
}

function applyTheme(theme) {
  theme = theme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const body = document.body;
  const currentTheme = body.getAttribute('data-theme') || 'dark';
  applyTheme(currentTheme === 'light' ? 'dark' : 'light');
}

// Load preferences
loadTheme();
loadMic();
