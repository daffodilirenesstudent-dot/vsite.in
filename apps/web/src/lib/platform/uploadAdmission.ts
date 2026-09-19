// Process-wide admission control for photo uploads.
//
// The instance is one 512MB `basic-xxs`. Measured on the extract path
// (2026-09-19, docs/PROGRESS.md): a request holds ~7× its upload size in RAM
// (multipart parse, per-file copies, base64, the serialised OpenAI body), i.e.
// 27MB for a typical 10-photo scan and 193MB for one 30MB body. Unadmitted,
// eight typical scans or two large ones at the same moment exhaust the
// instance, and the crash takes every customer's QR menu down with it.
//
// So uploads are admitted against a byte budget BEFORE their body is read. A
// request that does not fit waits briefly in FIFO order; if room does not free
// up in time it is told to come back (503 + Retry-After) — its body still
// unread, costing nothing.
//
// Per-process state, deliberately: the thing being protected is this process's
// memory. Horizontal scaling would give each instance its own budget, which is
// exactly right.

const MB = 1024 * 1024;

/** Measured RAM per uploaded byte on the extract path. */
export const MEMORY_AMPLIFICATION = 7;
const DEFAULT_BUDGET_MB = 200;

export function uploadBudgetBytes(): number {
  const mb = Number(process.env.EXTRACT_MEMORY_BUDGET_MB);
  const budgetMb = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_BUDGET_MB;
  return Math.floor((budgetMb * MB) / MEMORY_AMPLIFICATION);
}

export interface AdmissionTicket { release(): void }

export type AdmissionResult =
  | { ok: true; ticket: AdmissionTicket }
  | { ok: false; reason: 'busy' | 'user-busy'; retryAfterSec: number };

interface Waiter {
  userId: string;
  bytes: number;
  resolve: (r: AdmissionResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

let inFlightBytes = 0;
const activeUsers = new Set<string>();
const queue: Waiter[] = [];

function grant(userId: string, bytes: number): AdmissionTicket {
  inFlightBytes += bytes;
  activeUsers.add(userId);
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      inFlightBytes -= bytes;
      activeUsers.delete(userId);
      pump();
    },
  };
}

function fits(bytes: number): boolean {
  // An idle process always admits one request, so a single upload larger than
  // the budget is limited by the body cap, not starved forever.
  return inFlightBytes === 0 || inFlightBytes + bytes <= uploadBudgetBytes();
}

function pump(): void {
  while (queue.length > 0 && fits(queue[0].bytes)) {
    const w = queue.shift() as Waiter;
    clearTimeout(w.timer);
    w.resolve({ ok: true, ticket: grant(w.userId, w.bytes) });
  }
}

function retryAfterSec(): number {
  // Typical scan holds its slot ~10–20s; queue depth says how many are ahead.
  return Math.min(30, 5 + queue.length * 2);
}

/**
 * Claim `bytes` of upload budget for `userId`.
 * Resolves `user-busy` immediately if this user already has a scan running.
 */
export function admitUpload(opts: { userId: string; bytes: number; maxWaitMs: number }): Promise<AdmissionResult> {
  const { userId, bytes, maxWaitMs } = opts;
  if (activeUsers.has(userId) || queue.some(w => w.userId === userId)) {
    return Promise.resolve({ ok: false, reason: 'user-busy', retryAfterSec: 10 });
  }
  if (queue.length === 0 && fits(bytes)) {
    return Promise.resolve({ ok: true, ticket: grant(userId, bytes) });
  }
  if (maxWaitMs <= 0) {
    return Promise.resolve({ ok: false, reason: 'busy', retryAfterSec: retryAfterSec() });
  }
  return new Promise<AdmissionResult>((resolve) => {
    const waiter: Waiter = {
      userId, bytes, resolve,
      timer: setTimeout(() => {
        const i = queue.indexOf(waiter);
        if (i >= 0) queue.splice(i, 1);
        resolve({ ok: false, reason: 'busy', retryAfterSec: retryAfterSec() });
      }, maxWaitMs),
    };
    queue.push(waiter);
  });
}

export function uploadAdmissionStats(): { inFlightBytes: number; budgetBytes: number; waiting: number; active: number } {
  return { inFlightBytes, budgetBytes: uploadBudgetBytes(), waiting: queue.length, active: activeUsers.size };
}

/** Test seam. */
export function __resetUploadAdmission(): void {
  for (const w of queue) clearTimeout(w.timer);
  queue.length = 0;
  activeUsers.clear();
  inFlightBytes = 0;
}
