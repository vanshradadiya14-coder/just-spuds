@echo off
title Just Spuds - Live Public Cloudflare Tunnel
cd /d "%~dp0"
echo Starting Just Spuds Live Tunnel on port 5174...
powershell -ExecutionPolicy Bypass -Command "& 'd:\Client\valsi\cloudflared.exe' tunnel --url http://localhost:5174"
pause
