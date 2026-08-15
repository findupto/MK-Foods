$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Out = Join-Path $Root 'dist'
$Targets = @(
    @{ Name='x64'; Target='x86_64-pc-windows-msvc'; CompilerArch='x64'; Host='Hostx64' },
    @{ Name='x86'; Target='i686-pc-windows-msvc'; CompilerArch='x86'; Host='Hostx64' },
    @{ Name='ARM64'; Target='aarch64-pc-windows-msvc'; CompilerArch='arm64'; Host='Hostx64' }
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
    $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -Unique | Select-Object -First 1
}

function Find-VisualStudio {
    $vswhere = Find-VsWhere
    if ($vswhere) {
        try {
            $p = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
            if ($p) { $p = ([string]$p).Trim() }
            if ($p -and (Test-Path -LiteralPath (Join-Path $p 'VC\Tools\MSVC'))) { return $p }
        } catch {}
    }
    $roots = @()
    if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio') }
    if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'Microsoft Visual Studio') }
    foreach ($root in $roots | Where-Object { Test-Path -LiteralPath $_ }) {
        $hits = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue } |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'VC\Tools\MSVC') } |
            Sort-Object FullName -Descending
        if ($hits) { return $hits[0].FullName }
    }
    throw 'Visual Studio Build Tools with VC\Tools\MSVC could not be located.'
}

function Get-Toolchain([string]$VsInstall, [string]$CompilerArch, [string]$HostArch) {
    $msvcRoot = Join-Path $VsInstall 'VC\Tools\MSVC'
    $toolset = Get-ChildItem -LiteralPath $msvcRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $toolset) { throw "No MSVC toolset found in $msvcRoot" }

    $bin = Join-Path $toolset.FullName "bin\$HostArch\$CompilerArch"
    $cl = Join-Path $bin 'cl.exe'
    $link = Join-Path $bin 'link.exe'
    if (-not (Test-Path -LiteralPath $cl)) {
        $bin = Join-Path $toolset.FullName "bin\Hostx86\$CompilerArch"
        $cl = Join-Path $bin 'cl.exe'
        $link = Join-Path $bin 'link.exe'
    }
    if (-not (Test-Path -LiteralPath $cl)) { throw "cl.exe for $CompilerArch was not found in $($toolset.FullName)." }

    $sdkRoot = if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10' } else { Join-Path $env:ProgramFiles 'Windows Kits\10' }
    $sdkIncludeRoot = Join-Path $sdkRoot 'Include'
    $sdkLibRoot = Join-Path $sdkRoot 'Lib'
    $sdkVersionDir = Get-ChildItem -LiteralPath $sdkIncludeRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    $sdkLibVersionDir = Get-ChildItem -LiteralPath $sdkLibRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $sdkVersionDir -or -not $sdkLibVersionDir) { throw "Windows SDK was not found under $sdkRoot" }

    $sdkArch = switch ($CompilerArch) { 'x64' { 'x64' }; 'x86' { 'x86' }; 'arm64' { 'arm64' } }
    $includeDirs = @(
        (Join-Path $toolset.FullName 'include'),
        (Join-Path $sdkVersionDir.FullName 'ucrt'),
        (Join-Path $sdkVersionDir.FullName 'shared'),
        (Join-Path $sdkVersionDir.FullName 'um'),
        (Join-Path $sdkVersionDir.FullName 'winrt')
    ) | Where-Object { Test-Path -LiteralPath $_ }
    $libDirs = @(
        (Join-Path $toolset.FullName "lib\$CompilerArch"),
        (Join-Path $sdkLibVersionDir.FullName "ucrt\$sdkArch"),
        (Join-Path $sdkLibVersionDir.FullName "um\$sdkArch")
    ) | Where-Object { Test-Path -LiteralPath $_ }

    $sdkBin = Join-Path $sdkRoot "bin\$($sdkLibVersionDir.Name)\$HostArch"
    if (-not (Test-Path -LiteralPath $sdkBin)) { $sdkBin = Join-Path $sdkRoot "bin\$($sdkLibVersionDir.Name)\x64" }

    return [pscustomobject]@{
        Toolset=$toolset.FullName; Version=$toolset.Name; Bin=$bin; Cl=$cl; Link=$link
        SdkRoot=$sdkRoot; SdkVersion=$sdkVersionDir.Name; Include=($includeDirs -join ';'); Lib=($libDirs -join ';'); SdkBin=$sdkBin
    }
}

