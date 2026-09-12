/**
 * The physical goods vsite sells.
 *
 * There is exactly one: an NFC + QR sticker. It replaced the ₹99 NFC card,
 * whose price lived as a bare `99` in five places — four in the QR page and
 * once as `cardCount * 99` in the request route. That duplication is why the
 * subscription card could advertise "NFC card + QR stickers" as included in
 * ₹299 while the QR page charged for them: nothing tied the two together.
 *
 * Every surface that shows or computes a sticker price imports from here.
 *
 * Note this is NOT a checkout. `/api/manage/qr-card-request` emails the team
 * and the owner is contacted to arrange payment, so no amount computed here is
 * ever charged automatically. Razorpay and `@/lib/payments` are not involved.
 */

/** Rupees per sticker. INR only — vsite does not sell outside India. */
export const QR_STICKER_PRICE_INR = 30;

/** What to call it in owner-facing copy, so the page and the email agree. */
export const QR_STICKER_LABEL = 'NFC + QR sticker';

/**
 * Ceiling on a single order. The old card flow capped at 200 tables and this
 * keeps that, mostly so a fat-fingered or hostile quantity cannot produce an
 * order confirmation quoting a six-figure total.
 */
export const MAX_STICKER_QTY = 200;

/**
 * Coerce whatever arrived — a form string, a JSON number, undefined — into a
 * quantity we are willing to act on.
 *
 * An owner who submits nothing meant one sticker, not zero, so the floor is 1.
 * The cap is applied here rather than at the call site because the route and
 * the page both need it and only one of them is trustworthy.
 */
export function normaliseStickerQty(raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(Math.floor(n), MAX_STICKER_QTY);
}

/** Order total in rupees, for a quantity from any source. */
export function stickerOrderTotal(raw: unknown): number {
    return normaliseStickerQty(raw) * QR_STICKER_PRICE_INR;
}
