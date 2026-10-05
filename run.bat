@echo off
setlocal

rem Local development credentials. Replace these before any shared deployment.
set "ADMIN_USERNAME=admin"
set "ADMIN_PASSWORD_HASH=scrypt:32768:8:1$tRGKCuWLu84cfmU9$8b8ade36eac601e3bf95a0a25904785d47ae1c29de2e58bd1c7758239e8a3061128bb583f7729d88047e2f106dd28d4aa499fc83c31092233f0b4acd25373301"
set "FACULTY_DEFAULT_PASSWORD=staff123"
set "PORT=5001"

if /I "%~1"=="backend" goto backend
if /I "%~1"=="frontend" goto frontend

where python >nul 2>&1
if errorlevel 1 (
    echo [CIE] Python was not found on PATH.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [CIE] npm was not found on PATH.
    pause
    exit /b 1
)

start "CIE Backend" cmd /k ""%~f0" backend"
start "CIE Frontend" cmd /k ""%~f0" frontend"
echo [CIE] Backend and frontend terminals started.
echo [CIE] Frontend: http://localhost:5175/
exit /b 0

:backend
cd /d "%~dp0"
python backend\app.py
exit /b %errorlevel%

:frontend
cd /d "%~dp0"
npm --prefix frontend run dev
exit /b %errorlevel%
