'use strict';

const express  = require('express');
const cors     = require('cors');
const { getPrinters, printRaw, VIRTUAL_RE }                  = require('./winprint');
const { buildKot, buildBill }                                = require('./escpos');
const { loadConfig, saveConfig, registerAutoStart,
        unregisterAutoStart, isAutoStartRegistered,
        getAutoStartCommand }                                = require('./config');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── File logging ─────────────────────────────────────────────────────────────
// The EXE is compiled GUI-subsystem (no console), so console.log writes go to
// a dead handle. Tee everything to %APPDATA%\BuildYourStore\bridge.log instead
// so support staff can still diagnose problems.
// Log rotates at ~1 MB to keep the file bounded.
(() => {
  try {
    const logDir  = path.join(os.homedir(), 'AppData', 'Roaming', 'BuildYourStore');
    const logFile = path.join(logDir, 'bridge.log');
    fs.mkdirSync(logDir, { recursive: true });

    // Rotate if too big
    try {
      const st = fs.statSync(logFile);
      if (st.size > 1024 * 1024) fs.renameSync(logFile, logFile + '.old');
    } catch { /* file doesn't exist yet — fine */ }

    const stream = fs.createWriteStream(logFile, { flags: 'a' });
    const tee = (level, origFn) => (...args) => {
      try {
        const ts = new Date().toISOString();
        const line = `${ts} [${level}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`;
        stream.write(line);
      } catch { /* never let logging crash the bridge */ }
      try { origFn(...args); } catch { /* GUI mode: no console — silent */ }
    };
    console.log   = tee('INFO',  console.log.bind(console));
    console.warn  = tee('WARN',  console.warn.bind(console));
    console.error = tee('ERROR', console.error.bind(console));
  } catch {
    // If file logging can't initialize (permissions, disk full), keep running —
    // the bridge's primary job is to print, not to log.
  }
})();
const { enqueue, getPrinterStatus, getAllStatuses,
        getQueueDepth }                                      = require('./queue');

const PORT    = 7878;
const VERSION = '2.3.0';
const app     = express();

// ── CORS — restricted to known origins ───────────────────────────────────────
// Previously `origin: '*'` let any website queue print jobs. We now allow only
// the production app, localhost dev, and same-origin requests (no Origin header).
const ALLOWED_ORIGIN_RE = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
  /^https:\/\/([a-z0-9-]+\.)*buildyoustore\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i, // preview deploys
];

app.use(cors({
  origin: (origin, cb) => {
    // No origin header → same-origin / curl / native fetch — allow.
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGIN_RE.some(re => re.test(origin))) return cb(null, true);
    // Reject cleanly. Returning (null, false) makes cors() omit the
    // Access-Control-Allow-Origin header instead of throwing, so Express
    // returns a normal response without a 500 HTML error page. The browser
    // blocks the request as a same-origin violation, which is what we want.
    return cb(null, false);
  },
  credentials: false,
}));

app.use(express.json({ limit: '256kb' }));

