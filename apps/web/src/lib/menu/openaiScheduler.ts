// Client-side token budget for OpenAI calls, per model.
//
// OpenAI counts each request's `max_tokens` (plus its input) against the
// per-minute token limit when the request is ADMITTED, not when it finishes.
// Firing every call at once and letting the API sort it out is how a burst of
// onboardings became a wall of 429s — and, once the SDK's two quiet retries ran
// out, menus with whole pages missing.
//
// This module admits calls so that the tokens reserved inside any rate window
// never exceed the limit. Callers queue in FIFO order with a deadline. The
// limit starts from env (OPENAI_TPM_<MODEL>, OPENAI_RPM_<MODEL>) or a default,
// and is corrected from the `x-ratelimit-*` headers OpenAI returns, so the
// scheduler converges on the account's real tier without configuration.
//
// A small circuit breaker sits alongside: after repeated server errors or
// timeouts on a model, calls to it fail fast for a cool-off period rather than
// each burning its own timeout.

type HeaderSource = Headers | Record<string, string | undefined> | undefined | null;

export class SchedulerError extends Error {
  constructor(public code: 'SCHEDULER_TIMEOUT' | 'CIRCUIT_OPEN' | 'ABORTED', message: string) {
    super(message);
  }
}

export interface Lease {
  /** The call succeeded (closes a half-open circuit). */
  ok(): void;
  /** The call failed with a server error or timeout (counts toward the breaker). */
  fail(): void;
}

export interface AcquireOptions {
  /** Epoch ms after which waiting is abandoned. */
  deadline?: number;
  signal?: AbortSignal;
}

export interface RateScheduler {
  acquire(model: string, tokens: number, opts?: AcquireOptions): Promise<Lease>;
  setLimits(model: string, limits: { tokens: number; requests: number }): void;
  learn(model: string, headers: HeaderSource): void;
  rateLimited(model: string, headers: HeaderSource): void;
  /**
   * Roughly how long a reservation of `tokens` made now would wait behind what
   * is already reserved and queued. Used to keep a scan in the client-side
   * queue — holding no memory — rather than admit it only to time out here.
   */
  projectedWaitMs(model: string, tokens: number): number;
  stats(model: string): { tokenLimit: number; requestLimit: number; reservedTokens: number; queuedTokens: number; waiting: number };
}

const DEFAULTS: Record<string, { tokens: number; requests: number }> = {
  'gpt-4o': { tokens: 150_000, requests: 500 },
  'gpt-4o-mini': { tokens: 1_000_000, requests: 500 },
};
const FALLBACK_DEFAULT = { tokens: 100_000, requests: 300 };
/**
 * Use this share of any configured or learned limit. Our clock stamps a
 * reservation a few ms before OpenAI's does, so at the window edge we would
 * otherwise free capacity slightly early and collect a 429.
 */
const SAFETY = 0.9;
const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 30_000;

function header(h: HeaderSource, name: string): string | undefined {
  if (!h) return undefined;
  if (typeof (h as Headers).get === 'function') return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | undefined>;
  return rec[name] ?? rec[name.toLowerCase()];
}

/** "1s", "6m0s", "20ms", "0.5s" → ms. */
function parseDuration(v: string | undefined): number | null {
  if (!v) return null;
  let total = 0;
  let matched = false;
  for (const m of v.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === 'ms' ? n : m[2] === 's' ? n * 1000 : m[2] === 'm' ? n * 60_000 : n * 3_600_000;
  }
  return matched ? total : null;
}

