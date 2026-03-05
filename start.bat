@echo off
title Neodyme Server
cls

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call install_packages.bat
)

:: Start the server
echo Starting Neodyme Server...
node server.js

pause