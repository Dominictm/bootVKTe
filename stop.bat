@echo off
taskkill /FI "WINDOWTITLE eq club-bot*" /T /F >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Bot stopped.
) else (
  echo No running club-bot process found ^(it may already be stopped^).
)
