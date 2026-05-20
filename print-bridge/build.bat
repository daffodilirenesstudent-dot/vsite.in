@echo off
echo Installing dependencies...
call npm install
echo.
echo Building .exe (this may take a minute)...
call npm run build
echo.
echo Done! Output: dist\bys-print-bridge.exe
pause
