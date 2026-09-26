/**
 * Whether this browser belongs to a store's owner, so the owner's own visits
 * to their menu — "View menu" from the dashboard, or scanning their own QR to
 * check it — are not counted as customer scans.
 *
 * The dashboard records the stores it manages on this device; the public menu
 * skips the scan ping for those. Per-device on purpose: it needs no login on
 * the menu, and a diner's phone has never opened the dashboard.
 *
 * Storage can be missing, full or denied (private mode). Every failure reads as
 * "not the owner", so the worst case is one extra scan, never a broken menu.
 */

const KEY = 'vsite_owner_sites';

function read(storage: Storage): string[] {
    try {
        const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
        return [];
    }
}

/** Remember the owner's stores on this device, alongside any recorded before. */
export function markOwnerDevice(storage: Storage, siteIds: readonly string[]): void {
    try {
        const next = Array.from(new Set([...read(storage), ...siteIds.filter(Boolean)]));
        storage.setItem(KEY, JSON.stringify(next));
    } catch { /* not remembered: the owner's visit counts once, nothing breaks */ }
}

export function isOwnerDevice(storage: Storage, siteId: string): boolean {
    return read(storage).includes(siteId);
}
