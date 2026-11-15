@echo off
rem One click: puts the Care Lab on the robot screen (see TEST-AU-BUREAU.md).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\robot.ps1" -Mode deploy
pause
