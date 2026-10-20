@echo off
title Just Spuds Admin Management Console
cls
echo ===================================================
echo   JUST SPUDS AYLESBURY - MANAGEMENT PORTAL
echo ===================================================
echo Launching admin console in dedicated software mode...

:: Set Target URL (Primary: Subdomain admin.justspuds.uk; Fallback: Localhost)
set "TARGET_URL=https://admin.justspuds.uk"
if "%~1"=="local" set "TARGET_URL=http://localhost:5173/admin"

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
    echo Opening in default browser...
    start "" "%TARGET_URL%"
    exit /b
)

:: Launch in Dedicated Standalone Window (Zero Browser UI / No address bar)
start "" "%BROWSER%" --app="%TARGET_URL%" --start-maximized --disable-pinch --overscroll-history-navigation=0 --no-first-run
exit /b
