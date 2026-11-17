@echo off
rem Verify the market index with the DSH-shipped validator.
rem Requires the Electron/Node path and the dsh package dir, both provided by DSH shells:
rem   DSH_NODE_EXECUTABLE  e.g. "...\DeepSeek Harness.exe"
rem   DSH_INSTALL_DIR      e.g. "...\node_modules\@deepseek-ai\dsh"
setlocal
if not defined DSH_NODE_EXECUTABLE (
  echo [error] DSH_NODE_EXECUTABLE is not set.
  echo         Run this from a DSH shell, or set it to the DSH executable path:
  echo         set "DSH_NODE_EXECUTABLE=^<path to DeepSeek Harness.exe^>"
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%DSH_NODE_EXECUTABLE%" "%~dp0validate-index.mjs"
exit /b %ERRORLEVEL%
