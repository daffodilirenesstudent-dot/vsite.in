import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The category filter follows the reader.
 *
 * Today the chip row is not sticky at all: it scrolls away with the content,
 * so changing category on a 60-item menu means scrolling back to the very top.
 * That is the complaint.
 *
 * The fix is the quick-return pattern (Material's scroll-aware app bar;
 * headroom.js is the same idea): the bar hides while you scroll down into the
 * food and comes back the moment you scroll up, wherever you are in the list.
 *
 * ── Why a pixel tolerance and not "two scrolls" ────────────────────────────
 *
 * Counting scroll events is the intuitive rule and the wrong one. A single
 * flick is ONE event but 800px of travel; a slow drag down a long menu is
 * dozens of events and 10px. Counting either fires far too early or never
 * fires. Every shipped implementation of this pattern instead measures
 * DISTANCE travelled in one direction, and the tolerances are deliberately
 * ASYMMETRIC:
 *
 *   - small going up, because an upward scroll IS the request to get the
 *     filter back and hesitating feels broken;
 *   - larger going down, so a thumb that wobbles mid-read does not strobe the
 *     bar in and out.
 *
 * Plus an offset: near the top of the page the bar is always shown, because
 * there is nothing to gain by hiding it and a bar that vanishes on the first
 * 20px feels twitchy.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const shipped = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const HOOK = 'hooks/useQuickReturn.ts';
const TEMPLATE = 'components/templates/QRMenuTemplate.tsx';

describe('useQuickReturn', () => {
    const hook = () => shipped(HOOK);

    it('exists as a hook of its own, not a branch inside the template', () => {
        expect(read(HOOK)).toMatch(/export function useQuickReturn/);
    });

    it('measures distance travelled, not the number of scroll events', () => {
        const src = hook();
        expect(src, 'a scroll-event counter cannot tell a flick from a drag')
            .not.toMatch(/eventCount|scrollCount|timesScrolled/);
        expect(src).toMatch(/upTolerance/);
        expect(src).toMatch(/downTolerance/);
    });

    it('is more eager to show than to hide', () => {
        // The asymmetry is the whole point, so it is asserted rather than left
        // to whoever next tunes the numbers.
        const src = read(HOOK);
        const up = Number(/upTolerance\s*=\s*(\d+)/.exec(src)?.[1]);
        const down = Number(/downTolerance\s*=\s*(\d+)/.exec(src)?.[1]);
        expect(Number.isFinite(up) && Number.isFinite(down), 'defaults must be literal numbers').toBe(true);
        expect(up, 'showing must need less travel than hiding').toBeLessThan(down);
    });

    it('always shows the bar near the top of the page', () => {
        expect(hook()).toMatch(/offset/);
    });

    it('reads scroll position on a frame, not on every event', () => {
        expect(hook(), 'an unthrottled scroll handler janks a long menu on a cheap phone')
            .toMatch(/requestAnimationFrame/);
        expect(hook()).toMatch(/passive: true/);
    });
});

describe('nothing upstream breaks position: sticky', () => {
    const css = () => readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');

    it('clips horizontal overflow instead of hiding it', () => {
        // `overflow-x: hidden` on html/body turns them into a scroll
        // container, and a sticky descendant then sticks to THAT rather than
        // to the viewport — which is why the category bar did not stick. It
        // also moves the scroll position off window.scrollY. `clip` does the
        // same visual job without creating a scroll container.
        expect(css(), 'overflow-x: clip is what makes sticky work at all')
            .toMatch(/overflow-x:\s*clip/);
    });

    it('keeps hidden as the fallback for browsers without clip', () => {
        const src = css();
        const hidden = src.indexOf('overflow-x: hidden');
        const clip = src.indexOf('overflow-x: clip');
        expect(hidden).toBeGreaterThan(-1);
        expect(clip, 'clip must come second so it wins where supported').toBeGreaterThan(hidden);
    });
});

/** Just the category bar's style block, so assertions cannot hit the header. */
function s_slice(src: string): string {
    const start = src.indexOf('data-testid="category-bar"');
    if (start < 0) return '';
    return src.slice(start, src.indexOf('>', src.indexOf('willChange', start)));
}

describe('the category bar itself', () => {
    const tpl = () => shipped(TEMPLATE);

    it('sticks below the header instead of scrolling away', () => {
        expect(
            tpl(),
            'the bar must be sticky — scrolling to the top to change category is the bug',
        ).toMatch(/data-testid="category-bar"/);
        expect(tpl()).toMatch(/position: 'sticky'/);
    });

    it('hides by moving, so the list never reflows', () => {
        // Animating height would relayout the whole list every frame on a
        // ₹8,000 Android. Transform stays on the compositor.
        expect(tpl()).toMatch(/translateY\(-100%\)/);
    });

    it('draws no hairline between itself and the first category heading', () => {
        // Added, then cut on sight: the bar already separates itself by
        // moving, and the rule sat directly above the category name.
        const bar = s_slice(shipped(TEMPLATE));
        expect(bar, 'the category bar must not carry a bottom border')
            .not.toMatch(/borderBottom/);
    });

    it('sits under the header rather than over it', () => {
        // It slides up and disappears behind the header, which stays put.
        expect(tpl()).toMatch(/zIndex: 40/);
    });

    it('respects reduced motion', () => {
        expect(tpl()).toMatch(/prefersReducedMotion|prefers-reduced-motion/);
    });
});
