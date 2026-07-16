@echo off
cd /d %~dp0

set PANEL_PORT=8546
if exist .env (
  for /f "tokens=2 delims==" %%p in ('findstr /b "PORT=" .env') do set PANEL_PORT=%%p
)

start "club-bot" node dist\index.js
echo Bot started in a new window titled "club-bot". Check that window for logs.

timeout /t 2 /nobreak >nul
start "" "http://localhost:%PANEL_PORT%/"