// ── JSON error middleware ────────────────────────────────────────────────────
// Express's default error handler returns HTML, which breaks `await res.json()`
// in the web app and hides the actual problem. Map the two errors that
// realistically reach this point — bad JSON body and oversize body — to clean
// JSON responses.
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large' || err.statusCode === 413) {
    return res.status(413).json({ error: 'Request body exceeds 256KB limit' });
  }
  console.error('[express] unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Token gate for mutating endpoints ─────────────────────────────────────────
// Reads `X-BYS-Token` header and compares (timing-safe) against the local token.
// Public reads (/status, /config GET, /printers, /autostart GET) skip this.
function requireToken(req, res, next) {
  try {
    const expected = loadConfig().token || '';
    const provided = req.header('x-bys-token') || '';
    if (!expected || !provided || expected.length !== provided.length) {
      return res.status(401).json({ error: 'Missing or invalid bridge token' });
    }
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (!require('crypto').timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid bridge token' });
    }
    next();
  } catch (err) {
    console.error('[requireToken]', err.message);
    res.status(500).json({ error: 'Token check failed' });
  }
}

// ── Status ───────────────────────────────────────────────────────────────────
app.get('/status', (_req, res) => {
  const config    = loadConfig();
  const autoStart = isAutoStartRegistered();

  // Build per-role printer status
  // Cross-check with current Windows printer list for up-to-date disconnected detection
  let currentPrinterNames = [];
  try {
    currentPrinterNames = getPrinters().map(p => p.name);
  } catch { /* ignore — status still useful without it */ }

  const roleStatus = {};
  for (const [role, printerName] of Object.entries(config.roles)) {
    if (!printerName) {
      roleStatus[role] = { state: 'not_assigned', printerName: null };
      continue;
    }
    const inList = currentPrinterNames.includes(printerName);
    if (!inList) {
      // Printer is assigned but not showing in Windows — definitely disconnected
      roleStatus[role] = { state: 'disconnected', printerName, lastError: 'Printer not found in Windows' };
      continue;
    }
    // Printer is in Windows list — use cached state from last print attempt
    const cached = getPrinterStatus(printerName);
    roleStatus[role] = {
      state: cached.state === 'unknown' ? 'ready' : cached.state,
      printerName,
      lastError: cached.lastError ?? null,
      queueDepth: getQueueDepth(printerName),
    };
  }

  res.json({ running: true, version: VERSION, config, autoStart, roleStatus, printerStatus: getAllStatuses() });
});

// ── List Windows printers ────────────────────────────────────────────────────
app.get('/printers', (_req, res) => {
  try {
    const printers = getPrinters();
    res.json({ printers });
  } catch (err) {
    console.error('[/printers]', err.message);
    res.status(500).json({ error: 'Could not list printers: ' + err.message });
  }
});

// ── Get local printer-role config ────────────────────────────────────────────
app.get('/config', (_req, res) => {
  res.json(loadConfig());
});

// ── Save printer-role config ─────────────────────────────────────────────────
app.put('/config', requireToken, (req, res) => {
  try {
    const current = loadConfig();
    const body    = req.body ?? {};
    const updated = {
      ...current,
      roles:      { ...current.roles,      ...(body.roles      ?? {}) },
      paperWidth: { ...current.paperWidth, ...(body.paperWidth ?? {}) },
    };
    saveConfig(updated);
    console.log('[config] saved:', JSON.stringify(updated.roles));
    res.json({ success: true, config: updated });
  } catch (err) {
    console.error('[PUT /config]', err.message);
    res.status(500).json({ error: 'Failed to save config: ' + err.message });
  }
});

// ── Auto-start registration ───────────────────────────────────────────────────
app.post('/autostart/enable', requireToken, (req, res) => {
  const exePath = process.execPath;
  const ok      = registerAutoStart(exePath);
  res.json({ success: ok, registered: isAutoStartRegistered() });
});

app.post('/autostart/disable', requireToken, (_req, res) => {
  const ok = unregisterAutoStart();
  res.json({ success: ok, registered: isAutoStartRegistered() });
});

app.get('/autostart', (_req, res) => {
  res.json({ registered: isAutoStartRegistered() });
});

// ── Test print ───────────────────────────────────────────────────────────────
// Body: { printerName, type?: 'kot'|'bill', paperWidth?: 32|42 }
app.post('/test-print', requireToken, (req, res) => {
  const { printerName, type = 'kot', paperWidth } = req.body ?? {};
  if (!printerName) return res.status(400).json({ error: 'printerName is required' });

  // Warn if this looks like a virtual printer
  if (VIRTUAL_RE.test(printerName)) {
    return res.status(400).json({
      error: `"${printerName}" is a virtual printer and does not support thermal printing. Please assign a real USB or Bluetooth thermal printer.`,
      code: 'PRINTER_INCOMPATIBLE',
    });
  }

  try {
    const config = loadConfig();
    const width  = paperWidth ?? config.paperWidth?.[type] ?? 32;

    let raw;
    if (type === 'bill') {
      raw = buildBill({
        siteName:      'BuildYourStore',
        label:         'Test Print',
        orderNumber:   '0000',
        createdAt:     new Date().toISOString(),
        items:         [{ qty: 1, name: 'Test Item', variant: 'Regular', price: 100, total: 100 }],
        subtotal:      100,
        taxLabel:      'GST (5%)',
        taxAmount:     5,
        grandTotal:    105,
        currencySymbol: 'Rs.',
        footerText:    'Test print — OK!',
        paperWidth:    width,
      });
    } else {
      raw = buildKot({
        siteName:    'BuildYourStore',
        label:       'Test Print',
        orderNumber: '0000',
        createdAt:   new Date().toISOString(),
        items:       [{ qty: 1, name: 'Test Item', variant: 'Regular' }],
        paperWidth:  width,
      });
    }

    const result = printRaw(printerName, raw);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[/test-print]', err.message);
    const code = err.code ?? 'PRINT_ERROR';
    const userMsg = err.code === 'PRINTER_INCOMPATIBLE'
      ? `"${printerName}" is not a thermal printer — it cannot print ESC/POS data.`
      : err.code === 'PRINTER_NOT_FOUND'
      ? `"${printerName}" is not connected or not powered on.`
      : 'Test print failed: ' + err.message;
    res.status(500).json({ error: userMsg, code });
  }
});

// ── Print ────────────────────────────────────────────────────────────────────
// Body (role-based): { role: 'kot'|'bill'|'admin', type: 'kot'|'bill', data, paperWidth? }
// Body (legacy):     { printerName, type: 'kot', data, paperWidth? }
// Returns immediately: { jobId, queued: true, position }
app.post('/print', requireToken, (req, res) => {
  const { printerName, role, type, paperWidth, data, orderId } = req.body ?? {};

  if (!data) return res.status(400).json({ error: 'data is required' });

  const supportedTypes = ['kot', 'bill'];
  if (!supportedTypes.includes(type)) {
    return res.status(400).json({ error: `Unsupported type. Supported: ${supportedTypes.join(', ')}` });
  }

  // Resolve printer — role takes precedence over explicit name
  let resolvedPrinter = printerName ?? null;
  if (role) {
    const config = loadConfig();
    const fromRole = config.roles[role] ?? null;
    if (!fromRole) {
      return res.status(400).json({ error: `No printer assigned for role: ${role}. Please assign it in settings.` });
    }
    resolvedPrinter = fromRole;
  }
  if (!resolvedPrinter) {
    return res.status(400).json({ error: 'printerName or role is required' });
  }

  // Build ESC/POS buffer before enqueuing
  let raw;
  try {
    const config = loadConfig();
    const width  = paperWidth ?? config.paperWidth?.[role ?? type] ?? 32;
    raw = type === 'bill'
      ? buildBill({ ...data, paperWidth: width })
      : buildKot({ ...data, paperWidth: width });
  } catch (err) {
    console.error('[/print] ESC/POS build error:', err.message);
    return res.status(500).json({ error: 'Failed to build print data: ' + err.message });
  }

  // Build dedupe key if caller provided an orderId — prevents page-refresh
  // races from queuing the same KOT/Bill twice for the same order.
  const dedupeKey = orderId && typeof orderId === 'string'
    ? `${type}:${orderId}`
    : null;

  // Enqueue — returns immediately
  const result = enqueue(resolvedPrinter, () => printRaw(resolvedPrinter, raw), dedupeKey);
  if (result.deduped) {
    console.log(`[print] dedup hit — ${type} for orderId=${orderId} (job ${result.jobId})`);
    return res.json({ success: true, queued: false, deduped: true, jobId: result.jobId });
  }
  console.log(`[print] job ${result.jobId} queued — ${type} → "${resolvedPrinter}" (${role ? `role:${role}` : 'explicit'}) — position ${result.position}${result.dropped ? ` — dropped ${result.dropped} stale` : ''}`);

  res.json({ success: true, queued: true, jobId: result.jobId, position: result.position, ...(result.dropped ? { dropped: result.dropped } : {}) });
});

// ── Start ────────────────────────────────────────────────────────────────────
// Singleton guard: if another bridge instance is already serving /status, exit
// silently. Prevents the crash loop where a stale auto-start + a manual click
// (or two competing installs) both try to bind 7878, each failing with
// EADDRINUSE and being relaunched.
async function checkSingleton() {
  return new Promise((resolve) => {
    const req = require('http').get(
      { host: '127.0.0.1', port: PORT, path: '/status', timeout: 1500 },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve(json && json.running === true ? json : null);
          } catch { resolve(null); }
        });
      },
    );
    req.on('error', () => resolve(null));    // Connection refused = port free
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

