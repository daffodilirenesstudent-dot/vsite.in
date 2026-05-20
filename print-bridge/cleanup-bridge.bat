@echo off
REM ============================================================
REM  BYS Print Bridge - Nuclear Cleanup
REM
REM  Kills all running bridges, removes stale auto-start entries,
REM  and reports any leftover EXEs on disk so you can delete them.
REM
REM  Use this when you see CMD windows flickering, port conflicts,
REM  or any "two bridges fighting" symptom.
REM
REM  Safe: does NOT touch %APPDATA%\BuildYourStore\printer-config.json
REM  (your printer assignments + auth token survive).
REM ============================================================

echo.
echo === Step 1: kill every running bridge process ===
taskkill /F /IM bys-print-bridge.exe 2>nul
if %errorlevel%==0 (echo Killed.) else (echo None running.)

echo.
echo === Step 2: remove auto-start registry entry ===
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v BYSPrintBridge /f 2>nul
if %errorlevel%==0 (echo Removed.) else (echo Not registered.)

echo.
echo === Step 3: report leftover EXEs on disk ===
echo (Delete any of these you don't recognize, then run the NEW EXE)
echo.
where /R "C:\Program Files" bys-print-bridge.exe 2>nul
where /R "C:\Program Files (x86)" bys-print-bridge.exe 2>nul
where /R "%USERPROFILE%\Desktop" bys-print-bridge*.exe 2>nul
where /R "%USERPROFILE%\Downloads" bys-print-bridge*.exe 2>nul

echo.
echo === Step 4: who is on port 7878? ===
netstat -ano | findstr ":7878"
if %errorlevel% NEQ 0 (echo Port 7878 is free.)

echo.
echo === Done ===
echo To start the bridge fresh, double-click the new bys-print-bridge.exe.
echo It runs invisibly — check Task Manager to confirm it's alive.
echo.
pause
