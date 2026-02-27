@echo off
echo ========================================
echo Starting BhavTOL Backend Server
echo ========================================
echo.

cd /d "%~dp0"

if not exist "package.json" (
    echo ERROR: package.json not found!
    echo Make sure you're running this from the backend directory.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server...
echo.
node server.js

pause








