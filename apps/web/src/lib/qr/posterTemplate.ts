/**
 * Which artwork the classic QR poster is printed on. Pure and client-safe.
 *
 * The two original PNGs carry their headline in the pixels: "SCAN & ORDER"
 * and "SKIP THE QUEUE. SCAN & ORDER". While ordering is frozen, and always for
 * a menu-only store, a poster on a table must not promise ordering — so those
 * stores get the same artwork reading "SCAN FOR MENU". The ordering artwork
 * stays in public/ so unfreezing is a flag flip, not a redesign.
 */
import { ORDERING_FROZEN } from '@/lib/platform/productFlags';

export const MENU_POSTER = '/brand poster scan menu.png';
const QR_ORDER_POSTER = '/brand poster scan order.png';
const PAY_EAT_POSTER = '/brand poster template.png';

export function classicPosterTemplate(
    plan: { qrMenuOnly: boolean; isQrOrder: boolean },
    orderingFrozen: boolean = ORDERING_FROZEN,
): string {
    if (orderingFrozen || plan.qrMenuOnly) return MENU_POSTER;
    return plan.isQrOrder ? QR_ORDER_POSTER : PAY_EAT_POSTER;
}
