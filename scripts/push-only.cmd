@echo off
rem Upload the committed site to GitHub. First run opens a browser to sign in.
setlocal
cd /d "%~dp0.."
set "GIT=E:\tools\PortableGit\cmd\git.exe"
if not exist "%GIT%" set "GIT=git"

echo ============================================
echo   Upload to github.com/qianmokillstar/dsh-plugins
echo ============================================
echo.
echo If a browser window opens, sign in to GitHub and approve access.
echo Uploading 365 files (about 2.5 MB), please wait...
echo.

"%GIT%" push -u origin main
if errorlevel 1 (
  echo.
  echo [error] upload failed. Copy the message above and send it back.
) else (
  echo.
  echo [ok] uploaded.
  echo.
  echo Two settings left in the browser:
  echo   1^) Settings -^> Actions -^> General -^> Workflow permissions: Read and write
  echo   2^) Settings -^> Pages -^> Source: GitHub Actions
)
echo.
pause
