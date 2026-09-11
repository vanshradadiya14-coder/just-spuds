@echo off
title Just Spuds - Vercel Permanent Production Deployment
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0deploy_vercel.ps1"
pause
