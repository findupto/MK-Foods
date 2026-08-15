$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Out = Join-Path $Root 'dist'
$Targets = @(
    @{ Name = 'x64';   Target = 'x86_64-pc-windows-msvc'; VsArch = 'x64';       HostArch = 'x64' },
    @{ Name = 'x86';   Target = 'i686-pc-windows-msvc';   VsArch = 'x86';       HostArch = 'x64' },
    @{ Name = 'ARM64'; Target = 'aarch64-pc-windows-msvc'; VsArch = 'arm64';    HostArch = 'x64' }
)

function Write-Step([string]$Text) {
    Write-Host "`n$Text" -ForegroundColor Cyan
    Write-Host ('-' * 63)
}

function Invoke-Native([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE`: $File $($Arguments -join ' ')"
    }
}

function Find-VsWhere {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft Visual Studio\Installer\vswhere.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    $cmd = Get-Command vswhere.exe -ErrorAction SilentlyContinue
    if ($cmd) { $candidates += $cmd.Source }
    $candidates | Select-Object -Unique | Select-Object -First 1
}

function Find-VisualStudio {
    $vswhere = Find-VsWhere
    if ($vswhere) {
        try {
            $path = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
            if ($path) {
                $path = ([string]$path).Trim()
                if ($path -and (Test-Path -LiteralPath (Join-Path $path 'VC\Auxiliary\Build\vcvarsall.bat'))) { return $path }
            }
        } catch { }
    }

    $roots = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio'),
        (Join-Path $env:ProgramFiles 'Microsoft Visual Studio')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    foreach ($root in $roots) {
        $matches = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue } |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'VC\Auxiliary\Build\vcvarsall.bat') } |
            Sort-Object FullName -Descending
        if ($matches) { return $matches[0].FullName }
    }

    $regPaths = @(
        'HKLM:\SOFTWARE\Microsoft\VisualStudio\SxS\VS7',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\SxS\VS7'
    )
    foreach ($regPath in $regPaths) {
        try {
            $item = Get-ItemProperty -Path $regPath -ErrorAction Stop
            foreach ($property in $item.PSObject.Properties) {
                if ($property.Name -match '^\d+\.\d+$' -and $property.Value) {
                    $candidate = ([string]$property.Value).TrimEnd('\')
                    if (Test-Path -LiteralPath (Join-Path $candidate 'VC\Auxiliary\Build\vcvarsall.bat')) { return $candidate }
                }
            }
        } catch { }
    }
    throw 'Visual Studio C++ Build Tools with vcvarsall.bat could not be located.'
}

function Import-EnvironmentLines([string[]]$Lines) {
    foreach ($line in $Lines) {
        $text = [string]$line
        $idx = $text.IndexOf('=')
        if ($idx -gt 0) {
            $name = $text.Substring(0, $idx)
            $value = $text.Substring($idx + 1)
            if ($name -notmatch '^(ERRORLEVEL|CD)$') {
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}

function Import-VcVars([string]$VsInstall, [string]$VcVarsAll, [string]$Arch, [string]$HostArch) {
    Write-Host "Initializing MSVC environment: $Arch (host $HostArch)"

    # Method 1: vcvarsall.bat. Capture its diagnostics instead of hiding them.
    $cmdLine = 'call "{0}" {1} 2>&1 && set' -f $VcVarsAll, $Arch
    $lines = @(& cmd.exe /d /s /c $cmdLine)
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Import-EnvironmentLines $lines
        if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
            Write-Host 'MSVC environment initialized with vcvarsall.bat.' -ForegroundColor Green
            return
        }
    }

    Write-Host "vcvarsall method failed with exit code $code. Trying VsDevCmd fallback..." -ForegroundColor Yellow

    # Method 2: VsDevCmd.bat, using the architecture names accepted by VS 2022/18.
    $vsDevCmd = Join-Path $VsInstall 'Common7\Tools\VsDevCmd.bat'
    if (Test-Path -LiteralPath $vsDevCmd) {
        $devArch = switch ($Arch) {
            'x64'    { 'x64' }
            'x86'    { 'x86' }
            'arm64'  { 'arm64' }
            default  { $Arch }
        }
        $cmdLine2 = 'call "{0}" -arch={1} -host_arch={2} 2>&1 && set' -f $vsDevCmd, $devArch, $HostArch
        $lines2 = @(& cmd.exe /d /s /c $cmdLine2)
        $code2 = $LASTEXITCODE
        if ($code2 -eq 0) {
            Import-EnvironmentLines $lines2
            if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
                Write-Host 'MSVC environment initialized with VsDevCmd.bat fallback.' -ForegroundColor Green
                return
            }
        }
        Write-Host "VsDevCmd fallback failed with exit code $code2." -ForegroundColor Yellow
    }

    # Method 3: diagnose the installation instead of giving a useless exit 255.
    $vcTools = Join-Path $VsInstall 'VC\Tools\MSVC'
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
    Write-Host "MSVC tools directory: $vcTools"
    Write-Host "Windows SDK directory: $sdkRoot"
    if (-not (Test-Path -LiteralPath $vcTools)) { Write-Host 'MISSING: VC\Tools\MSVC' -ForegroundColor Red }
    if (-not (Test-Path -LiteralPath $sdkRoot)) { Write-Host 'MISSING: Windows 10 SDK root' -ForegroundColor Red }
    $clCandidates = @()
    if (Test-Path -LiteralPath $vcTools) {
        $clCandidates = Get-ChildItem -LiteralPath $vcTools -Filter cl.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 10
    }
    if ($clCandidates) { Write-Host 'Detected cl.exe files:'; $clCandidates | ForEach-Object { Write-Host "  $($_.FullName)" } }

    $tail = ($lines | Select-Object -Last 20) -join [Environment]::NewLine
    throw "MSVC environment initialization failed for $Arch. vcvarsall exit code: $code. Last diagnostics:`n$tail`n`nInstall/repair Visual Studio Build Tools with Desktop development with C++, MSVC v143/vNext C++ build tools, Windows SDK, and ARM64/x86 C++ tools."
}

Write-Host '================================================================' -ForegroundColor Yellow
Write-Host '      MK FOODS POS - WINDOWS INSTALLER BUILD' -ForegroundColor Yellow
Write-Host '     x64 + x86 + ARM64 / NSIS / GUI INSTALLER' -ForegroundColor Yellow
Write-Host '================================================================' -ForegroundColor Yellow

try {
    Write-Step '[1/9] Checking Node.js / npm'
    $node = Get-Command node.exe -ErrorAction Stop
    $npm = Get-Command npm.cmd -ErrorAction Stop
    & $node.Source --version
    & $npm.Source --version

    Write-Step '[2/9] Checking Rust / Cargo'
    $cargo = Get-Command cargo.exe -ErrorAction Stop
    $rustc = Get-Command rustc.exe -ErrorAction Stop
    $rustup = Get-Command rustup.exe -ErrorAction Stop
    & $cargo.Source --version
    & $rustc.Source --version
    & $rustup.Source --version

    Write-Step '[3/9] Detecting Visual Studio C++ MSVC tools'
    $vsInstall = Find-VisualStudio
    $vcvars = Join-Path $vsInstall 'VC\Auxiliary\Build\vcvarsall.bat'
    Write-Host "Visual Studio: $vsInstall"
    Write-Host "MSVC entry point: $vcvars"
    Import-VcVars $vsInstall $vcvars 'x64' 'x64'
    Write-Host 'MSVC compiler ready.' -ForegroundColor Green

    Write-Step '[4/9] Installing / repairing npm dependencies'
    Invoke-Native $npm.Source @('install','--include=dev')

    Write-Step '[5/9] Running project tests'
    Invoke-Native $npm.Source @('test')

    Write-Step '[6/9] Checking Tauri CLI and Windows targets'
    $npx = Get-Command npx.cmd -ErrorAction Stop
    Invoke-Native $npx.Source @('--no-install','tauri','--version')
    foreach ($entry in $Targets) { Invoke-Native $rustup.Source @('target','add',$entry.Target) }

    Write-Step '[7/9] Preparing application icon'
    $icons = Join-Path $Root 'src-tauri\icons'
    New-Item -ItemType Directory -Force -Path $icons | Out-Null
    $svg = Join-Path $icons 'mk-foods-icon.svg'
    $ico = Join-Path $icons 'icon.ico'
    if (-not (Test-Path -LiteralPath $svg)) {
@'
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="180" fill="#111111"/><circle cx="512" cy="512" r="360" fill="#ffffff"/><text x="512" y="625" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="300" font-weight="700" fill="#111111">MK</text><circle cx="512" cy="205" r="34" fill="#111111"/></svg>
'@ | Set-Content -LiteralPath $svg -Encoding UTF8
    }
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
        Import-VcVars $vsInstall $vcvars $entry.VsArch $entry.HostArch
        $bundle = Join-Path $Root "src-tauri\target\$($entry.Target)\release\bundle\nsis"
        if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Recurse -Force }
        Invoke-Native $npx.Source @('--no-install','tauri','build','--bundles','nsis','--target',$entry.Target)
        $installer = Get-ChildItem -LiteralPath $bundle -Filter '*-setup.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $installer) { throw "No NSIS installer was produced for $($entry.Name). Expected: $bundle" }
        $destination = Join-Path $Out "MK-Foods-POS-Windows-Setup-$($entry.Name).exe"
        Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
        Write-Host "$($entry.Name) installer created: $destination" -ForegroundColor Green
    }

    Write-Host "`n================================================================" -ForegroundColor Green
    Write-Host 'SUCCESS - ALL WINDOWS INSTALLERS ARE READY' -ForegroundColor Green
    Write-Host '================================================================' -ForegroundColor Green
    Get-ChildItem -LiteralPath $Out -Filter '*.exe' | Select-Object Name,Length,FullName | Format-Table -AutoSize
    exit 0
}
catch {
    Write-Host "`nBUILD ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    exit 1
}
