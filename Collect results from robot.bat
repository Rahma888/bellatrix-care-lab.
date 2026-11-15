@echo off
rem Copies the reports downloaded on the robot screen into the from-robot folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\robot.ps1" -Mode collect
pause
