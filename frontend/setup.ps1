<#
One-click Windows setup for the frontend (Next.js)
- Installs Node.js LTS via winget if missing
- Installs project dependencies via npm ci / npm install
- Prints next steps

Usage (PowerShell as Administrator preferred for winget installs):
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ./setup.ps1
#>

$ErrorActionPreference = 'Stop'

function Ensure-Command($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  return $null -ne $cmd
}

Write-Host "=== GPtrix Frontend Setup ===" -ForegroundColor Cyan

# 1) Ensure winget (for automated Node install)
$hasWinget = Ensure-Command 'winget'
if (-not $hasWinget) {
  Write-Warning "winget not found. If Node.js is missing, please install from https://nodejs.org (LTS)."
}

# 2) Ensure Node.js (LTS)
$hasNode = Ensure-Command 'node'
if (-not $hasNode) {
  if ($hasWinget) {
    Write-Host "Installing Node.js LTS via winget... (requires Administrator)" -ForegroundColor Yellow
    try {
      winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
    } catch {
      Write-Warning "winget failed to install Node.js. Please install Node LTS manually from https://nodejs.org and re-run this script."
    }
  } else {
    Write-Warning "Node.js not found and winget unavailable. Install Node LTS manually from https://nodejs.org and re-run this script."
    exit 1
  }
}

# Refresh session PATH
$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')

# 3) Show versions
try {
  node -v
  npm -v
} catch {
  Write-Warning "Node/npm still not available on PATH. Open a new terminal and run: node -v"
}

# 4) Install dependencies
if (Test-Path "package-lock.json") {
  Write-Host "Installing dependencies with npm ci..." -ForegroundColor Cyan
  npm ci
} else {
  Write-Host "Installing dependencies with npm install..." -ForegroundColor Cyan
  npm install
}

Write-Host "\n=== Setup complete ===" -ForegroundColor Green
Write-Host "Run the dev server:  npm run dev" -ForegroundColor Green
Write-Host "Open: http://localhost:3000" -ForegroundColor Green
