@echo off
REM ============================================================
REM  BYS Print Bridge - Stop
REM  Cleanly terminates the background bridge process.
REM  Use this when you need to update or troubleshoot it.
REM ============================================================
taskkill /f /im bys-print-bridge.exe >nul 2>&1
if %errorlevel%==0 (
  echo Print Bridge stopped.
) else (
  echo Print Bridge was not running.
)
timeout /t 2 >nul
