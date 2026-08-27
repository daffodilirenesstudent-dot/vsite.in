# Printer Bridge Architecture — Enhanced Multi-Printer System

> **This is a delta spec.** ~70% of the system is already built. This doc covers
> what exists, what gaps remain, and exactly how to fill them.

---

## 1. What Exists Today

| Component | Location | Status |
|-----------|----------|--------|
| Local Express bridge (port 7878) | `print-bridge/` | ✅ Built |
| `GET /printers` — list Windows printers | `print-bridge/src/server.js` | ✅ Built |
| `POST /print` — send ESC/POS job by printer name | `print-bridge/src/server.js` | ✅ Built |
| ESC/POS KOT formatter | `print-bridge/src/escpos.js` | ✅ Built |
| Raw Windows printing via winspool.drv | `print-bridge/src/winprint.js` | ✅ Built |
| Packages to `.exe` via `pkg` | `print-bridge/package.json` | ✅ Built |
| Cloud DB columns `kot_printer_name`, `bill_printer_name` | `supabase/migrations/037_*.sql` | ✅ Built |
| Settings UI: printer dropdowns + bridge health indicator | `src/app/manage/settings/page.tsx` | ✅ Built |
| Device heartbeat / KOT station designation | `src/app/api/manage/device-heartbeat/` | ✅ Built |
| KOT → 'preparing' advance on print success | `src/app/api/manage/orders/[id]/` | ✅ Built |
| Android APK KOT station (Bluetooth) | `kot-station-app/` | ✅ Built |

**What currently requires manual work every day:**
- Admin must double-click `bys-print-bridge.exe` after every PC restart
- Printer names are stored in cloud DB — if a printer is renamed in Windows, settings break
- Bill printer column exists but the web-app print path is not wired end-to-end
- No visual "bridge is running" indicator outside the settings page

---

## 2. Gaps vs Requested Behavior

| User Need | Gap | Priority |
|-----------|-----|----------|
| One-time install, zero daily setup | No installer; bridge doesn't auto-start | 🔴 Critical |
| Admin assigns KOT vs Bill role per printer locally | No local role config; roles only in cloud DB | 🔴 Critical |
| Bridge starts automatically on PC boot | No Windows auto-start mechanism | 🔴 Critical |
| Bill printing end-to-end | POST /print path for `type:'bill'` and ESC/POS receipt builder | 🟡 High |
| "Is bridge running?" always visible | No system tray icon | 🟡 High |
| Multiple printers shown + assigned in one screen | Settings UI shows printers but lacks role assignment locally | 🟡 High |

---

## 3. Critical Design Decision: Service vs User-Mode Auto-Start

> **You must answer this before building.** It controls everything about auto-start.

### Option A — User-Mode Auto-Start (Recommended ✅)
- Registers bridge in `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`  
  OR drops a `.lnk` shortcut into `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`
- Bridge starts when **the admin user logs in**
- **Can see all printers the user installed** (including USB thermal printers)
- Simple — no UAC elevation required for ongoing operation
- Assumption: Admin PC has a user logged in during business hours

### Option B — Windows Service (NT Service)
- Runs as SYSTEM from boot, before login
- **⚠️ Cannot see user-mode installed printers** (USB thermal printers, most POS printers)
  — this is a well-known Windows gotcha that breaks most thermal printer apps
- Requires UAC elevation during install only
- Only viable if printers are installed "for all users" (requires IT admin)

**Decision: Use Option A (user-mode auto-start) unless your printers are installed system-wide.**

---

## 4. Architecture Delta

### 4.1 New: Local Printer Role Config

**File:** `%APPDATA%\BuildYourStore\printer-config.json`

```json
{
  "version": 1,
  "roles": {
    "kot": "EPSON TM-T82 Receipt",
    "bill": "Brother QL-800",
    "admin": null
  },
  "paperWidth": {
    "kot": 32,
    "bill": 42
  }
}
```

**Rules:**
- Local config is **authoritative** for which physical printer handles which role
- Cloud DB `kot_printer_name` / `bill_printer_name` become **display-only cache** (for showing current assignment in UI)
- Web app reads local config via the bridge, not the cloud DB, when deciding where to print
- If a Windows printer is renamed, admin reassigns via UI once — config updates, no cloud change needed

---

### 4.2 Enhanced Bridge API (additions to `print-bridge/src/server.js`)

```
GET  /status          — already exists (health check)
GET  /printers        — already exists (list Windows printers)

NEW:
GET  /config          — return current printer-config.json
PUT  /config          — save printer-config.json (roles assignment)
POST /print           — EXTENDED: accepts role OR printerName
GET  /printers/live   — SSE stream: push printer list on change (polling 10s)
POST /test-print      — print a test page to a named printer
```

