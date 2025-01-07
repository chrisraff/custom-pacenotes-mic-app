const net = require('net');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

let mainWindow;
let recording = false;
let missionPath = null;
let outputPath = null;
let pacenotesPath = 'pacenotes';
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
  const buffer = Buffer.from(arrayBuffer);


  const pacenotesDir = outputPath ? path.join(outputPath, missionPath, 'pacenotes') : null;
  if (!fs.existsSync(pacenotesDir)) {
    fs.mkdirSync(pacenotesDir, { recursive: true });
    console.log('Pacenotes directory created:', pacenotesDir);
  }

  const filePath = pacenotesDir ? path.join(pacenotesDir, `pacenote_${pacenote_index}.webm`) : null;

  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(buffer.buffer));
    console.log('Audio saved to:', filePath);
  }
});
