@echo off
rem One click: builds and installs the Bellatrix app (care team + patient) on the robot over Wi-Fi.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\robot.ps1" -Mode install
pause
