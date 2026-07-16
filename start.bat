@echo off
setlocal enabledelayedexpansion
cd /d %~dp0

if /i "%~1"=="installnode" goto :InstallNode

:CheckNode
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js not found on this system.
    echo Requesting administrator privileges to download and install Node.js...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'installnode' -Verb RunAs -Wait"
    call :RefreshPath
    where node >nul 2>&1
    if errorlevel 1 (
        echo.
        echo Node.js installation failed or was cancelled.
        echo Please install it manually from https://nodejs.org/ and run this script again.
        pause
        exit /b 1
    )
    echo Node.js installed successfully.
)
goto :AfterNode

:InstallNode
echo Installing Node.js LTS, this may take a minute...
where winget >nul 2>&1
if not errorlevel 1 (
    call winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    if not errorlevel 1 goto :InstallNodeDone
)
echo winget unavailable or failed, downloading the installer directly...
set "NODE_MSI=%TEMP%\node-lts-x64.msi"
powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.17.0/node-v20.17.0-x64.msi' -OutFile '%NODE_MSI%'"
if not exist "%NODE_MSI%" (
    echo Failed to download the Node.js installer.
    pause
    exit /b 1
)
msiexec /i "%NODE_MSI%" /qn /norestart
del "%NODE_MSI%" >nul 2>&1
:InstallNodeDone
exit /b 0

:RefreshPath
for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "skip=2 tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=%SYS_PATH%;%USR_PATH%;%PATH%"
goto :eof

:AfterNode
if not exist node_modules (
    echo Installing project dependencies ^(npm install^), this may take a minute...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

if not exist dist\index.js (
    echo Building the project...
    call npm run build
    if errorlevel 1 (
        echo Build failed.
        pause
        exit /b 1
    )
)

if not exist .env (
    if exist .env.example (
        echo .env not found, creating a default one from .env.example...
        copy .env.example .env >nul
    )
)

set PANEL_PORT=8546
if exist .env (
  for /f "tokens=2 delims==" %%p in ('findstr /b "PORT=" .env') do set PANEL_PORT=%%p
)

start "club-bot" node dist\index.js
echo Bot started in a new window titled "club-bot". Check that window for logs.

timeout /t 2 /nobreak >nul
start "" "http://localhost:%PANEL_PORT%/"
