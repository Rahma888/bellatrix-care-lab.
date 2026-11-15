@echo off
rem Writes battery, brightness and Wi-Fi of the robot screens every 30 minutes (brief 7.3). Ctrl+C stops it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\robot.ps1" -Mode power -Minutes 30
pause
