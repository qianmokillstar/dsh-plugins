@echo off
rem Daily driver: refresh data, rebuild the index and site, draft the weekly report, ensure the server runs.
rem   refresh.cmd             -> harvest npm + GitHub, snapshot, rebuild, weekly draft, start server
rem   refresh.cmd fast        -> reuse the last harvest (no network), then the same steps
rem   refresh.cmd --no-open   -> same as default, but do not open the browser
rem (MARKET_NO_OPEN=1 has the same effect as --no-open)
rem
rem If a harvest fails or returns suspiciously little data, the harvest scripts abort without
rem overwriting data/*.json; this script then skips rebuild and only makes sure the server is up.
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
if errorlevel 1 (
  echo [warn] npm harvest aborted or failed; keeping the previous data and skipping the rebuild
  goto :serveronly
)

echo [1b/5] harvesting GitHub topic:dsh-plugin ...
"%NODE%" "%ROOT%\scripts\harvest-github.mjs"
if errorlevel 1 (
  echo [warn] GitHub harvest aborted or failed; keeping the previous repo data
)

:snapshot
echo [2/5] writing daily snapshot ...
"%NODE%" "%ROOT%\scripts\snapshot.mjs"

echo [3/5] rebuilding index and site ...
"%NODE%" "%ROOT%\scripts\build-market.mjs"
if errorlevel 1 goto :serveronly
"%NODE%" "%ROOT%\scripts\build-site.mjs"
if errorlevel 1 goto :serveronly

echo [4/5] weekly draft ...
"%NODE%" "%ROOT%\scripts\weekly.mjs"

:serveronly
echo [5/5] starting server ...
call "%ROOT%\scripts\start-market.cmd"
exit /b 0
