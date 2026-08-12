# MK Foods POS - Windows Build

## One-click installer build

From the project folder, double-click:

`build-windows.bat`

It automatically:

1. Adds the user Rust/Cargo directory to PATH for this build.
2. Checks Node.js, npm, Cargo and Rustc.
3. Installs/repairs the npm/Tauri dependencies.
4. Creates the MK Foods application icon when it is missing.
5. Validates Cargo metadata.
6. Builds the production Tauri application.
7. Builds the NSIS Windows setup EXE.
8. Copies the final installer to:

`dist\MK-Foods-POS-Windows-Setup-x64.exe`

9. Opens the `dist` folder automatically when finished.

## Installer behavior

The NSIS installer is configured for a normal Windows installation flow with a selectable installation location, system-wide installation, Start Menu/Desktop shortcuts, uninstall registration and WebView2 handling when required.

The application itself is built as a Windows GUI application, so the installed POS does not open a command prompt behind it.

## Supported Windows target

The default build is **64-bit Windows (x64)**. Tauri supports Windows 10 and Windows 11; the WebView2 installer handles the runtime when required.

## Manual command

If everything is already installed and the icon has been generated, the equivalent command is:

`npx tauri build --bundles nsis`

Do not type `tauri-cli 2.x.x` as a command. `npx tauri --version` prints the installed CLI version; it is output, not a command.
