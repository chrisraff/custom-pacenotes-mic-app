const net = require('net');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { PassThrough } = require('stream');
const ffmpeg = require('fluent-ffmpeg');

const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

// Set fluent-ffmpeg to use the bundled FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;
let recording = false;
let missionPath = null;
let outputPath = null;
let pacenote_index = -1;

// Start Electron's UI
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('src/index.html');

  playSound('src/assets/sounds/confirm.wav');
});

// Socket server logic
const server = net.createServer((clientSocket) => {
  console.log('Client connected:', clientSocket.remoteAddress, clientSocket.remotePort);

  clientSocket.on('data', (data) => {
    const message = data.toString('utf-8').trim();
    console.log('Received message:\n', message, '\n=====================');

    const lines = message.split('\n');
    lines.forEach((line) => {
      const parts = line.split(' ');

      if (parts.length === 0) return;

      switch (parts[0]) {
        case 'mission':
          missionPath = parts[1];
          console.log('Mission path set to:', missionPath);
          break;

        case 'data_path':
          outputPath = parts[1];
          console.log('Output path set to:', outputPath);
          break;

        case 'record_start':
          if (!missionPath || !outputPath) {
            console.log('Mission path or output path not set. Cannot start recording.');
            return;
          }
          recording = true;
          pacenote_index++;
          mainWindow.webContents.send('start-recording');
          break;

        case 'record_stop':
          recording = false;
          console.log('Recording stopped.');
          mainWindow.webContents.send('stop-recording');
          break;

        case 'mission_end':
          missionPath = null;
          console.log('Mission ended.');
          break;

        case 'reset_count':
          pacenote_index = parts[1] ? parseInt(parts[1]) - 1 : -1;
          console.log('Counter reset. Current value:', pacenote_index);
          break;

        default:
          console.log('Unknown command:', parts[0]);
          break;
        }

      console.log('Updating UI');
      // Send update to renderer
      mainWindow.webContents.send('update-status', {
        lastCommand: message,
        missionPath,
        outputPath,
        recording,
        counter: pacenote_index,
      });
    });
  });

  clientSocket.on('end', () => {
    console.log('Client disconnected.');
  });

  clientSocket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

// Start the server
const PORT = 43434;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Socket server running on 127.0.0.1:${PORT}`);
});
ipcMain.on('save-audio', async (_, arrayBuffer) => {
  const wavData = await convertWebmToOgg(Buffer.from(arrayBuffer));

  const pacenotesDir = outputPath ? path.join(outputPath, missionPath, 'pacenotes') : null;
  if (!fs.existsSync(pacenotesDir)) {
    fs.mkdirSync(pacenotesDir, { recursive: true });
    console.log('Pacenotes directory created:', pacenotesDir);
  }

  // const filePath = pacenotesDir ? path.join(pacenotesDir, `pacenote_${pacenote_index}.wav`) : null;
  const filePath = pacenotesDir ? path.join(pacenotesDir, `pacenote_${pacenote_index}.ogg`) : null;

  if (filePath) {
    fs.writeFileSync(filePath, wavData);
    console.log('Audio saved to:', filePath);
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
      console.log('OGG conversion finished');
      const oggBuffer = Buffer.concat(oggChunks);
      resolve(oggBuffer); // Only resolve if no errors occurred
    });

    outputStream.on('error', (err) => {
      console.error('Error during OGG conversion:', err);
      errorOccurred = true; // Mark that an error occurred
      reject(err); // Reject the Promise on output stream error
    });

    ffmpeg(inputStream)
      .format('ogg')
      .on('error', (err) => {
        console.error('FFmpeg Error:', err);
        errorOccurred = true;
        reject(err); // Reject the Promise and mark an error
      })
      .on('end', () => {
        // Ensure FFmpeg process has completed before checking for errors
        if (!errorOccurred) {
          outputStream.end(); // Manually end the stream if no errors
        }
      })
      .pipe(outputStream, { end: false }); // Prevent auto-ending the output stream
  });
}
