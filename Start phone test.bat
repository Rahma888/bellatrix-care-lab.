@echo off
rem Bellatrix on a real phone: the family portal and the family calls (TEST-TELEPHONE-1.16.md).
rem The phone needs an HTTPS address (camera, microphone, installing the portal): a temporary
rem Cloudflare tunnel to this PC. Close the tunnel window after the test: the address is public.
rem Nothing is downloaded or installed here: cloudflared must already be on this PC
rem (tools\cloudflared\cloudflared.exe in this folder, or cloudflared on the PATH).
rem   Start phone test.bat --check   only shows which cloudflared would be used (no server, no tunnel).
cd /d "%~dp0"
set PORT=8765
set "CF=%~dp0tools\cloudflared\cloudflared.exe"
if not exist "%CF%" set "CF="
if not defined CF for /f "delims=" %%i in ('where cloudflared 2^>nul') do if not defined CF set "CF=%%i"
if not defined CF (
  echo.
  echo cloudflared n'est pas installe sur ce PC.
  echo Il faut tools\cloudflared\cloudflared.exe dans ce dossier, ou cloudflared dans le PATH.
  echo Ce fichier ne telecharge et n'installe rien. Voir TEST-TELEPHONE-1.16.md.
  echo.
  pause
  exit /b 1
)
echo cloudflared : %CF%
if /i "%~1"=="--check" ( "%CF%" --version & exit /b 0 )
where node >nul 2>nul || (echo Node.js est necessaire : https://nodejs.org & pause & exit /b 1)
rem The call server on the Wi-Fi (--lan), unless it already runs (Start robot test server.bat).
netstat -an | find ":%PORT% " | find "LISTENING" >nul || start "Bellatrix call server - close this window to stop it" node labland\store-server.mjs %PORT% --lan
rem A fresh log for this run: the tunnel writes its https address into it.
set "BELLA_LOG=%TEMP%\bellatrix-tunnel-%RANDOM%%RANDOM%.log"
start "Bellatrix tunnel - close this window to stop it" "%CF%" tunnel --no-autoupdate --url http://localhost:%PORT% --logfile "%BELLA_LOG%"
echo Le tunnel demarre (quelques secondes)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\find-tunnel-url.ps1" "%BELLA_LOG%"
echo.
echo Pour arreter : ferme la fenetre du tunnel (et celle du serveur).
pause
