import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * How published content is allowed to talk about ordering.
 *
 * The Smart QR Menu has been live since March 2026 and restaurants use it
 * daily. Menu ordering with UPI payment is NOT live — it is frozen behind
 * `ORDERING_FROZEN` — but it is on the roadmap and content may say so.
 *
 * So there are two failure modes, and this suite guards both:
 *
 *   - claiming ordering/UPI works today  → misleads buyers into paying ₹299
 *     for something they cannot use, and contradicts the support FAQ
 *   - denying ordering exists at all     → the owner wants the roadmap public
 *
 * The rule is therefore: mention it freely, always as forthcoming.
 */

const WEB = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(WEB, 'src', p), 'utf8');

const POSTS = 'content/blog/posts.ts';
const SEO = 'content/seo-pages/data.ts';
const ROADMAP = 'content/roadmap.ts';

describe('a single source of truth for the roadmap facts', () => {
    it('exists so 24 articles cannot drift apart', () => {
        const roadmap = read(ROADMAP);
        expect(roadmap).toMatch(/SMART_QR_MENU_LIVE_SINCE/);
        expect(roadmap).toMatch(/ORDERING_COMING_SOON/);
    });

    it('states the launch month the owner confirmed', () => {
        expect(read(ROADMAP)).toMatch(/March 2026/);
    });

    it('frames ordering as forthcoming, never as available', () => {
        const roadmap = read(ROADMAP);
        expect(roadmap).toMatch(/coming soon/i);
        expect(roadmap).toMatch(/UPI/);
    });
});

describe('no published content claims ordering or UPI works today', () => {
    /**
     * Verbatim claims that were live in the articles. Each asserted a
     * capability `ORDERING_FROZEN` blocks.
     */
    const FALSE_CLAIMS: [file: string, claim: string][] = [
        [POSTS, "Restaurants using vsite's QR ordering reduce order errors"],
        [POSTS, 'Orders stay in a Pending queue until you accept them'],
        [POSTS, 'Accept orders within 2 minutes'],
        [POSTS, 'The QR ordering feature is popular in high-volume hotels'],
        [POSTS, "vsite's UPI payment integration is particularly relevant"],
        [POSTS, 'AI food photos, and UPI payment at ₹299/month'],
        [POSTS, 'multilingual menus and accept UPI payment'],
    ];

    it.each(FALSE_CLAIMS)('%s no longer claims: %s', (file, claim) => {
        expect(read(file)).not.toContain(claim);
    });

    it('no article title promises order management', () => {
        expect(read(POSTS)).not.toMatch(/title: 'How to Manage Restaurant Orders with vsite — Accept, Track & Fulfil'/);
    });
});

describe('ordering is still mentioned, as coming soon', () => {
    it.each([POSTS, SEO])('%s keeps the roadmap visible', (file) => {
        const src = read(file);
        expect(src, 'ordering must not be scrubbed entirely').toMatch(/ordering/i);
        expect(src).toMatch(/UPI/);
        expect(src, 'must frame it as forthcoming').toMatch(/coming soon|not live yet|on the roadmap/i);
    });

    it('the QR menu is dated so answer engines can quote it', () => {
        // AEO/GEO: a checkable date extracts better than "recently".
        expect(read(POSTS)).toMatch(/March 2026/);
    });
});

describe('marketing pages tell the same story', () => {
    it.each(['app/features/page.tsx', 'app/pricing/page.tsx'])(
        '%s says ordering is coming, not available',
        (page) => {
            const src = read(page);
            expect(src).toMatch(/coming soon|not live yet/i);
            expect(src).toMatch(/UPI|ordering/i);
        },
    );
});

/**
 * QA 2026-09-26: two surfaces a DINER sees still sold ordering as live. Both
 * were missed because this suite only read articles and marketing pages.
 *
 *   - the customer menu footer on every store: "Skip the queue. Scan & order"
 *   - the QR page's classic poster, printed on every table: artwork with
 *     "SCAN & ORDER" baked into the PNG
 */
describe('what diners see does not advertise ordering', () => {
    const ORDER_CLAIM = /scan\s*(?:&|&amp;|and)\s*order|skip the queue/i;
    const shippedSrc = (p: string) => read(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

    it('the customer menu footer does not say "Scan & order"', () => {
        expect(shippedSrc('components/templates/QRMenuTemplate.tsx')).not.toMatch(ORDER_CLAIM);
    });

    it('the classic QR poster is the menu artwork while ordering is frozen, on every plan', async () => {
        const { classicPosterTemplate, MENU_POSTER } = await import('@/lib/qr/posterTemplate');
        for (const plan of [
            { qrMenuOnly: true, isQrOrder: false },
            { qrMenuOnly: false, isQrOrder: true },
            { qrMenuOnly: false, isQrOrder: false },
        ]) {
            expect(classicPosterTemplate(plan, true)).toBe(MENU_POSTER);
        }
    });

    it('a menu-only store never gets ordering artwork, even after ordering unfreezes', async () => {
        const { classicPosterTemplate, MENU_POSTER } = await import('@/lib/qr/posterTemplate');
        expect(classicPosterTemplate({ qrMenuOnly: true, isQrOrder: false }, false)).toBe(MENU_POSTER);
    });

    it('keeps the ordering artwork for the day ordering ships', async () => {
        const { classicPosterTemplate, MENU_POSTER } = await import('@/lib/qr/posterTemplate');
        expect(classicPosterTemplate({ qrMenuOnly: false, isQrOrder: true }, false)).not.toBe(MENU_POSTER);
    });

    it('the menu artwork exists in public/', async () => {
        const { MENU_POSTER } = await import('@/lib/qr/posterTemplate');
        expect(existsSync(join(WEB, 'public', decodeURI(MENU_POSTER)))).toBe(true);
        expect(MENU_POSTER).not.toMatch(/order/i);
    });

    it('the QR page picks its poster through that rule, not a hardcoded ordering PNG', () => {
        const page = shippedSrc('app/manage/qr/page.tsx');
        expect(page).toMatch(/classicPosterTemplate\(/);
        expect(page).not.toMatch(/brand poster (scan order|template)\.png/);
    });
});