function envLimit(kind: 'TPM' | 'RPM', model: string): number | null {
  const key = `OPENAI_${kind}_${model.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface Waiter {
  tokens: number;
  resolve: (l: Lease) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  onAbort?: () => void;
  signal?: AbortSignal;
}

interface Lane {
  tokenLimit: number;
  requestLimit: number;
  entries: Array<{ t: number; tokens: number }>;
  queue: Waiter[];
  cooldownUntil: number;
  failures: number;
  openUntil: number;
  wake?: ReturnType<typeof setTimeout>;
}

export function createRateScheduler(opts: { windowMs?: number } = {}): RateScheduler {
  const windowMs = opts.windowMs ?? (Number(process.env.OPENAI_RATE_WINDOW_MS) || 60_000);
  const lanes = new Map<string, Lane>();

  function lane(model: string): Lane {
    let l = lanes.get(model);
    if (!l) {
      const d = DEFAULTS[model] ?? FALLBACK_DEFAULT;
      l = {
        tokenLimit: Math.floor((envLimit('TPM', model) ?? d.tokens) * SAFETY),
        requestLimit: Math.floor((envLimit('RPM', model) ?? d.requests) * SAFETY),
        entries: [], queue: [], cooldownUntil: 0, failures: 0, openUntil: 0,
      };
      lanes.set(model, l);
    }
    return l;
  }

  function prune(l: Lane, now: number): void {
    while (l.entries.length > 0 && now - l.entries[0].t >= windowMs) l.entries.shift();
  }

  function reserved(l: Lane): number {
    let s = 0;
    for (const e of l.entries) s += e.tokens;
    return s;
  }

  function lease(model: string): Lease {
    const l = lane(model);
    return {
      ok() { l.failures = 0; },
      fail() {
        l.failures += 1;
        if (l.failures >= BREAKER_THRESHOLD) l.openUntil = Date.now() + BREAKER_OPEN_MS;
      },
    };
  }

  function settle(w: Waiter): void {
    if (w.timer) clearTimeout(w.timer);
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort);
  }

  function pump(model: string): void {
    const l = lane(model);
    if (l.wake) { clearTimeout(l.wake); l.wake = undefined; }
    const now = Date.now();
    prune(l, now);
    while (l.queue.length > 0) {
      if (now < l.cooldownUntil) { schedule(model, l.cooldownUntil - now); return; }
      const head = l.queue[0];
      const used = reserved(l);
      // A single request bigger than the whole limit is admitted into an empty
      // window rather than deadlocking the lane.
      const tokensFit = used + head.tokens <= l.tokenLimit || l.entries.length === 0;
      if (tokensFit && l.entries.length < l.requestLimit) {
        l.queue.shift();
        settle(head);
        l.entries.push({ t: now, tokens: head.tokens });
        head.resolve(lease(model));
        continue;
      }
      const oldest = l.entries[0];
      schedule(model, oldest ? Math.max(1, oldest.t + windowMs - now) : 1);
      return;
    }
  }

  function schedule(model: string, ms: number): void {
    const l = lane(model);
    if (l.wake) clearTimeout(l.wake);
    l.wake = setTimeout(() => pump(model), ms);
  }

  return {
    acquire(model, tokens, o = {}) {
      const l = lane(model);
      if (Date.now() < l.openUntil) {
        return Promise.reject(new SchedulerError('CIRCUIT_OPEN', `${model} circuit open`));
      }
      if (o.signal?.aborted) return Promise.reject(new SchedulerError('ABORTED', 'aborted'));
      return new Promise<Lease>((resolve, reject) => {
        const w: Waiter = { tokens: Math.max(1, Math.ceil(tokens)), resolve, reject, signal: o.signal };
        const drop = (err: SchedulerError) => {
          const i = l.queue.indexOf(w);
          if (i >= 0) l.queue.splice(i, 1);
          settle(w);
          reject(err);
          pump(model);
        };
        if (o.deadline !== undefined) {
          w.timer = setTimeout(
            () => drop(new SchedulerError('SCHEDULER_TIMEOUT', `${model} queue wait exceeded deadline`)),
            Math.max(0, o.deadline - Date.now()),
          );
        }
        if (o.signal) {
          w.onAbort = () => drop(new SchedulerError('ABORTED', 'aborted'));
          o.signal.addEventListener('abort', w.onAbort, { once: true });
        }
        l.queue.push(w);
        pump(model);
      });
    },

    setLimits(model, limits) {
      const l = lane(model);
      l.tokenLimit = limits.tokens;
      l.requestLimit = limits.requests;
      pump(model);
    },

    learn(model, headers) {
      const l = lane(model);
      const tpm = Number(header(headers, 'x-ratelimit-limit-tokens'));
      const rpm = Number(header(headers, 'x-ratelimit-limit-requests'));
      if (Number.isFinite(tpm) && tpm > 0) l.tokenLimit = Math.floor(tpm * SAFETY);
      if (Number.isFinite(rpm) && rpm > 0) l.requestLimit = Math.floor(rpm * SAFETY);
      pump(model);
    },

    rateLimited(model, headers) {
      const l = lane(model);
      this.learn(model, headers);
      const ms = Number(header(headers, 'retry-after-ms'));
      const s = Number(header(headers, 'retry-after'));
      const reset = parseDuration(header(headers, 'x-ratelimit-reset-tokens'));
      const wait = Number.isFinite(ms) && ms > 0 ? ms
        : Number.isFinite(s) && s > 0 ? s * 1000
          : reset ?? 1000;
      l.cooldownUntil = Math.max(l.cooldownUntil, Date.now() + wait);
      pump(model);
    },

    projectedWaitMs(model, tokens) {
      const l = lane(model);
      const now = Date.now();
      prune(l, now);
      const cooldown = Math.max(0, l.cooldownUntil - now);
      const queued = l.queue.reduce((sum, w) => sum + w.tokens, 0);
      let short = reserved(l) + queued + tokens - l.tokenLimit;
      if (short <= 0) return cooldown;
      // Entries expire oldest-first; each one frees its tokens.
      for (const e of l.entries) {
        short -= e.tokens;
        if (short <= 0) return Math.max(cooldown, e.t + windowMs - now);
      }
      // Still short once the whole window has rolled: the rest drains through
      // further full windows.
      return Math.max(cooldown, windowMs * (1 + Math.ceil(short / l.tokenLimit)));
    },

    stats(model) {
      const l = lane(model);
      prune(l, Date.now());
      return {
        tokenLimit: l.tokenLimit,
        requestLimit: l.requestLimit,
        reservedTokens: reserved(l),
        queuedTokens: l.queue.reduce((sum, w) => sum + w.tokens, 0),
        waiting: l.queue.length,
      };
    },
  };
}

let shared: RateScheduler = createRateScheduler();

/** The process-wide scheduler every extraction call goes through. */
export function rateScheduler(): RateScheduler {
  return shared;
}

/** Test seam. */
export function __resetRateScheduler(): void {
  shared = createRateScheduler();
}
