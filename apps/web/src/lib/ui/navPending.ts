import { useSyncExternalStore } from 'react';

/**
 * "A tab was just tapped and its page is on the way."
 *
 * The /manage pages have no loading states, so between a tap and the new page
 * the old one sat frozen — the main reason the bar felt slow. The bar records
 * the destination here the instant it is tapped; the shell shows a skeleton and
 * a progress track until the pathname changes, and the bar lights the tapped
 * tab straight away.
 */

let pending: string | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
    listeners.forEach(l => l());
}

export function startNav(href: string) {
    pending = href;
    // Never leave a skeleton up forever if a navigation silently fails.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => clearNav(), 12_000);
    emit();
}

export function clearNav() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending === null) return;
    pending = null;
    emit();
}

export function getPendingNav(): string | null {
    return pending;
}

export function subscribePendingNav(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function usePendingNav(): string | null {
    return useSyncExternalStore(subscribePendingNav, getPendingNav, () => null);
}