(async function start() {
  const already = await checkSingleton();
  if (already) {
    // Healthy instance already running — back off silently. The user double-clicked,
    // or Windows fired the auto-start while a manual instance was up. No-op exit
    // means no CMD flash, no crash loop, no Sentry spam.
    console.log(`[startup] Bridge v${already.version} already running on port ${PORT} — exiting.`);
    process.exit(0);
  }

  const server = app.listen(PORT, '127.0.0.1');

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Race lost between singleton check and bind. Same intent: exit clean.
      console.error(`[startup] Port ${PORT} taken between singleton check and bind — exiting.`);
      process.exit(0);
    }
    console.error(`[startup] Listen error: ${err.message}`);
    process.exit(1);
  });

  server.on('listening', () => {
    const config = loadConfig();

    // Self-register / self-heal auto-start.
    // Re-register the registry value if any of these are true:
    //   1. No entry yet (first launch).
    //   2. Existing entry points at a path that no longer exists (user moved
    //      or deleted the EXE — common when they downloaded a new "setup"
    //      EXE to Downloads, ran it once, then later deleted it). A dangling
    //      entry doesn't crash anything but means the bridge silently fails
    //      to auto-start on the next login.
    //   3. Existing entry points at a DIFFERENT EXE than the one running now
    //      (two installs fighting). The currently-running EXE wins.
    //   4. We have a VBS launcher and the entry still calls the EXE directly
    //      (pre-v2.3 install — would open a console window on login).
    const vbsPath  = path.join(path.dirname(process.execPath), 'launch-hidden.vbs');
    const haveVbs  = fs.existsSync(vbsPath);
    const existing = getAutoStartCommand();

    // Parse the first quoted token out of the existing entry (the actual exe/vbs path).
    const targetMatch = existing && existing.match(/"([^"]+)"/);
    const targetPath  = targetMatch ? targetMatch[1] : null;
    const targetExists  = targetPath ? fs.existsSync(targetPath) : false;
    const pointsAtUs    = targetPath && (
      path.resolve(targetPath).toLowerCase() === path.resolve(process.execPath).toLowerCase() ||
      path.resolve(targetPath).toLowerCase() === path.resolve(vbsPath).toLowerCase()
    );
    const lacksHiddenLauncher = haveVbs && existing && !/launch-hidden\.vbs/i.test(existing);

    const reason = !existing       ? 'first-launch'
                 : !targetExists   ? `stale (missing: ${targetPath})`
                 : !pointsAtUs     ? `points elsewhere: ${targetPath}`
                 : lacksHiddenLauncher ? 'upgrade to hidden launcher'
                 : null;

    if (reason) {
      const ok = registerAutoStart(process.execPath);
      if (ok) console.log(`  [auto-start] Re-registered (${reason}) — will launch on Windows login.`);
      else    console.warn(`  [auto-start] Re-register attempt failed; will try again on next start.`);
    }

    const autoStart = isAutoStartRegistered();

    console.log('');
    console.log(`  BYS Print Bridge v${VERSION}`);
    console.log(`  Listening on http://127.0.0.1:${PORT}`);
    console.log(`  KOT  printer : ${config.roles.kot  || '(not assigned)'}`);
    console.log(`  Bill printer : ${config.roles.bill || '(not assigned)'}`);
    console.log(`  Auto-start   : ${autoStart ? 'enabled' : 'disabled'}`);
    console.log('  Runs in the background (no window). Use Task Manager or Stop Bridge to quit.');
  });
})();
