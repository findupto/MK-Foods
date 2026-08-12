# MK Foods POS — Windows Setup

## Requirements

Install:

- Node.js LTS
- Rust with the MSVC toolchain
- Microsoft C++ Build Tools with **Desktop development with C++**
- Microsoft Edge WebView2 (already present on most supported Windows 10/11 systems)

Tauri does **not** require Electron or a global Electron installation. See the official Tauri Windows prerequisites documentation for the current requirements.

## First run

Double-click:

`setup-windows.bat`

The script checks Node.js/npm and Cargo, installs the Tauri CLI, and launches the POS with Tauri.

## Every run

Double-click:

`run-pos.bat`

If the Tauri CLI is missing, it installs the project's development dependencies automatically before launching the POS.

## Command line

```bat
npm install --include=dev
npm start
```

Build the Windows NSIS installer with:

```bat
npm run build
```

## Troubleshooting

If Windows says `node`, `npm`, or `cargo` is not recognized, install the missing prerequisite and restart the terminal. If the Tauri build fails while compiling native code, confirm that the Microsoft C++ Build Tools workload is installed.
