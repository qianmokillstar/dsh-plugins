@echo off
rem Start the local plugin market server if it is not already listening, then open the site.
rem   - Safe to double-click repeatedly: an existing server is reused, not duplicated.
rem   - The server is launched through wscript, with no console: closing DSH, or a parent
rem     console receiving Ctrl+C, cannot kill it.
rem   - Set MARKET_NO_OPEN=1 to skip opening the browser (used by the automated refresh).
rem   - Pass a port as the first argument to override 51888.
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=51888"

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo [market] already running on port %PORT%
  goto :open
)

echo [market] starting server on port %PORT% ...
wscript.exe //B "%~dp0serve-hidden.vbs" %PORT%

powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 24; $i++) { if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 }; Start-Sleep -Milliseconds 250 }; exit 1"
if errorlevel 1 (
  echo [error] server did not start on port %PORT%
  echo         Check that Node.js is available, or set DSH_NODE_EXECUTABLE.
  exit /b 1
)
echo [market] started

:open
if not "%MARKET_NO_OPEN%"=="1" (
  start "" "http://127.0.0.1:%PORT%/"
)
exit /b 0
