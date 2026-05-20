; ============================================================
;  BYS Print Bridge — One-Time Installer
;  Build: makensis installer.nsi  (requires NSIS 3.x)
;  Output: dist/bys-print-bridge-setup.exe
; ============================================================

!define APP_NAME      "BYS Print Bridge"
!define APP_EXE       "bys-print-bridge.exe"
!define APP_LAUNCHER  "launch-hidden.vbs"
!define APP_STOPPER   "stop-bridge.bat"
!define APP_VERSION   "2.3.0"
!define PUBLISHER     "BuildYourStore"
!define INSTALL_DIR   "$PROGRAMFILES64\BuildYourStore\PrintBridge"
!define REG_ROOT      "HKCU"
!define REG_RUN_KEY   "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
!define REG_UNINSTALL "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\BYSPrintBridge"

; --- Metadata ---
Name "${APP_NAME} ${APP_VERSION}"
OutFile "dist\bys-print-bridge-setup.exe"
InstallDir "${INSTALL_DIR}"
InstallDirRegKey HKCU "Software\BuildYourStore\PrintBridge" "InstallDir"
RequestExecutionLevel admin          ; UAC for writing to Program Files (install only)
SetCompressor /SOLID lzma

; Modern UI
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON   "icon.ico"         ; put a 256x256 ico here, or remove this line
!define MUI_UNICON "icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

; ============================================================
;  INSTALL
; ============================================================
Section "Main" SecMain
  SetOutPath "$INSTDIR"

  ; Copy the compiled exe + hidden launcher + stop helper.
  ; The VBS launcher is what's actually registered for auto-start so the bridge
  ; runs invisibly — no console window the user can accidentally close.
  File "dist\${APP_EXE}"
  File "${APP_LAUNCHER}"
  File "${APP_STOPPER}"

  ; Write install location to registry (for uninstaller + updates)
  WriteRegStr HKCU "Software\BuildYourStore\PrintBridge" "InstallDir" "$INSTDIR"

  ; Register auto-start via the VBS launcher — wscript.exe runs it hidden.
  ; Note: HKCU so it only runs for this user — no system-wide impact.
  WriteRegStr ${REG_ROOT} "${REG_RUN_KEY}" "${APP_NAME}" 'wscript.exe "$INSTDIR\${APP_LAUNCHER}"'

  ; Add/Remove Programs entry
  WriteRegStr   HKCU "${REG_UNINSTALL}" "DisplayName"      "${APP_NAME}"
  WriteRegStr   HKCU "${REG_UNINSTALL}" "DisplayVersion"   "${APP_VERSION}"
  WriteRegStr   HKCU "${REG_UNINSTALL}" "Publisher"        "${PUBLISHER}"
  WriteRegStr   HKCU "${REG_UNINSTALL}" "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKCU "${REG_UNINSTALL}" "UninstallString"  '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoModify"         1
  WriteRegDWORD HKCU "${REG_UNINSTALL}" "NoRepair"         1

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Start Menu shortcuts — both point at hidden launcher / stop helper.
  ; "Show Console" is provided as an explicit, hidden-by-default way to see
  ; bridge logs for support / debugging.
  CreateDirectory "$SMPROGRAMS\BuildYourStore"
  CreateShortcut "$SMPROGRAMS\BuildYourStore\Start ${APP_NAME}.lnk" \
                 "wscript.exe" '"$INSTDIR\${APP_LAUNCHER}"'
  CreateShortcut "$SMPROGRAMS\BuildYourStore\Stop ${APP_NAME}.lnk" \
                 "$INSTDIR\${APP_STOPPER}"
  CreateShortcut "$SMPROGRAMS\BuildYourStore\${APP_NAME} (Show Console).lnk" \
                 "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\BuildYourStore\Uninstall ${APP_NAME}.lnk" \
                 "$INSTDIR\uninstall.exe"

  ; Stop any existing instance from a previous install before launching new one.
  ; /f = force; ignore exit code (1 if no process running).
  nsExec::Exec 'taskkill /f /im ${APP_EXE}'

  ; Launch the new bridge immediately, hidden (no console window flashes).
  Exec 'wscript.exe "$INSTDIR\${APP_LAUNCHER}"'

  ; Open the settings page in the default browser for first-time setup
  ExecShell "open" "https://app.buildyoustore.com/manage/settings"

SectionEnd

; ============================================================
;  UNINSTALL
; ============================================================
Section "Uninstall"
  ; Stop the running bridge first so files aren't locked.
  nsExec::Exec 'taskkill /f /im ${APP_EXE}'

  ; Remove auto-start entry
  DeleteRegValue ${REG_ROOT} "${REG_RUN_KEY}" "${APP_NAME}"

  ; Remove Add/Remove Programs entry
  DeleteRegKey HKCU "${REG_UNINSTALL}"

  ; Remove install location registry key
  DeleteRegKey HKCU "Software\BuildYourStore\PrintBridge"

  ; Delete files
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\${APP_LAUNCHER}"
  Delete "$INSTDIR\${APP_STOPPER}"
  Delete "$INSTDIR\uninstall.exe"
  RMDir  "$INSTDIR"
  RMDir  "$PROGRAMFILES64\BuildYourStore"    ; removes parent if empty

  ; Remove Start Menu shortcuts
  Delete "$SMPROGRAMS\BuildYourStore\Start ${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\BuildYourStore\Stop ${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\BuildYourStore\${APP_NAME} (Show Console).lnk"
  Delete "$SMPROGRAMS\BuildYourStore\${APP_NAME}.lnk"   ; legacy shortcut from older installs
  Delete "$SMPROGRAMS\BuildYourStore\Uninstall ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\BuildYourStore"

  ; NOTE: %APPDATA%\BuildYourStore\printer-config.json is intentionally left behind
  ;       so re-installs don't lose the printer role assignments or auth token.

SectionEnd
