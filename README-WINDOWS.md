# MK Foods POS - Windows Build

## Runtime architecture

MK Foods POS is a **Tauri 2** desktop application. It does not use Electron or Vite as its desktop runtime.

Before starting development, run:

`npm run verify:runtime`

This verifies the Node version, Tauri CLI dependency and the absence of Electron/Vite runtime contamination.

If an older checkout still reports commands such as `electron .`, `electron:dev`, `vite --host` or a package name other than `mk-foods-pos`, update the checkout to the current `main` branch before reinstalling dependencies.

For a stale Windows dependency tree, after confirming any local work is backed up, use:

`git fetch origin`

`git checkout main`

`git pull --ff-only origin main`

`rmdir /s /q node_modules`

`del /q package-lock.json 2>nul`

`npm install --include=dev`

`npm run verify:runtime`

`npm run dev`

Do **not** run `npm audit fix --force` as a repair step; it can introduce unrelated breaking dependency upgrades.

## One-click installer build

From the project folder, double-click:

`build-windows.bat`

It automatically:

1. Checks Node.js, npm, Cargo and Rustc.
2. Detects Visual Studio and initializes the matching MSVC developer environment.
3. Installs/repairs the npm/Tauri dependencies.
4. Runs the project test suite before building.
5. Installs the x64, x86 and ARM64 Rust Windows targets when missing.
6. Creates the MK Foods application icon when it is missing.
7. Validates Cargo metadata.
8. Builds the production Tauri application for each Windows architecture.
9. Builds the NSIS Windows setup EXE for each architecture.
10. Copies the final installers to:

`dist\MK-Foods-POS-Windows-Setup-x64.exe`

`dist\MK-Foods-POS-Windows-Setup-x86.exe`

`dist\MK-Foods-POS-Windows-Setup-ARM64.exe`

11. Opens the `dist` folder automatically when finished.

## Required build tools

The installer build uses `rusqlite` with bundled SQLite, so a working MSVC C/C++ compiler is required even when Rust itself is installed correctly.

Install **Visual Studio Build Tools** or Visual Studio with:

- Desktop development with C++
- MSVC C++ build tools
- Windows 10 or Windows 11 SDK
- ARM64 C++ tools if the ARM64 installer is required

The build script automatically locates Visual Studio through `vswhere.exe` and initializes the compiler environment separately for x64, x86 and ARM64. If the required workload is missing, it stops early with a clear message instead of failing several minutes into a Rust build.

## Installer behavior

The NSIS installer is configured for a normal Windows installation flow with a selectable installation location, system-wide installation, Start Menu/Desktop shortcuts, uninstall registration and WebView2 handling when required.

The application itself is built as a Windows GUI application, so the installed POS does not open a command prompt behind it.

## Supported Windows targets

The project can build **64-bit Windows (x64)**, **32-bit Windows (x86)** and **ARM64 Windows** installers. Tauri supports Windows 10 and Windows 11; the WebView2 bootstrapper handles the runtime when required.

For normal modern Windows PCs, use the x64 installer. Use ARM64 on Windows-on-ARM devices and x86 only for legacy 32-bit Windows systems.

## Manual command

If everything is already installed and the icon has been generated, the equivalent x64 command is:

`npx tauri build --bundles nsis`

For explicit targets:

`npx tauri build --bundles nsis --target x86_64-pc-windows-msvc`

`npx tauri build --bundles nsis --target i686-pc-windows-msvc`

`npx tauri build --bundles nsis --target aarch64-pc-windows-msvc`

Do not type `tauri-cli 2.x.x` as a command. `npx tauri --version` prints the installed CLI version; it is output, not a command.
