# =============================================================================
# OpenStudy Frontend - Windows One-Click Setup Script
# =============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
Set-Location -Path $ScriptDir
$ProjectDir = $ScriptDir

function Write-Step([string]$msg, [string]$color = "Cyan") {
    Write-Host ""
    Write-Host ("  {0}" -f $msg) -ForegroundColor $color
}

function Write-Info([string]$msg) {
    Write-Host ("    {0}" -f $msg) -ForegroundColor Gray
}

function Write-Success([string]$msg) {
    Write-Host ("  [OK] {0}" -f $msg) -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host ("  [!] {0}" -f $msg) -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host ("  [X] {0}" -f $msg) -ForegroundColor Red
}

Clear-Host
Write-Host ""
Write-Host "  =============================================" -ForegroundColor Cyan
Write-Host "    OpenStudy Frontend Setup Script            " -ForegroundColor Cyan
Write-Host "  =============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host ("  Project dir: {0}" -f $ProjectDir) -ForegroundColor Gray
Write-Host ""

# Step 1: Check Node.js
Write-Step "Step 1 / 3  Checking Node.js..." "Yellow"
$nodeOk = $false
try {
    $nodeVer = node --version 2>&1
    $npmVer  = npm  --version 2>&1
    if ($nodeVer -and $nodeVer -notmatch "not recognized" -and $nodeVer -notmatch "not found") {
        Write-Success ("Node.js version: {0}" -f $nodeVer)
        Write-Success ("npm version:      {0}" -f $npmVer)
        $nodeOk = $true
    }
} catch {}
if (-not $nodeOk) {
    Write-Err "Node.js not found. Please install from https://nodejs.org/"
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Step 2: Install dependencies
Write-Step "Step 2 / 3  Installing dependencies..." "Yellow"
$nodeModulesExists = Test-Path (Join-Path $ProjectDir "node_modules")

if ($nodeModulesExists) {
    $viteExists = Test-Path (Join-Path $ProjectDir "node_modules\vite")
    if ($viteExists) {
        Write-Success "node_modules found, skipping npm install"
        Write-Info "To reinstall, delete node_modules and run again"
    } else {
        Write-Warn "node_modules incomplete, reinstalling..."
        Remove-Item (Join-Path $ProjectDir "node_modules") -Recurse -Force -ErrorAction SilentlyContinue
        $nodeModulesExists = $false
    }
}

if (-not $nodeModulesExists) {
    Write-Info "Running npm install (first run may take 1-3 minutes)..."
    $npmProc = Start-Process `
        -FilePath "npm" `
        -ArgumentList "install" `
        -WorkingDirectory $ProjectDir `
        -NoNewWindow `
        -PassThru `
        -Wait

    if ($npmProc.ExitCode -ne 0) {
        Write-Err ("npm install failed with exit code: {0}" -f $npmProc.ExitCode)
        Write-Host ""
        Write-Host "Press any key to exit..." -ForegroundColor DarkGray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
    Write-Success "npm install completed"
}

# Step 3: Start dev server
Write-Step "Step 3 / 3  Starting dev server..." "Yellow"
$port = 3000
$devUrl = "http://localhost:$port"

Write-Host ""
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ("  Dev server ready: {0}" -f $devUrl) -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ""
Write-Info "Starting Vite dev server..."
Write-Host ""

npm run dev