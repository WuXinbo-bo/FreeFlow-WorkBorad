@echo off
setlocal
cd /d "%~dp0"
title FreeFlow Core Dev

echo [FreeFlow] Starting core desktop development build...

set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_BIN=%~dp0node_modules\.bin\electron.cmd"
set "ROOT_ELECTRON_BIN=%~dp0..\node_modules\.bin\electron.cmd"

if exist "%ELECTRON_BIN%" goto start_desktop
if exist "%ROOT_ELECTRON_BIN%" (
  set "ELECTRON_BIN=%ROOT_ELECTRON_BIN%"
  goto start_desktop
)
goto missing_electron

:start_desktop
call "%ELECTRON_BIN%" .
if errorlevel 1 goto startup_failed
goto end

:missing_electron
echo [FreeFlow][ERROR] Local Electron binary was not found.
echo Checked:
echo   %~dp0node_modules\.bin\electron.cmd
echo   %~dp0..\node_modules\.bin\electron.cmd
echo Run npm install in the project root first.
pause
exit /b 1

:startup_failed
echo.
echo [FreeFlow][ERROR] Desktop app failed to start.
pause
exit /b 1

:end
endlocal
