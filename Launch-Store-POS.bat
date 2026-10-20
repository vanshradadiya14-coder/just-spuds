@echo off
title Just Spuds EPOS Till Terminal
cls
echo ===================================================
echo   JUST SPUDS AYLESBURY - COUNTER TILL SOFTWARE
echo ===================================================
echo Launching till in standalone dedicated software mode...

:: Set Target URL (Default: Live Domain; Fallback: Localhost if running locally)
set "TARGET_URL=https://www.justspuds.uk/pos"
if "%~1"=="local" set "TARGET_URL=http://localhost:5173/pos"

:: Check for Microsoft Edge or Google Chrome
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if "%BROWSER%"=="" (
    echo [ERROR] Neither Microsoft Edge nor Google Chrome could be found.
    echo Opening in default browser...
    start "" "%TARGET_URL%"
    exit /b
)

:: Launch in Dedicated Application / Kiosk Software Window (Zero Browser UI / No URL bar)
start "" "%BROWSER%" --app="%TARGET_URL%" --start-maximized --disable-pinch --overscroll-history-navigation=0 --no-first-run
exit /b
