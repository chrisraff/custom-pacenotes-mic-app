import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import isDev from 'electron-is-dev';
import { app, BrowserWindow, ipcMain } from 'electron';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

import ffmpegStatic from 'ffmpeg-static';

const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');

// Set fluent-ffmpeg to use the bundled FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// status to share with gui
let recording = false;
let missionPath = null;
let outputPath = null;
let pacenote_index = -1;
let hostingStatus = '⏳ Setting up server...';
let isHosting = false;
let isConnected = false;

function getAssetPath(asset) {
  return isDev
    ? path.join(__dirname, asset)
    : path.join(process.resourcesPath, 'app.asar/src', asset);
}

let confirmSound = null;
try {
  const soundPath = getAssetPath('assets/sounds/rp_confirm.wav');
  confirmSound = fs.readFileSync(soundPath);
} catch (error) {
  console.error('Error loading confirm sound:', error);
}

let preWarmSound = null;
try {
  const soundPath = getAssetPath('assets/sounds/prewarm.webm');
  preWarmSound = fs.readFileSync(soundPath);
} catch (error) {
  console.error('Error loading prewarm sound:', error);
}

// Start Electron's UI
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: getAssetPath('assets/images/mic-server.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!isDev)
    mainWindow.removeMenu();

  mainWindow.loadFile('src/index.html');

  mainWindow.webContents.once('did-finish-load', () => {
    guiUpdateStatus({version: app.getVersion()});

    if (!!confirmSound) {
      mainWindow.webContents.send('audio-data-confirm', confirmSound);
    }
  });
});

function logWithTimestamp(...message) {
  const now = new Date();
  const timestamp = now.toISOString(); // Format: YYYY-MM-DDTHH:mm:ss.sssZ
  console.log(`[${timestamp}]`);
  console.log(...message);
}

// Socket server logic
const server = net.createServer((clientSocket) => {
  logWithTimestamp('Client connected:', clientSocket.remoteAddress, clientSocket.remotePort);
  isConnected = true;
  guiUpdateStatus();

  clientSocket.on('data', (data) => {
    const message = data.toString('utf-8').trim();
    logWithTimestamp('Received message:\n', message, '\n=====================');

    const lines = message.split('\n');
    lines.forEach((line) => {
      mainWindow.webContents.send('add-terminal-entry', line);

      const parts = line.split(' ');

      if (parts.length === 0) return;

      switch (parts[0]) {
        case 'mission':
          missionPath = parts[1];
          logWithTimestamp('Mission path set to:', missionPath);
          break;

        case 'data_path':
          outputPath = parts[1];
          logWithTimestamp('Output path set to:', outputPath);
          break;

        case 'record_start':
          if (!missionPath || !outputPath) {
            logWithTimestamp('Mission path or output path not set. Cannot start recording.');
            return;
          }
          recording = true;
          pacenote_index++;
          mainWindow.webContents.send('start-recording');
          break;

        case 'record_stop':
          recording = false;
          logWithTimestamp('Recording stopped.');
          mainWindow.webContents.send('stop-recording');
          break;

        case 'mission_end':
          missionPath = null;
          logWithTimestamp('Mission ended.');
          break;

        case 'reset_count':
          pacenote_index = parts[1] ? parseInt(parts[1]) - 1 : -1;
          logWithTimestamp('Counter reset. Current value:', pacenote_index);
          break;

        default:
          logWithTimestamp('Unknown command:', parts[0]);
          break;
        }

      logWithTimestamp('Updating UI');

      // Send update to renderer.
      guiUpdateStatus();
    });
  });

  clientSocket.on('end', () => {
    logWithTimestamp('Client disconnected.');
    isConnected = false;
    guiUpdateStatus();
  });

  clientSocket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('Server port already occupied.');
    hostingStatus = "⚠️ Trying to set up server... Is another mic server running?";
    guiUpdateStatus();
    setTimeout(() => {
      server.close();
      server.listen(PORT, '127.0.0.1');
    }, 1000);
  } else {
    console.error(err.message);
    hostingStatus = "❌ Server couldn't start. Please restart."
    guiUpdateStatus();
  }
})

const PORT = 43434;
server.listen(PORT, '127.0.0.1', () => {
  logWithTimestamp(`Socket server running on 127.0.0.1:${PORT}`);
  isHosting = true;
  hostingStatus = "Server Ready";
  guiUpdateStatus();
});

