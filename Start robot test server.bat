@echo off
rem Bellatrix on the real robot: this PC runs the call server (and the Library) on the Wi-Fi.
rem Windows may ask whether Node.js may use the network: allow it on private networks.
rem The window shows the address to enter on the robot (Care Team > Family > Call server).
cd /d "%~dp0"
set PORT=8765
where node >nul 2>nul || (echo Node.js is needed: https://nodejs.org & pause & exit /b 1)
title Bellatrix robot test server - close this window to stop
node labland\store-server.mjs %PORT% --lan
pause
