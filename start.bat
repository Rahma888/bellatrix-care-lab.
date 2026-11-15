@echo off
rem Starts the Bellatrix Care Lab on this laptop and opens it in Chrome (or Edge).
rem A local server is needed: camera, microphone and the saved results only work reliably on localhost.
cd /d "%~dp0"
set PORT=8765
rem ?allgames: the PC test mode, every activity in the menu (Chess and Ludo from labland\packs), no Library.
set URL=http://localhost:%PORT%/?allgames
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if not defined PY (
  echo Python was not found, so the page opens straight from the folder.
  echo Camera and voice may then ask for permission every time.
  start "" "%~dp0index.html"
  pause
  exit /b
)
start "Bellatrix Care Lab server - close this window to stop" %PY% -m http.server %PORT% --bind 127.0.0.1
ping -n 3 127.0.0.1 >nul
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>nul && (start "" chrome "%URL%" & exit /b)
reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" >nul 2>nul && (start "" chrome "%URL%" & exit /b)
start "" msedge "%URL%"
