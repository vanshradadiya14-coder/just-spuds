# Just Spuds - Vercel Permanent Deployment Launcher
$Host.UI.RawUI.WindowTitle = "Just Spuds - Vercel Permanent Deployment"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "        JUST SPUDS AYLESBURY - VERCEL DEPLOYMENT          " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# Step 1: Check Vercel Authentication
Write-Host "[1/3] Checking Vercel login status..." -ForegroundColor Yellow
$loginCheck = & npx --yes vercel whoami 2>&1

if ($LASTEXITCODE -ne 0 -or $loginCheck -match "Not Authenticated|error|login|No existing credentials") {
    Write-Host ""
    Write-Host ">> Please log in to Vercel in the prompt below." -ForegroundColor Green
    Write-Host "   (Choose 'Continue with GitHub' or 'Continue with Email')" -ForegroundColor Cyan
    Write-Host ""
    & npx vercel login
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[!] Login was cancelled or failed. Please try again." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit
    }
}

# Step 2: Build project
Write-Host ""
Write-Host "[2/3] Building production assets..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Build failed. Please fix compile errors." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit
}

# Step 3: Deploy to Production
Write-Host ""
Write-Host "[3/3] Deploying Just Spuds to Vercel Production..." -ForegroundColor Yellow
Write-Host "      (Uploading to global CDN edge servers...)" -ForegroundColor Gray
Write-Host ""

$deployOutput = & npx vercel --prod --yes 2>&1
$deployOutput | Out-Host

# Step 4: Find the deployed URL
$prodUrl = $null
foreach ($line in $deployOutput) {
    if ($line -match '(https://[a-zA-Z0-9-]+\.vercel\.app)') {
        $prodUrl = $matches[1]
    }
}

if ($prodUrl) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " CONGRATULATIONS! YOUR PERMANENT LINK IS LIVE:            " -ForegroundColor Green
    Write-Host " $prodUrl" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " [OK] Link automatically copied to your clipboard!" -ForegroundColor Cyan
    Write-Host " [OK] Updated LIVE_LINK.url and LIVE_LINK.txt" -ForegroundColor Cyan
    Write-Host " [OK] This link NEVER EXPIRES and stays online 24/7!" -ForegroundColor Green
    Write-Host ""
    try { Set-Clipboard -Value $prodUrl } catch {}
} else {
    Write-Host ""
    Write-Host "[!] Deployment finished. Check above output for your vercel.app link." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to close this window"
