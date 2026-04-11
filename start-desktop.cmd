@echo off
setlocal
cd /d "%~dp0"
title FreeFlow Dev

echo [FreeFlow] Starting desktop development build...

set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_BIN=%~dp0node_modules\.bin\electron.cmd"

if not exist "%ELECTRON_BIN%" goto missing_electron

call "%ELECTRON_BIN%" .
if errorlevel 1 goto startup_failed
goto end

:missing_electron
echo [FreeFlow][ERROR] Local Electron binary was not found.
echo Run npm install in this project first.
pause
exit /b 1

:startup_failed
echo.
echo [FreeFlow][ERROR] Desktop app failed to start.
pause
exit /b 1

:end
endlocal
