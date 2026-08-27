'use strict';

// Windows printing via PowerShell — no native Node addons required.
// Uses winspool.drv WritePrinter for RAW (ESC/POS) data.

const { execFileSync } = require('child_process');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

const PS_SCRIPT = `
param([string]$PrinterName, [string]$Base64Data)

$rawData = [System.Convert]::FromBase64String($Base64Data)

$typeSource = @"
using System;
using System.Runtime.InteropServices;
public class WinsPool {
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool OpenPrinter(string n, ref IntPtr h, IntPtr d);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr h, int lvl, ref DOCINFO di);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool WritePrinter(IntPtr h, byte[] buf, int len, ref int written);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct DOCINFO { public int cbSize; public string pDocName; public string pOutputFile; public string pDatatype; }
}
"@
if (-not ("WinsPool" -as [type])) {
    Add-Type -TypeDefinition $typeSource -ErrorAction Stop
}

$h = [IntPtr]::Zero
if (-not [WinsPool]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
    Write-Error "OpenPrinter failed for: $PrinterName"; exit 1
}

$di = New-Object WinsPool+DOCINFO
$di.cbSize     = [System.Runtime.InteropServices.Marshal]::SizeOf($di)
$di.pDocName   = "BYS-KOT"
$di.pOutputFile = $null
$di.pDatatype  = "RAW"

if ([WinsPool]::StartDocPrinter($h, 1, [ref]$di) -eq 0) {
    [WinsPool]::ClosePrinter($h); Write-Error "StartDocPrinter failed"; exit 2
}

[WinsPool]::StartPagePrinter($h) | Out-Null
$written = 0
[WinsPool]::WritePrinter($h, $rawData, $rawData.Length, [ref]$written) | Out-Null
[WinsPool]::EndPagePrinter($h) | Out-Null
[WinsPool]::EndDocPrinter($h) | Out-Null
[WinsPool]::ClosePrinter($h) | Out-Null

Write-Output "OK:$written"
`.trimStart();

const SCRIPT_PATH = path.join(os.tmpdir(), 'bys_rawprint.ps1');

// Write script once at startup
fs.writeFileSync(SCRIPT_PATH, PS_SCRIPT, 'utf8');

// Virtual printers don't accept RAW ESC/POS data — they use GDI rendering
const VIRTUAL_RE = /print to pdf|onenote|xps|fax/i;

function getPrinters() {
  // windowsHide: true is critical — without it, a GUI-subsystem parent spawning
  // a console child causes Windows to pop a new PowerShell window for the user.
  // Status polling fires this every 8s, so the windows accumulate fast.
  const out = execFileSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Get-Printer | Select-Object Name,Default,PrinterStatus | ConvertTo-Json -Depth 2 -Compress',
  ], { encoding: 'utf8', timeout: 6000, windowsHide: true });

  const raw = out.trim();
  if (!raw || raw === 'null') return [];
  const parsed = JSON.parse(raw);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((p) => ({
    name: p.Name,
    isDefault: p.Default === true,
    status: p.PrinterStatus ?? 0,
    isVirtual: VIRTUAL_RE.test(p.Name),
  }));
}

function printRaw(printerName, dataBuffer) {
  const b64 = dataBuffer.toString('base64');
  try {
    const out = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT_PATH,
      '-PrinterName', printerName,
      '-Base64Data', b64,
    ], { encoding: 'utf8', timeout: 12000, windowsHide: true });
    return out.trim();
  } catch (err) {
    const stderr = (err.stderr || '').toString().toLowerCase();
    const exitCode = err.status;

    // exit 2 = StartDocPrinter failed → virtual/incompatible printer (not a thermal printer)
    if (exitCode === 2 || stderr.includes('startdocprinter')) {
      const e = new Error(`"${printerName}" does not support RAW printing — not a thermal printer`);
      e.code = 'PRINTER_INCOMPATIBLE';
      throw e;
    }

    // exit 1 = OpenPrinter failed → printer disconnected or not found
    if (exitCode === 1 || stderr.includes('openprinter')) {
      const e = new Error(`"${printerName}" not found or disconnected`);
      e.code = 'PRINTER_NOT_FOUND';
      throw e;
    }

    throw err;
  }
}

module.exports = { getPrinters, printRaw, VIRTUAL_RE };
