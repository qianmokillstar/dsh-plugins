@echo off
rem Double-click: commit + push this folder to your GitHub repo, then print the two browser steps.
rem Keep the window open: Git Credential Manager may open a browser tab for the first login.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1"
echo.
pause
