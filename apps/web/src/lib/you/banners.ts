/**
 * Banner rules for the phone screen. Pure; the queries are in bannerData.ts.
 */

/** The customer menu shows banners in this crop (QRMenuTemplate's carousel). */
export const BANNER_ASPECT = { w: 351, h: 134 } as const;
export const BANNER_ASPECT_CSS = `${BANNER_ASPECT.w} / ${BANNER_ASPECT.h}`;

export interface Banner {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    sort_order: number;
    is_active: boolean;
    created_at: string;
}

/**
 * Move one banner up or down and renumber the list 0…n. The same list comes
 * back untouched at either end, so callers can compare by reference.
 */
export function moveBanner<T extends { id: string; sort_order: number }>(list: T[], id: string, dir: 'up' | 'down'): T[] {
    const from = list.findIndex(b => b.id === id);
    const to = dir === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next.map((b, i) => ({ ...b, sort_order: i }));
}

/** Only the rows whose position changed — one update each, not one per banner. */
export function orderChanges<T extends { id: string; sort_order: number }>(before: T[], after: T[]): Array<{ id: string; sort_order: number }> {
    const was = new Map(before.map(b => [b.id, b.sort_order]));
    return after.filter(b => was.get(b.id) !== b.sort_order).map(b => ({ id: b.id, sort_order: b.sort_order }));
}

export function bannerSummary(list: ReadonlyArray<{ is_active: boolean }>): string {
    if (list.length === 0) return 'Add your first banner';
    const showing = list.filter(b => b.is_active).length;
    return showing === 0 ? 'None showing right now' : `${showing} showing on your menu`;
}

/** "1st", "2nd" … the position a customer sees it in. */
export function ordinal(n: number): string {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
