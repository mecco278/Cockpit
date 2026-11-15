@echo off
setlocal
set "cockpit_exe=%~dp0dist\Cockpit-1.0.0-win-x64\Cockpit.exe"
if not exist "%cockpit_exe%" (
    echo Cockpit.exe was not found:
    echo "%cockpit_exe%"
    pause
    exit /b 1
)
start "" "%cockpit_exe%"
