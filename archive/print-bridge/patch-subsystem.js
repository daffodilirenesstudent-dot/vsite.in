'use strict';

// ============================================================
//  Patch a Windows PE binary's Subsystem field from
//  IMAGE_SUBSYSTEM_WINDOWS_CUI (3, console) to
//  IMAGE_SUBSYSTEM_WINDOWS_GUI (2, no console window).
//
//  Why: pkg compiles Node apps as console-subsystem binaries.
//  Windows allocates a console window every time such an EXE
//  is launched, and CLOSING that window terminates the process.
//  A restaurant admin who clicks the X on the bridge's console
//  kills printing for everyone — silently.
//
//  Switching the subsystem to GUI means Windows never allocates
//  a console; the EXE runs as a true background process.
//  stdin/stdout/stderr writes silently no-op (we file-log in
//  server.js to compensate).
//
//  PE layout reference:
//    DOS header  : e_lfanew DWORD at offset 0x3C → PE header offset
//    PE signature: 4 bytes ("PE\0\0")
//    COFF header : 20 bytes
//    Optional header — Subsystem (WORD) at offset 0x44 (PE32 and PE32+).
//      PE32+ extends ImageBase by 4 bytes but removes BaseOfData (saves 4),
//      so Subsystem lands at the same 0x44 offset in both.
// ============================================================

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: node patch-subsystem.js <path-to-exe>');
  process.exit(2);
}

const buf = fs.readFileSync(file);

if (buf.toString('ascii', 0, 2) !== 'MZ') {
  console.error(`[patch-subsystem] ${file}: not a PE/EXE (no MZ header)`);
  process.exit(1);
}

const peOffset = buf.readUInt32LE(0x3C);
if (buf.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
  console.error(`[patch-subsystem] ${file}: PE signature not found at 0x${peOffset.toString(16)}`);
  process.exit(1);
}

// Magic at start of optional header: 0x10B = PE32, 0x20B = PE32+
const optHeaderOffset = peOffset + 4 + 20;
const magic = buf.readUInt16LE(optHeaderOffset);
if (magic !== 0x10B && magic !== 0x20B) {
  console.error(`[patch-subsystem] ${file}: unexpected optional header magic 0x${magic.toString(16)}`);
  process.exit(1);
}
// Subsystem (WORD) at optional-header offset 0x44 for both PE32 and PE32+.
const subsysOffset = optHeaderOffset + 0x44;

const current = buf.readUInt16LE(subsysOffset);
const NAMES = { 1: 'native', 2: 'GUI', 3: 'console' };

if (current === 2) {
  console.log(`[patch-subsystem] ${file}: already GUI subsystem — skipping.`);
  process.exit(0);
}
if (current !== 3) {
  console.error(`[patch-subsystem] ${file}: unexpected subsystem ${current} (${NAMES[current] ?? '?'}) — refusing to patch.`);
  process.exit(1);
}

buf.writeUInt16LE(2, subsysOffset);
fs.writeFileSync(file, buf);
console.log(`[patch-subsystem] ${file}: subsystem ${current} (console) → 2 (GUI). EXE will run with no console window.`);
