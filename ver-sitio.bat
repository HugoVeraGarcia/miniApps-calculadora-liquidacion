@echo off
rem ver-sitio.bat - Abre la calculadora de liquidacion en el navegador.
rem Doble clic en este archivo. Deja la ventana abierta mientras lo uses.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encuentra Node.js en este equipo.
  echo   Instalalo desde https://nodejs.org y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not "%~1"=="" set PUERTO=%~1

node servidor.mjs --abrir

echo.
echo   El servidor se ha detenido.
pause
