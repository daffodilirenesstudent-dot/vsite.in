/**
 * Canvas shapes drawn with calls every phone browser has.
 *
 * `ctx.roundRect` exists only from Chrome 99 / Safari 16. On anything older —
 * iPhones on iOS 15, older built-in Android browsers — calling it throws, and on
 * 2026-10-03 that made every QR poster fail with "could not load" (reproduced:
 * docs/incidents/2026-10-03-qr-poster-mobile.md). `arcTo` has been in every
 * browser for over a decade. tests/acceptance/poster-resilience.test.ts keeps
 * the native call out of the poster pipeline.
 */

/**
 * Adds a rounded rectangle to the current path — a drop-in for the native
 * rounded-rectangle call. Like it, it does not begin a new path, so
 * call `beginPath()` first and `fill()`, `stroke()` or `clip()` after. The
 * radius is clamped to half the shorter side.
 */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