function Activate-DirectMsvc([string]$VsInstall, [string]$CompilerArch, [string]$HostArch) {
    Write-Host "Activating MSVC directly (bypassing vcvarsall/VsDevCmd): $CompilerArch"
    $tc = Get-Toolchain $VsInstall $CompilerArch $HostArch
    $env:PATH = "$($tc.Bin);$($tc.SdkBin);$($tc.Toolset)\bin;$env:PATH"
    $env:INCLUDE = $tc.Include
    $env:LIB = $tc.Lib
    $env:VCToolsInstallDir = "$($tc.Toolset)\"
    $env:VCToolsVersion = $tc.Version
    $env:VCINSTALLDIR = "$VsInstall\"
    $env:WindowsSdkDir = "$($tc.SdkRoot)\"
    $env:WindowsSDKVersion = "$($tc.SdkVersion)\"
    $env:UniversalCRTSdkDir = "$($tc.SdkRoot)\"
    $env:UCRTVersion = "$($tc.SdkVersion)\"
    $env:LIBPATH = $tc.Lib

    $resolved = Get-Command cl.exe -ErrorAction SilentlyContinue
    if (-not $resolved) { throw "Direct MSVC activation failed: cl.exe is not on PATH." }
    Write-Host "MSVC compiler ready: $($resolved.Source)" -ForegroundColor Green
    Write-Host "MSVC toolset: $($tc.Version) | Windows SDK: $($tc.SdkVersion)"
}

function Try-BatchMsvc([string]$VcVars, [string]$Arch) {
    # Optional fallback only. Direct activation above is the primary method because
    # VS 18.8 batch files can fail with '\Microsoft was unexpected at this time'.
    $cmd = Join-Path $env:TEMP ("mk-foods-vcvars-{0}.cmd" -f ([guid]::NewGuid().ToString('N')))
    $out = Join-Path $env:TEMP ("mk-foods-vcvars-{0}.txt" -f ([guid]::NewGuid().ToString('N')))
    try {
        $short = $VcVars
        @("@echo off", "call `"$short`" $Arch > `"$out`" 2>&1", 'set MK_VC_EXIT=%ERRORLEVEL%', "set > `"$out.env`"", 'exit /b %MK_VC_EXIT%') | Set-Content -LiteralPath $cmd -Encoding ASCII
        & cmd.exe /d /c $cmd
        $code = $LASTEXITCODE
        if ($code -ne 0) { return $false }
        if (-not (Test-Path -LiteralPath "$out.env")) { return $false }
        foreach ($line in Get-Content -LiteralPath "$out.env") {
            $i=$line.IndexOf('='); if ($i -gt 0) { [Environment]::SetEnvironmentVariable($line.Substring(0,$i),$line.Substring($i+1),'Process') }
        }
        return [bool](Get-Command cl.exe -ErrorAction SilentlyContinue)
    } finally { Remove-Item $cmd,$out,"$out.env" -Force -ErrorAction SilentlyContinue }
}

Write-Host '================================================================' -ForegroundColor Yellow
Write-Host '      MK FOODS POS - WINDOWS INSTALLER BUILD' -ForegroundColor Yellow
Write-Host '     x64 + x86 + ARM64 / NSIS / GUI INSTALLER' -ForegroundColor Yellow
Write-Host '================================================================' -ForegroundColor Yellow

