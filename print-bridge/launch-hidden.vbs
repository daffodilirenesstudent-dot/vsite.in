' ============================================================
'  BYS Print Bridge - Hidden Launcher
'  Runs bys-print-bridge.exe with NO visible window.
'
'  Why: the raw EXE opens a console window. Restaurant staff
'  could accidentally click the X and kill the printer bridge,
'  with no obvious symptom until the next order tries to print.
'  This launcher solves that by starting the EXE detached and
'  hidden — Task Manager is the only way to see/stop it.
'
'  Usage:
'    - Double-click this file to start the bridge silently.
'    - The installer registers THIS file in HKCU\Run for
'      auto-start, so it runs on every login with no UI noise.
'    - The Start Menu shortcut "Start Print Bridge" points here.
' ============================================================

Option Explicit

Dim fso, sh, exeDir, exePath

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

exeDir  = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = fso.BuildPath(exeDir, "bys-print-bridge.exe")

If Not fso.FileExists(exePath) Then
  MsgBox "Cannot find bys-print-bridge.exe next to this launcher." & vbCrLf & vbCrLf & _
         "Expected: " & exePath, vbCritical, "BYS Print Bridge"
  WScript.Quit 1
End If

' Run hidden (0 = SW_HIDE), do not wait for completion (False).
' The bridge becomes a background process; Antigravity / cmd / explorer can all
' close without affecting it.
sh.Run """" & exePath & """", 0, False
