/**
 * The menu's motion system. One system, shared by all three designs.
 *
 * The menu has to read as an app, not a web page — a diner who scans a QR code
 * has a Swiggy-shaped expectation of how a list should feel, and a page that
 * simply appears reads as cheap next to it.
 *
 * ─── MOTION IS NOT THE EIGHTH THEME KNOB ─────────────────────────────────────
 * Deliberately NOT per-theme. "Smooth" is a baseline quality, not a brand
 * attribute, and per-design timings would triple the motion QA — which is the
 * whole economic argument for shipping three designs instead of six. Classic,
 * Cafe and Premium run identical timings.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three rules, none of them invented here:
 *
 *   1. TRANSFORM AND OPACITY ONLY. Never height, width, top, left or margin.
 *      QRMenuTemplate already states why on the category bar: "animating height
 *      would relayout the whole list every frame on the cheap Androids most of
 *      our readers use."
 *
 *   2. NO OVERSHOOT. `menu-card-system.test.ts` forbids
 *      cubic-bezier(0.34,1.2,0.64,1) on the detail sheet — "the bouncing curve
 *      makes a photo panel look cheap" — and the same holds for the list. A
 *      menu settles; it does not bounce. Everything below uses SETTLE, the same
 *      curve the sheet opens on, so the whole surface shares one feel.
 *
 *   3. STAND DOWN FOR prefers-reduced-motion. Not a courtesy: motion sickness
 *      is real, and this is a page people read while eating.
 *
 * The app feel comes from restraint and consistent timing, not from more
 * animation. Anything that moves twice for one intent gets cut.
 */

/** The settle curve. Shared with the detail sheet, which is asserted on it. */
export const SETTLE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Reveal timings.
 *
 * 320ms with a 30ms stagger over the first six rows. An earlier pass used
 * 400/35 on the theory that a slower reveal covered image loading — it does
 * not: the thumbnail skeleton covers that independently, so the extra time was
 * bought for nothing and only made the menu feel heavier to open.
 */
export const REVEAL_MS = 320;
export const STAGGER_MS = 30;
export const STAGGER_MAX = 6;

/** Press feedback. The card value matches the shipped `qr-card-press`. */
export const PRESS_CARD = 0.985;
export const PRESS_CHIP = 0.96;

/** Delay for the nth row, capped so a long menu never waits on a queue. */
export function staggerDelayMs(index: number): number {
    return Math.min(index, STAGGER_MAX) * STAGGER_MS;
}

/**
 * The stylesheet, injected once by QRMenuTemplate.
 *
 * Interpolates only module constants — never anything the owner supplied. The
 * owner's brand colour reaches the page as a CSS custom property instead, so
 * nothing user-controlled is ever concatenated into a style block.
 */
export const MENU_MOTION_CSS = `
@keyframes qr-rise {
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to   { opacity: 1; transform: none; }
}

.qr-rise { animation: qr-rise ${REVEAL_MS}ms ${SETTLE} both; }

.qr-chip { transition: transform 140ms ${SETTLE}, background-color 160ms ease, color 160ms ease, border-color 160ms ease; }
.qr-chip:active { transform: scale(${PRESS_CHIP}); }

.qr-card-press { transition: transform 160ms ${SETTLE}; }
.qr-card-press:active { transform: scale(${PRESS_CARD}); }

/* A long menu must not paint rows nobody has scrolled to yet. */
.qr-section { content-visibility: auto; contain-intrinsic-size: auto 640px; }

/* The thumbnail settles in rather than popping once decoded. */
.qr-thumb-img { opacity: 0; transition: opacity 240ms ease; }
.qr-thumb-img[data-loaded='true'] { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .qr-rise { animation: none; }
  .qr-chip, .qr-card-press, .qr-thumb-img { transition: none; }
  .qr-thumb-img { opacity: 1; }
}
`;
