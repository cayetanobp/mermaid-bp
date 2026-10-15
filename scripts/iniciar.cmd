@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22.18 o posterior para abrir el editor.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run dev -- --port 5173 --strictPort --open
if errorlevel 1 pause
