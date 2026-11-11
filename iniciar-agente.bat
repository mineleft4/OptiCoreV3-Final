@echo off
REM Arranca el agente local de OptiCore (Windows).
REM Uso: doble clic en iniciar-agente.bat
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a intentarlo.
  pause
  exit /b 1
)
node server.js
pause
