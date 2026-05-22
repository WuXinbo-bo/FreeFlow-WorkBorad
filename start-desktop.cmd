@echo off
setlocal
cd /d "%~dp0"
title FreeFlow Core Dev

echo [FreeFlow] Redirecting to core desktop development build...

set "CORE_DIR=%~dp0core"
set "CORE_START=%CORE_DIR%\start-desktop.cmd"

if not exist "%CORE_DIR%\package.json" goto missing_core
if not exist "%CORE_START%" goto missing_core_start

call "%CORE_START%"
if errorlevel 1 goto startup_failed
goto end

:missing_core
echo [FreeFlow][ERROR] core project folder was not found.
echo Expected: %CORE_DIR%
pause
exit /b 1

:missing_core_start
echo [FreeFlow][ERROR] core start script was not found.
echo Expected: %CORE_START%
pause
exit /b 1

:startup_failed
echo.
echo [FreeFlow][ERROR] Core desktop app failed to start.
pause
exit /b 1

:end
endlocal
