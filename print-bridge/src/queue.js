'use strict';

// FIFO print queue — one worker per printer, no inline retry sleep.
// printRaw is synchronous, so we wrap it in a promise inside the worker.
//
// Hardening:
//   • Per-printer queue depth capped at MAX_QUEUE_DEPTH. Overflow drops the
//     OLDEST queued job and records `state: 'overflow'` so the admin sees it.
//   • Dedup by `dedupeKey` (e.g., "kot:<orderId>") within DEDUPE_TTL_MS so the
//     same order can't be printed twice from page-refresh races.

let jobIdCounter = 0;

// Per-printer status: printerName → { state, lastError, updatedAt }
// state: 'ready' | 'disconnected' | 'incompatible' | 'overflow' | 'unknown'
const printerStatus = {};

// Per-printer FIFO queues: printerName → { jobs: [], running: bool }
const queues = {};

// Per-dedupe-key memory of recently-handled jobs. Map<key, { jobId, expiresAt }>
const dedupeCache = new Map();

const MAX_QUEUE_DEPTH = 20;
const DEDUPE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

function getOrCreateQueue(printerName) {
  if (!queues[printerName]) queues[printerName] = { jobs: [], running: false };
  return queues[printerName];
}

function pruneDedupe(now) {
  for (const [k, v] of dedupeCache) {
    if (v.expiresAt <= now) dedupeCache.delete(k);
  }
}

// Enqueue a print job. printFn must return a value or throw a typed error.
// Returns { jobId, position, deduped?: true, dropped?: number } immediately — does NOT block.
// `dedupeKey` is optional but recommended (e.g., `kot:<orderId>`).
function enqueue(printerName, printFn, dedupeKey = null) {
  const now = Date.now();
  pruneDedupe(now);

  // Dedup check
  if (dedupeKey) {
    const prev = dedupeCache.get(dedupeKey);
    if (prev && prev.expiresAt > now) {
      console.log(`[queue] dedup hit for "${dedupeKey}" — reusing job ${prev.jobId}`);
      return { jobId: prev.jobId, position: -1, deduped: true };
    }
  }

  const jobId = ++jobIdCounter;
  const q = getOrCreateQueue(printerName);

  // Overflow guard — drop oldest, keep the queue moving.
  let droppedCount = 0;
  while (q.jobs.length >= MAX_QUEUE_DEPTH) {
    q.jobs.shift();
    droppedCount++;
  }
  if (droppedCount > 0) {
    printerStatus[printerName] = {
      state: 'overflow',
      lastError: `Queue full — dropped ${droppedCount} oldest job(s)`,
      updatedAt: new Date().toISOString(),
    };
    console.warn(`[queue] OVERFLOW on "${printerName}" — dropped ${droppedCount} oldest jobs`);
  }

  const position = q.jobs.length + (q.running ? 1 : 0);
  q.jobs.push({ jobId, printFn, dedupeKey });

  if (dedupeKey) {
    dedupeCache.set(dedupeKey, { jobId, expiresAt: now + DEDUPE_TTL_MS });
  }

  if (!q.running) drainQueue(printerName);

  return { jobId, position, ...(droppedCount > 0 ? { dropped: droppedCount } : {}) };
}

async function drainQueue(printerName) {
  const q = queues[printerName];
  if (q.running) return;
  q.running = true;

  while (q.jobs.length > 0) {
    const { jobId, printFn } = q.jobs.shift();
    try {
      const result = printFn(); // sync — returns string like "OK:1234"
      printerStatus[printerName] = { state: 'ready', lastError: null, updatedAt: new Date().toISOString() };
      console.log(`[queue] job ${jobId} → "${printerName}" OK: ${result}`);
    } catch (err) {
      const state = err.code === 'PRINTER_INCOMPATIBLE' ? 'incompatible' : 'disconnected';
      printerStatus[printerName] = { state, lastError: err.message, updatedAt: new Date().toISOString() };
      console.error(`[queue] job ${jobId} → "${printerName}" FAILED (${state}): ${err.message}`);
    }
  }

  q.running = false;
}

function getPrinterStatus(printerName) {
  return printerStatus[printerName] ?? { state: 'unknown', lastError: null, updatedAt: null };
}

function getAllStatuses() {
  return printerStatus;
}

function getQueueDepth(printerName) {
  const q = queues[printerName];
  if (!q) return 0;
  return q.jobs.length + (q.running ? 1 : 0);
}

module.exports = { enqueue, getPrinterStatus, getAllStatuses, getQueueDepth, MAX_QUEUE_DEPTH };
