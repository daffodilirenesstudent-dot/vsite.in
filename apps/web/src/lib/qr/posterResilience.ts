/**
 * The QR poster on a phone network: a blip must not become a failure, and a
 * wait must never become a hang. Pure — no DOM.
 */

/**
 * Runs `fn` up to `attempts` times, waiting `delayMs × attempt` between tries.
 * Rejects with the last error. For loads that fail transiently on mobile data.
 */
export async function withRetry<T>(fn: () => Promise<T>, { attempts = 3, delayMs = 400 }: { attempts?: number; delayMs?: number } = {}): Promise<T> {
    let last: unknown;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            last = err;
            if (i < attempts) await new Promise(r => setTimeout(r, delayMs * i));
        }
    }
    throw last;
}

export type Settled = { ok: true } | { ok: false; reason: 'error' | 'timeout'; error?: unknown };

/**
 * Waits for `p`, but for at most `ms`, and never rejects. For waits whose
 * outcome changes how something looks, not whether it can be made.
 */
export function settleWithin(p: Promise<unknown>, ms: number): Promise<Settled> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), ms);
        p.then(
            () => { clearTimeout(timer); resolve({ ok: true }); },
            error => { clearTimeout(timer); resolve({ ok: false, reason: 'error', error }); },
        );
    });
}