function guiUpdateStatus(additionalStatus = {}) {
  if (!mainWindow)
    return;

  mainWindow.webContents.send('update-status', {
    missionPath,
    outputPath,
    recording,
    counter: pacenote_index,
    isHosting,
    hostingStatus,
    isConnected,
    ...additionalStatus,
  });
}

ipcMain.on('save-audio', async (_, arrayBuffer) => {
  const wavData = await convertWebmToOgg(Buffer.from(arrayBuffer));

  const pacenotesDir = outputPath ? path.join(outputPath, missionPath, 'pacenotes') : null;
  if (!fs.existsSync(pacenotesDir)) {
    fs.mkdirSync(pacenotesDir, { recursive: true });
    logWithTimestamp('Pacenotes directory created:', pacenotesDir);
  }

  // const filePath = pacenotesDir ? path.join(pacenotesDir, `pacenote_${pacenote_index}.wav`) : null;
  const filePath = pacenotesDir ? path.join(pacenotesDir, `pacenote_${pacenote_index}.ogg`) : null;

  if (filePath) {
    fs.writeFileSync(filePath, wavData);
    logWithTimestamp('Audio saved to:', filePath);
  }
});

async function convertWebmToOgg(rawWebmDataBuffer) {
  return new Promise((resolve, reject) => {
    // Create a readable stream from the raw WebM data
    const inputStream = new PassThrough();
    inputStream.end(Buffer.from(rawWebmDataBuffer));

    // Create an output stream to collect the OGG data
    const outputStream = new PassThrough();
    const oggChunks = [];
    let errorOccurred = false;

    outputStream.on('data', (chunk) => oggChunks.push(chunk));

    // Wait to resolve or reject until FFmpeg finishes
    outputStream.on('end', () => {
      if (errorOccurred) {
        console.error('Skipping saving due to FFmpeg error.');
        return; // Prevent saving if an error occurred
      }
      logWithTimestamp('OGG conversion finished');
      const oggBuffer = Buffer.concat(oggChunks);
      resolve(oggBuffer); // Only resolve if no errors occurred
    });

    outputStream.on('error', (err) => {
      console.error('Error during OGG conversion:', err);
      errorOccurred = true; // Mark that an error occurred
      reject(err); // Reject the Promise on output stream error
    });

    logWithTimestamp('Starting ffmpeg conversion');
    ffmpeg(inputStream)
      .format('ogg')
      .on('error', (err) => {
        logWithTimestamp('ffmpeg error');
        console.error('FFmpeg Error:', err);
        errorOccurred = true;
        reject(err); // Reject the Promise and mark an error
      })
      .on('end', () => {
        // Ensure FFmpeg process has completed before checking for errors
        if (!errorOccurred) {
          outputStream.end(); // Manually end the stream if no errors
          logWithTimestamp('ffmpeg operation completed');

          mainWindow.webContents.send('audio-play-confirm');
        }
      })
      .pipe(outputStream, { end: false }); // Prevent auto-ending the output stream
  });
}

// FFmpeg can be slow on first use, so we pre-warm it with a dummy conversion
function warmupFFmpeg(webmBuffer) {
  const tempDir = os.tmpdir(); // System temporary directory
  const outputPath = path.join(tempDir, 'temp.ogg'); // Temporary output file

  const inputStream = Readable.from(webmBuffer);

  logWithTimestamp('Prewarming FFmpeg');

  return new Promise((resolve, reject) => {
    ffmpeg(inputStream)
      .inputFormat('webm')
      .format('ogg')
      .output(outputPath)
      .on('end', () => {
        logWithTimestamp('FFmpeg warm-up complete');
        fs.unlink(outputPath, (err) => {
          if (err) {
            console.error('Error cleaning up temp file:', err);
          }
        });
        resolve();
      })
      .on('error', (err) => {
        console.error('FFmpeg warm-up error:', err);
        reject(err);
      })
      .run();
  });
}

if (!!preWarmSound) {
  warmupFFmpeg(preWarmSound)
    .then(() => logWithTimestamp('FFmpeg is warmed up and ready'))
    .catch((err) => console.error('FFmpeg warm-up failed:', err));
}
