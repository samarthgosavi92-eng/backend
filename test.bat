@echo off
echo ========================================
echo Testing BhavTOL Scrapers
echo ========================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Running scraper tests...
echo.
node test-all-scrapers.js

echo.
pause








