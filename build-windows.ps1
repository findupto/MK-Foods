$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Out = Join-Path $Root 'dist'
$Targets = @(
    @{ Name = 'x64'; Target = 'x86_64-pc-windows-msvc'; VsArch = 'x64'; CompilerArch = 'x64' },
    @{ Name = 'x86'; Target = 'i686-pc-windows-msvc';   VsArch = 'x86'; CompilerArch = 'x86' },
    @{ Name = 'ARM64'; Target = 'aarch64-pc-windows-msvc'; VsArch = 'amd64_arm64'; CompilerArch = 'arm64' }
)

function Write-Step([string]$Text) {
    Write-Host "`n$Text" -ForegroundColor Cyan
    Write-Host ('-' * 63)
}

function Invoke-Native([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE`: $File $($Arguments -join ' ')" }
}

function Find-VsWhere {
    $candidates = @()
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe') }
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Microsoft Visual Studio\Installer\vswhere.exe') }
    $cmd = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += $cmd.Source }
    $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique | Select-Object -First 1
}

function Find-VisualStudio {
    $vswhere = Find-VsWhere
    if ($vswhere) {
        try {
            $path = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
            if ($path) { $path = ([string]$path).Trim() }
            if ($path -and (Test-Path -LiteralPath (Join-Path $path 'VC\Auxiliary\Build\vcvarsall.bat'))) { return $path }
        } catch { }
    }
    $roots = @()
    if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio') }
    if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'Microsoft Visual Studio') }
    foreach ($root in $roots | Where-Object { Test-Path -LiteralPath $_ }) {
        $matches = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue } |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'VC\Auxiliary\Build\vcvarsall.bat') } |
            Sort-Object FullName -Descending
        if ($matches) { return $matches[0].FullName }
    }
    throw 'Visual Studio C++ Build Tools with vcvarsall.bat could not be located.'
}

function Get-ShortPath([string]$Path) {
    if (-not ('MKFoods.NativeMethods' -as [type])) {
        Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MKFoods_NativeMethods {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern uint GetShortPathName(string lpszLongPath, StringBuilder lpszShortPath, int cchBuffer);
}
'@
    }
    $sb = New-Object System.Text.StringBuilder 1024
    $len = [MKFoods_NativeMethods]::GetShortPathName($Path, $sb, $sb.Capacity)
    if ($len -gt 0) { return $sb.ToString() }
    return $Path
}

function Import-VcVars([string]$VcVarsAll, [string]$Arch, [string]$CompilerArch) {
    Write-Host "Initializing MSVC environment: $Arch"

    # VS 18 BuildTools on this machine contains cmd batch logic that breaks when
    # invoked from the long Program Files (x86) path. Use the DOS 8.3 path first.
    $shortVcVars = Get-ShortPath $VcVarsAll
    $shortVsRoot = Get-ShortPath (Split-Path (Split-Path (Split-Path $VcVarsAll -Parent) -Parent) -Parent)
    Write-Host "MSVC short path: $shortVcVars"

    $tmp = Join-Path $env:TEMP ("mk-foods-vcvars-{0}.cmd" -f ([guid]::NewGuid().ToString('N')))
    $envFile = Join-Path $env:TEMP ("mk-foods-env-{0}.txt" -f ([guid]::NewGuid().ToString('N')))
    try {
        @"
@echo off
set "VSINSTALLDIR=$shortVsRoot"
call "$shortVcVars" $Arch > "$envFile" 2>&1
set "MK_VC_EXIT=%ERRORLEVEL%"
set > "$envFile.env"
echo %MK_VC_EXIT%> "$envFile.exit"
exit /b %MK_VC_EXIT%
"@ | Set-Content -LiteralPath $tmp -Encoding ASCII

        & cmd.exe /d /c $tmp
        $exitFile = "$envFile.exit"
        $savedExit = 255
        if (Test-Path -LiteralPath $exitFile) { $savedExit = [int](Get-Content -LiteralPath $exitFile -Raw).Trim() }
        $diagnostics = if (Test-Path -LiteralPath $envFile) { Get-Content -LiteralPath $envFile -Raw } else { '' }
        $envDump = "$envFile.env"

        if ($savedExit -eq 0 -and (Test-Path -LiteralPath $envDump)) {
            foreach ($line in Get-Content -LiteralPath $envDump) {
                $idx = $line.IndexOf('=')
                if ($idx -gt 0) {
                    $name = $line.Substring(0,$idx)
                    $value = $line.Substring($idx+1)
                    if ($name -notmatch '^(ERRORLEVEL|CD)$') { [Environment]::SetEnvironmentVariable($name,$value,'Process') }
                }
            }
        } else {
            Write-Host "vcvarsall failed with exit code $savedExit." -ForegroundColor DarkYellow
            if ($diagnostics) { Write-Host $diagnostics }
        }

        if ($savedExit -eq 0 -and (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
            Write-Host "MSVC compiler ready: $((Get-Command cl.exe).Source)" -ForegroundColor Green
            return
        }

        # Direct compiler fallback: locate the exact MSVC toolset and prepend its
        # bin/include/lib paths. This avoids all VS batch-file parsers entirely.
        $msvcRoot = Join-Path (Split-Path $VcVarsAll -Parent | Split-Path -Parent | Split-Path -Parent) 'Tools\MSVC'
        $toolset = Get-ChildItem -LiteralPath $msvcRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if (-not $toolset) { throw "MSVC toolset directory not found: $msvcRoot" }
        $bin = Join-Path $toolset.FullName "bin\Hostx64\$CompilerArch"
        if (-not (Test-Path -LiteralPath (Join-Path $bin 'cl.exe'))) {
            $bin = Join-Path $toolset.FullName "bin\Hostx86\$CompilerArch"
        }
        if (-not (Test-Path -LiteralPath (Join-Path $bin 'cl.exe'))) { throw "cl.exe for $CompilerArch was not found in $($toolset.FullName)." }

        $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
        $sdkVersion = Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Include') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        $sdkLib = Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Lib') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if (-not $sdkVersion -or -not $sdkLib) { throw "Windows 10/11 SDK was not found under $sdkRoot." }

        $include = @(
            (Join-Path $toolset.FullName 'include'),
            (Join-Path $sdkVersion.FullName 'ucrt'),
            (Join-Path $sdkVersion.FullName 'shared'),
            (Join-Path $sdkVersion.FullName 'um')
        ) -join ';'
        $libArch = switch ($CompilerArch) { 'x64' {'x64'} 'x86' {'x86'} 'arm64' {'arm64'} }
        $lib = @(
            (Join-Path $toolset.FullName "lib\$CompilerArch"),
            (Join-Path $sdkLib.FullName "ucrt\$libArch"),
            (Join-Path $sdkLib.FullName "um\$libArch")
        ) -join ';'
        $env:PATH = "$bin;$($toolset.FullName)\bin;$env:PATH"
        $env:INCLUDE = $include
        $env:LIB = $lib
        $env:VCToolsInstallDir = "$($toolset.FullName)\"
        $env:VCToolsVersion = $toolset.Name
        if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) { throw "Direct MSVC fallback could not activate cl.exe." }
        Write-Host "MSVC compiler ready via direct toolchain fallback: $((Get-Command cl.exe).Source)" -ForegroundColor Green
    }
    finally {
        Remove-Item -LiteralPath $tmp,$envFile,"$envFile.env","$envFile.exit" -Force -ErrorAction SilentlyContinue
    }
}

Write-Host '================================================================' -ForegroundColor Yellow
Write-Host '      MK FOODS POS - WINDOWS INSTALLER BUILD' -ForegroundColor Yellow
Write-Host '     x64 + x86 + ARM64 / NSIS / GUI INSTALLER' -ForegroundColor Yellow
Write-Host '================================================================' -ForegroundColor Yellow

try {
    Write-Step '[1/9] Checking Node.js / npm'
    $node = Get-Command node.exe -ErrorAction Stop
    $npm = Get-Command npm.cmd -ErrorAction Stop
    & $node.Source --version; & $npm.Source --version

    Write-Step '[2/9] Checking Rust / Cargo'
    $cargo = Get-Command cargo.exe -ErrorAction Stop
    $rustc = Get-Command rustc.exe -ErrorAction Stop
    $rustup = Get-Command rustup.exe -ErrorAction Stop
    & $cargo.Source --version; & $rustc.Source --version; & $rustup.Source --version

    Write-Step '[3/9] Detecting Visual Studio C++ MSVC tools'
    $vsInstall = Find-VisualStudio
    $vcvars = Join-Path $vsInstall 'VC\Auxiliary\Build\vcvarsall.bat'
    Write-Host "Visual Studio: $vsInstall"
    Write-Host "MSVC entry point: $vcvars"
    Import-VcVars $vcvars 'x64' 'x64'

    Write-Step '[4/9] Installing / repairing npm dependencies'
    Invoke-Native $npm.Source @('install','--include=dev')
    Write-Step '[5/9] Running project tests'
    Invoke-Native $npm.Source @('test')

    Write-Step '[6/9] Checking Tauri CLI and Windows targets'
    $npx = Get-Command npx.cmd -ErrorAction Stop
    Invoke-Native $npx.Source @('--no-install','tauri','--version')
    foreach ($entry in $Targets) { Invoke-Native $rustup.Source @('target','add',$entry.Target) }

    Write-Step '[7/9] Preparing application icon'
    $icons = Join-Path $Root 'src-tauri\icons'; New-Item -ItemType Directory -Force -Path $icons | Out-Null
    $svg = Join-Path $icons 'mk-foods-icon.svg'; $ico = Join-Path $icons 'icon.ico'
    if (-not (Test-Path -LiteralPath $svg)) { '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" rx="180"/><text x="512" y="620" text-anchor="middle" font-size="300" fill="white">MK</text></svg>' | Set-Content -LiteralPath $svg -Encoding UTF8 }
    if (-not (Test-Path -LiteralPath $ico)) { Invoke-Native $npx.Source @('--no-install','tauri','icon',$svg) }
    if (-not (Test-Path -LiteralPath $ico)) { throw "Tauri did not create $ico" }

    Write-Step '[8/9] Validating Tauri project'
    Invoke-Native $cargo.Source @('metadata','--no-deps','--format-version','1','--manifest-path',(Join-Path $Root 'src-tauri\Cargo.toml'))

    Write-Step '[9/9] Building NSIS installers for x64, x86 and ARM64'
    if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Out | Out-Null
    foreach ($entry in $Targets) {
        Write-Host "`n---------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host "Building $($entry.Name) - $($entry.Target)" -ForegroundColor Yellow
        Write-Host "---------------------------------------------------------------" -ForegroundColor DarkGray
        Import-VcVars $vcvars $entry.VsArch $entry.CompilerArch
        $bundle = Join-Path $Root "src-tauri\target\$($entry.Target)\release\bundle\nsis"
        if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Recurse -Force }
        Invoke-Native $npx.Source @('--no-install','tauri','build','--bundles','nsis','--target',$entry.Target)
        $installer = Get-ChildItem -LiteralPath $bundle -Filter '*-setup.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $installer) { throw "No NSIS installer was produced for $($entry.Name). Expected: $bundle" }
        Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $Out "MK-Foods-POS-Windows-Setup-$($entry.Name).exe") -Force
        Write-Host "$($entry.Name) installer created successfully." -ForegroundColor Green
    }
    Write-Host "`n================================================================`nSUCCESS - ALL WINDOWS INSTALLERS ARE READY`n================================================================" -ForegroundColor Green
    Get-ChildItem -LiteralPath $Out -Filter '*.exe' | Select-Object Name,Length,FullName | Format-Table -AutoSize
    exit 0
}
catch {
    Write-Host "`nBUILD ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    exit 1
}
