@echo off
title Neodyme - Installing Packages
cls

echo ======================================
echo   Neodyme Server Package Installation
echo ======================================
echo.

:: Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check Node.js version
echo Checking Node.js version...
node -v

:: Install dependencies
echo.
echo Installing dependencies...
npm install

if %errorlevel% equ 0 (
    echo.
    echo ======================================
    echo   Installation completed successfully!
    echo ======================================
    echo.
    echo You can now run start.bat to launch the server
) else (
    echo.
    echo ======================================
    echo   ERROR: Installation failed!
    echo ======================================
    echo.
    echo Please check the error messages above
)

pause