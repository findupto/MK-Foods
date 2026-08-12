# MK Foods POS — Windows Setup

## Requirements

Install Node.js LTS once on the Windows machine. No global Electron installation is required.

## First run

Double-click:

`setup-windows.bat`

The script checks Node.js/npm, installs the project's pinned dependencies including Electron, and launches the POS.

## Every run

Double-click:

`run-pos.bat`

If dependencies are missing, it installs them automatically before launching the POS.

## Command line

You can also use:

```bat
npm install --include=dev
npm start
```

The project pins Electron and electron-builder versions so dependency resolution is repeatable. Do not install Electron globally.

## Troubleshooting

If Windows says `node` or `npm` is not recognized, install Node.js LTS and restart the terminal. If npm installation fails, run `setup-windows.bat` from a normal writable project directory and check the displayed npm error.
