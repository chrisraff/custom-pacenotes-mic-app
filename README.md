# Custom Rally Pacenotes Mic App
This program is a standalone executable for recording pacenotes in combination with the Custom Rally Pacenotes mod for BeamNG.drive.

This program is built using Electron, and internally uses ffmpeg to convert the recorded audio to an `ogg` (so that BeamNG can play it back).

## Setup
`npm install`

## Run for development
`npm start`

## Build installer for distribution
`npx electron-builder --win`