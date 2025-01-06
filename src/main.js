const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'src/preload.js'),
    },
  });

  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(() => {
  createWindow();
});

// Simple server
const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      console.log('Command received:', body);
      res.writeHead(200);
      res.end('Command received');
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(43434, '127.0.0.1');

app.on('quit', () => {
  // TODO clean up audio stuff
  server.close();
});
