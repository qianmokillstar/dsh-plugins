@echo off
rem Daily driver: refresh data, rebuild the index and site, draft the weekly report, ensure the server runs.
rem   refresh.cmd             -> harvest from npm, snapshot, rebuild, weekly draft, start server
rem   refresh.cmd fast        -> reuse the last harvest (no network), then the same steps
rem   refresh.cmd --no-open   -> same as default, but do not open the browser
rem (MARKET_NO_OPEN=1 has the same effect as --no-open)
setlocal
set "ROOT=%~dp0.."
if defined DSH_NODE_EXECUTABLE (
  set "NODE=%DSH_NODE_EXECUTABLE%"
) else (
  set "NODE=node"
)

set "MODE=%~1"
set "DO_HARVEST=1"
if /i "%MODE%"=="fast" set "DO_HARVEST=0"
if /i "%MODE%"=="--no-open" set "MARKET_NO_OPEN=1"

if "%DO_HARVEST%"=="1" goto :harvest
echo [1/5] harvest skipped ^(fast mode^)
goto :snapshot

:harvest
echo [1/5] harvesting npm registry ...
"%NODE%" "%ROOT%\scripts\harvest.mjs"
if errorlevel 1 echo [warn] npm harvest failed, continuing with the previous catalog

echo [1b/5] harvesting GitHub topic:dsh-plugin ...
"%NODE%" "%ROOT%\scripts\harvest-github.mjs"
if errorlevel 1 echo [warn] GitHub harvest failed, continuing with the previous repo data

:snapshot
echo [2/5] writing daily snapshot ...
"%NODE%" "%ROOT%\scripts\snapshot.mjs"

echo [3/5] rebuilding index and site ...
"%NODE%" "%ROOT%\scripts\build-market.mjs"
if errorlevel 1 goto :fail
"%NODE%" "%ROOT%\scripts\build-site.mjs"
if errorlevel 1 goto :fail

echo [4/5] weekly draft ...
"%NODE%" "%ROOT%\scripts\weekly.mjs"

echo [5/5] starting server ...
call "%ROOT%\scripts\start-market.cmd"
exit /b 0

:fail
echo [error] build failed, server not started
exit /b 1
