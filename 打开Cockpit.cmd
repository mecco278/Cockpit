@echo off
setlocal
set "cockpit_exe=%~dp0dist\Cockpit-1.0.1-win-x64\Cockpit.exe"
if not exist "%cockpit_exe%" set "cockpit_exe=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Cockpit.lnk"
if not exist "%cockpit_exe%" set "cockpit_exe=%LOCALAPPDATA%\Programs\Cockpit\Cockpit.exe"
if not exist "%cockpit_exe%" (
    echo Install Cockpit or build it with desktop\build.ps1 first.
    pause
    exit /b 1
)
start "" "%cockpit_exe%"