try {
    Write-Step '[1/9] Checking Node.js / npm'
    $node=Get-Command node.exe -ErrorAction Stop; $npm=Get-Command npm.cmd -ErrorAction Stop
    & $node.Source --version; & $npm.Source --version

    Write-Step '[2/9] Checking Rust / Cargo'
    $cargo=Get-Command cargo.exe -ErrorAction Stop; $rustc=Get-Command rustc.exe -ErrorAction Stop; $rustup=Get-Command rustup.exe -ErrorAction Stop
    & $cargo.Source --version; & $rustc.Source --version; & $rustup.Source --version

    Write-Step '[3/9] Detecting Visual Studio C++ MSVC tools'
    $vsInstall=Find-VisualStudio
    $vcvars=Join-Path $vsInstall 'VC\Auxiliary\Build\vcvarsall.bat'
    Write-Host "Visual Studio: $vsInstall"
    Write-Host "MSVC toolset root: $(Join-Path $vsInstall 'VC\Tools\MSVC')"
    Write-Host 'Primary method: direct MSVC + Windows SDK activation'
    Activate-DirectMsvc $vsInstall 'x64' 'Hostx64'

    Write-Step '[4/9] Installing / repairing npm dependencies'
    Invoke-Native $npm.Source @('install','--include=dev')

    Write-Step '[5/9] Running project tests'
    Invoke-Native $npm.Source @('test')

    Write-Step '[6/9] Checking Tauri CLI and Windows targets'
    $npx=Get-Command npx.cmd -ErrorAction Stop
    Invoke-Native $npx.Source @('--no-install','tauri','--version')
    foreach ($t in $Targets) { Invoke-Native $rustup.Source @('target','add',$t.Target) }

    Write-Step '[7/9] Preparing application icon'
    $icons=Join-Path $Root 'src-tauri\icons'; New-Item -ItemType Directory -Force -Path $icons | Out-Null
    $svg=Join-Path $icons 'mk-foods-icon.svg'; $ico=Join-Path $icons 'icon.ico'
    if (-not (Test-Path -LiteralPath $svg)) { '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" rx="180"/><text x="512" y="620" text-anchor="middle" font-family="Arial" font-size="300" font-weight="700" fill="white">MK</text></svg>' | Set-Content -LiteralPath $svg -Encoding UTF8 }
    if (-not (Test-Path -LiteralPath $ico)) { Invoke-Native $npx.Source @('--no-install','tauri','icon',$svg) }
    if (-not (Test-Path -LiteralPath $ico)) { throw "Tauri did not create $ico" }

    Write-Step '[8/9] Validating Tauri project'
    Invoke-Native $cargo.Source @('metadata','--no-deps','--format-version','1','--manifest-path',(Join-Path $Root 'src-tauri\Cargo.toml'))

    Write-Step '[9/9] Building NSIS installers for x64, x86 and ARM64'
    if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Out | Out-Null
    foreach ($t in $Targets) {
        Write-Host "`n---------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host "Building $($t.Name) - $($t.Target)" -ForegroundColor Yellow
        Write-Host "---------------------------------------------------------------" -ForegroundColor DarkGray
        Activate-DirectMsvc $vsInstall $t.CompilerArch $t.Host
        $bundle=Join-Path $Root "src-tauri\target\$($t.Target)\release\bundle\nsis"
        if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Recurse -Force }
        Invoke-Native $npx.Source @('--no-install','tauri','build','--bundles','nsis','--target',$t.Target)
        $installer=Get-ChildItem -LiteralPath $bundle -Filter '*-setup.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $installer) { throw "No NSIS installer was produced for $($t.Name). Expected: $bundle" }
        $dest=Join-Path $Out "MK-Foods-POS-Windows-Setup-$($t.Name).exe"
        Copy-Item -LiteralPath $installer.FullName -Destination $dest -Force
        Write-Host "$($t.Name) installer created: $dest" -ForegroundColor Green
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
