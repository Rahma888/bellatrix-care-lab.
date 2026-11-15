@echo off
rem Bellatrix family video call demo on this PC. Nothing is sent to the robot.
rem This PC plays the robot (the patient screen) and the family (a second window).
rem In the Care Team: Family tab, add a contact, "Open the patient screen", then "Open the family page".
rem Close the server window to stop it.
cd /d "%~dp0"
set PORT=8765
where node >nul 2>nul || (echo Node.js is needed for the family call demo: https://nodejs.org & pause & exit /b 1)
start "Bellatrix call server - close this window to stop" node labland\store-server.mjs %PORT%
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:%PORT%/staff.html?allgames"