**Extended `/print` payload** (backwards-compatible — `printerName` still works):
```json
{
  "role": "kot",
  "type": "kot",
  "paperWidth": 32,
  "data": { ... }
}
```

Resolution order inside bridge:
1. If `printerName` given → use directly (legacy/explicit)
2. If `role` given → look up in `printer-config.json` → resolve to printer name → print
3. If role not assigned → return `{error: "No printer assigned for role: kot"}`

---

### 4.3 New: Bill Printer ESC/POS Builder (`print-bridge/src/escpos.js`)

Add `buildBill(data)` alongside existing `buildKot(data)`:

```
Bill receipt layout:
  ─────────────────────────────
        [Site Name]
      Tax Invoice / Receipt
  ─────────────────────────────
  Order #: 123456   Table: T5
  Date: 16 May 2026  14:32
  ─────────────────────────────
  2x Chicken Biryani    ₹420
  1x Naan                ₹40
  ─────────────────────────────
  Subtotal              ₹460
  GST (5%)               ₹23
  Total                 ₹483
  ─────────────────────────────
        Thank you!
  [Full paper cut]
```

---

### 4.4 Web App Changes

#### Settings Page (`src/app/manage/settings/page.tsx`)

Replace current "assign printer by cloud DB name" dropdowns with a **local-config panel**:

```
┌─ Printer Management ──────────────────────────────────────────┐
│                                                               │
│  Bridge Status: ● Connected  (v1.2.0)                        │
│                                                               │
│  Detected Printers:                                          │
│  ┌──────────────────────────────────┬──────────────────────┐ │
│  │ Printer Name                     │ Role                 │ │
│  ├──────────────────────────────────┼──────────────────────┤ │
│  │ EPSON TM-T82 Receipt             │ [KOT ▾]              │ │
│  │ Brother QL-800                   │ [Bill ▾]             │ │
│  │ HP LaserJet 1020                 │ [None ▾]             │ │
│  └──────────────────────────────────┴──────────────────────┘ │
│                                                               │
│  [Test KOT Print]  [Test Bill Print]                         │
└───────────────────────────────────────────────────────────────┘
```

Flow:
1. Settings page polls `GET http://127.0.0.1:7878/printers` (already done)
2. Settings page also fetches `GET http://127.0.0.1:7878/config` to know current role assignments
3. Dropdown change → `PUT http://127.0.0.1:7878/config` (saves locally on PC)
4. Cloud DB sync: after successful PUT, also update `kot_printer_name`/`bill_printer_name` in Supabase for display continuity

#### Orders Page (`src/app/manage/orders/page.tsx`)

In `sendKot()`:
- Change `POST /print` body from `{printerName: kotPrinterName, type:'kot'}` 
- To `{role: 'kot', type: 'kot'}` ← bridge resolves locally, no dependency on cloud name

Add `sendBill(order)` function mirroring `sendKot()`:
```
sendBill(order):
  1. POST http://127.0.0.1:7878/print  {role:'bill', type:'bill', data:{...}}
  2. If success → show "Bill printed" toast
  3. Fallback: browser print
```

---

### 4.5 New: System Tray Integration

Add `systray` support to the bridge using `node-systray` or embed a minimal tray executable alongside the bridge.

**Tray menu:**
```
● BuildYourStore Print Bridge (running)
─────────────────────────────────────
  KOT Printer:  EPSON TM-T82  ✅
  Bill Printer: Brother QL-800 ✅
─────────────────────────────────────
  Open Settings…
  Test Print…
  Restart Bridge
  View Logs…
─────────────────────────────────────
  Quit
```

Icon states:
- Green dot = all assigned printers reachable
- Yellow dot = bridge running, some printers offline
- Red dot = error / printer missing

---

## 5. One-Time Installer Package

### Toolchain: NSIS (Nullsoft Scriptable Install System)

NSIS is the standard installer pairing for `pkg`-built Node executables. Produces a single `.exe` the admin double-clicks once.

### Installer Flow

```
1. Admin downloads  bys-print-bridge-setup.exe
2. Double-clicks → UAC prompt (for install location only)
3. NSIS:
   a. Extracts bys-print-bridge.exe → C:\Program Files\BuildYourStore\PrintBridge\
   b. Extracts default printer-config.json → %APPDATA%\BuildYourStore\
   c. Registers auto-start:
      HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
      "BYSPrintBridge" = "C:\Program Files\BuildYourStore\PrintBridge\bys-print-bridge.exe --tray"
   d. Creates Start Menu shortcut
   e. Launches bridge immediately (no reboot required)
   f. Opens browser to http://localhost:7878/setup  OR  to the settings page
4. First-time setup wizard in browser:
   - Lists detected printers
   - Admin assigns KOT / Bill roles
   - Saves via PUT /config
   - Done — never needs to touch this again
```

