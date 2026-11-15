@echo off
rem Bellatrix Library demo on this PC: LabLand's store server, its admin page and the Care Team app.
rem Nothing is sent to the robot. Close the server window to stop it.
cd /d "%~dp0"
set PORT=8765
where node >nul 2>nul || (echo Node.js is needed for the store demo: https://nodejs.org & pause & exit /b 1)
start "Bellatrix Library server - close this window to stop" node labland\store-server.mjs %PORT%
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:%PORT%/labland/admin.html"
start "" "http://localhost:%PORT%/staff.html"
