/**
 * What vsite ships today, and what it has promised publicly.
 *
 * One place, because the claim appears across 24 blog articles, the SEO
 * landing pages, and the marketing pages. When ordering launches, the copy
 * that needs revisiting is whatever imports from here — not 24 files found by
 * grep, which is how the last round of stale claims survived.
 *
 * The product truth these strings describe lives in
 * `@/lib/platform/productFlags` (`ORDERING_FROZEN`). Keep them in step: if the
 * flag flips, every string below becomes wrong on the same day.
 */

/** When the Smart QR Menu went live. A checkable date extracts better than "recently". */
export const SMART_QR_MENU_LIVE_SINCE = 'March 2026';

/**
 * The standard roadmap sentence.
 *
 * Says three things deliberately: the menu works now, ordering does not, and
 * ordering is coming. Dropping the middle clause is what produced the articles
 * that sold a frozen feature.
 */
export const ORDERING_COMING_SOON =
    `The Smart QR Menu has been live since ${SMART_QR_MENU_LIVE_SINCE} and restaurants across ` +
    'Tamil Nadu use it every day. In-menu ordering with UPI payment is not live yet — it is ' +
    'coming soon. Until then customers browse the menu on their phone and order with your ' +
    'staff exactly as they do now.';

/** Short form, for tables, FAQ answers and meta descriptions where the long form will not fit. */
export const ORDERING_COMING_SOON_SHORT =
    'Menu ordering with UPI payment is coming soon — not live yet.';

/** For "what do I get today" lists, so the boundary is stated rather than implied. */
export const AVAILABLE_TODAY =
    'Available today: the Smart QR Menu — AI menu extraction, food photos for every dish, ' +
    'Tamil and English, live price and sold-out updates, and menu analytics.';