### What the Installer Creates
```
C:\Program Files\BuildYourStore\PrintBridge\
  bys-print-bridge.exe      ← main bridge (Express + ESC/POS)
  uninstall.exe             ← generated by NSIS

%APPDATA%\BuildYourStore\
  printer-config.json       ← role assignments (persists across updates)
  bridge.log                ← rolling log (max 5MB, 3 rotations)
```

### Uninstall
NSIS auto-generates `uninstall.exe`:
1. Removes auto-start registry key
2. Deletes `C:\Program Files\BuildYourStore\PrintBridge\`
3. Leaves `%APPDATA%\BuildYourStore\` (preserves user config)

---

## 6. Build Pipeline Changes (`print-bridge/package.json`)

```json
{
  "scripts": {
    "build": "pkg . --targets node18-win-x64 --output dist/bys-print-bridge.exe",
    "build:installer": "makensis installer.nsi",
    "release": "npm run build && npm run build:installer"
  }
}
```

NSIS script file: `print-bridge/installer.nsi`

---

## 7. Config Schema (Full)

```typescript
// printer-config.json
interface PrinterConfig {
  version: number;           // increment on breaking changes
  roles: {
    kot:   string | null;    // Windows printer name or null
    bill:  string | null;
    admin: string | null;    // future: admin receipt printer
  };
  paperWidth: {
    kot:  32 | 42;           // columns for thermal paper width
    bill: 32 | 42;
  };
  autoStart: boolean;        // mirrors registry key state
  logLevel: 'error' | 'info' | 'debug';
}
```

---

## 8. What the Admin Does — After Install

**Day 1 (one time only):**
1. Download `bys-print-bridge-setup.exe`
2. Double-click, click through installer (~30 seconds)
3. Browser opens → assign KOT printer and Bill printer from dropdown
4. Done

**Every day after that:**
- Nothing. Bridge auto-starts when admin logs into Windows.
- System tray icon shows status.

**If a new printer is added:**
- Settings page detects it automatically (live printer list from bridge)
- Admin assigns role via dropdown → saved locally in 1 click

---

## 9. Print Job Routing Summary

```
Web app (any page)
  │
  ├── sendKot(order) → POST /print  {role:'kot', type:'kot', data:{...}}
  │                                      │
  │                          bridge resolves: config.roles.kot
  │                             = "EPSON TM-T82 Receipt"
  │                          escpos.buildKot(data) → ESC/POS buffer
  │                          winprint.print("EPSON TM-T82", buffer)
  │                          → thermal KOT slip prints in kitchen
  │
  └── sendBill(order) → POST /print  {role:'bill', type:'bill', data:{...}}
                                         │
                             bridge resolves: config.roles.bill
                               = "Brother QL-800"
                             escpos.buildBill(data) → ESC/POS buffer
                             winprint.print("Brother QL-800", buffer)
                             → bill receipt prints at counter
```

---

## 10. File Change Map

| File | Change Type | What Changes |
|------|-------------|--------------|
| `print-bridge/src/server.js` | Modify | Add GET/PUT /config, POST /test-print, GET /printers/live (SSE), extend POST /print for role routing |
| `print-bridge/src/escpos.js` | Modify | Add `buildBill()` function |
| `print-bridge/src/config.js` | **New** | Read/write printer-config.json to %APPDATA% |
| `print-bridge/src/tray.js` | **New** | System tray icon + menu |
| `print-bridge/installer.nsi` | **New** | NSIS installer script |
| `print-bridge/package.json` | Modify | Add `build:installer` script, `node-systray` dependency |
| `src/app/manage/settings/page.tsx` | Modify | Printer role assignment UI (read/write bridge config) |
| `src/app/manage/orders/page.tsx` | Modify | sendKot uses `role:'kot'` instead of printerName; add sendBill() |

---

## 11. Rollout / Backwards Compatibility

The extended `/print` endpoint is backwards-compatible:
- Old calls with `printerName` explicit → still work exactly as before
- New calls with `role` → resolved locally by bridge

Existing installs (bare `.exe`) keep working until admin downloads the installer. After install, they get auto-start and role-based routing.

---

## 12. Implementation Order

1. `print-bridge/src/config.js` — config read/write (no UI changes needed to test)
2. Extend `POST /print` for role routing + add `GET /config`, `PUT /config`
3. `escpos.js` — add `buildBill()`
4. Settings page UI — printer role assignment table
5. Orders page — switch `sendKot` to role-based, add `sendBill`
6. System tray (`tray.js`)
7. NSIS installer (`installer.nsi`) + release script
8. End-to-end test: install → assign → KOT print → Bill print

---

*Architecture version: 1.0 — 2026-05-16*
