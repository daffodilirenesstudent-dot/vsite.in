'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

const CONFIG_DIR  = path.join(os.homedir(), 'AppData', 'Roaming', 'BuildYourStore');
const CONFIG_FILE = path.join(CONFIG_DIR, 'printer-config.json');

const DEFAULT_CONFIG = {
  version: 2,
  // 24-char hex token, generated once per install. Required on mutating endpoints
  // (POST /print, POST /test-print, PUT /config, autostart toggles) so that
  // cross-origin requests from random websites cannot drive the printer.
  // Read by the web app via GET /status (CORS-restricted to known origins).
  token: '',
  roles: {
    kot:   null,
    bill:  null,
    admin: null,
  },
  paperWidth: {
    kot:  32,
    bill: 42,
  },
};

function generateToken() {
  return crypto.randomBytes(12).toString('hex'); // 24 hex chars
}

function loadConfig() {
  let cfg;
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    } else {
      const raw    = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      cfg = {
        ...DEFAULT_CONFIG,
        ...parsed,
        roles:      { ...DEFAULT_CONFIG.roles,      ...(parsed.roles      ?? {}) },
        paperWidth: { ...DEFAULT_CONFIG.paperWidth, ...(parsed.paperWidth ?? {}) },
      };
    }
  } catch {
    cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  // Ensure token exists — generate + persist on first load if missing.
  if (!cfg.token || typeof cfg.token !== 'string' || cfg.token.length < 16) {
    cfg.token = generateToken();
    try { saveConfig(cfg); } catch { /* non-fatal — token still usable in memory */ }
  }
  return cfg;
}

function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Register the bridge for auto-start on Windows login.
// Prefers `launch-hidden.vbs` sitting next to the EXE (runs invisibly via wscript)
// so the user can't accidentally close a console window and kill the bridge.
// Falls back to the raw EXE if the VBS is missing (dev / corrupted install).
function registerAutoStart(exePath) {
  const { execFileSync } = require('child_process');
  const key  = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
  const name = 'BYSPrintBridge';

  // Look for the VBS launcher next to the EXE
  const exeDir = path.dirname(exePath);
  const vbsPath = path.join(exeDir, 'launch-hidden.vbs');
  const useVbs  = fs.existsSync(vbsPath);

  // wscript.exe lives in System32 — invoked explicitly so the registry value is
  // unambiguous (don't rely on Windows file-association resolution at boot).
  const val = useVbs
    ? `wscript.exe "${vbsPath}"`
    : `"${exePath}"`;

  try {
    execFileSync('reg', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', val, '/f'], {
      encoding: 'utf8',
      timeout:  5000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function unregisterAutoStart() {
  const { execFileSync } = require('child_process');
  const key  = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
  const name = 'BYSPrintBridge';
  try {
    execFileSync('reg', ['delete', key, '/v', name, '/f'], {
      encoding: 'utf8',
      timeout:  5000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function isAutoStartRegistered() {
  return !!getAutoStartCommand();
}

// Returns the raw command string in HKCU\Run\BYSPrintBridge, or null if absent.
// Used to detect outdated entries (pointing at the raw EXE) so we can upgrade
// them to the hidden VBS launcher on the next bridge start.
function getAutoStartCommand() {
  const { execFileSync } = require('child_process');
  const key  = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
  const name = 'BYSPrintBridge';
  try {
    const out = execFileSync('reg', ['query', key, '/v', name], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    // Output looks like:  "    BYSPrintBridge    REG_SZ    <value>"
    const m = out.match(/REG_SZ\s+(.+?)(?:\r?\n|$)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

module.exports = {
  loadConfig, saveConfig,
  registerAutoStart, unregisterAutoStart, isAutoStartRegistered,
  getAutoStartCommand,
};
