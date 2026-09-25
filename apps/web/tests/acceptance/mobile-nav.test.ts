import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mobile nav v2 — dashboard UX research, ideas 1, 3 and 5 (owner-approved 2026-09-25).
 *
 * Measured on a 390×844 phone before this change:
 *   - no route under /manage had a loading state, so a tab tap froze the old page
 *     until the new one arrived — most of why the bar "doesn't feel good";
 *   - 10 px tab labels, no aria-current, no active pill, re-tap did nothing;
 *   - a Banners tab for a rarely-changed thing, the everyday job (dishes) behind "Products";
 *   - the Settings dot lit for banner issues although Banners had its own tab;
 *   - the header spent its row on a 29 px store switcher most owners never need and an
 *     avatar menu holding only Settings and Sign out.
 *
 * Patterns: WhatsApp's Material 3 bottom bar (4 labelled tabs, pill indicator, count
 * badges) and YouTube's "You" tab (account + library in one place).
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const read = (p: string) => (existsSync(join(SRC, p)) ? readFileSync(join(SRC, p), 'utf8') : '');
const shipped = (p: string) => read(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

const NAV = 'components/MobileNav.tsx';
const SHELL = 'components/ManageLayoutClient.tsx';
const HEADER = 'components/DashboardHeader.tsx';
const YOU = 'app/manage/you/page.tsx';
const DASH = 'app/manage/dashboard/page.tsx';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

const nav = () => import('@/lib/ui/mobileNav');

describe('AC1: flag', () => {
    it('is OFF unless exactly "true"', async () => {
        vi.stubEnv('NEXT_PUBLIC_MOBILE_NAV_V2', '');
        expect((await nav()).MOBILE_NAV_V2).toBe(false);
        vi.resetModules();
        vi.stubEnv('NEXT_PUBLIC_MOBILE_NAV_V2', 'yes');
        expect((await nav()).MOBILE_NAV_V2).toBe(false);
        vi.resetModules();
        vi.stubEnv('NEXT_PUBLIC_MOBILE_NAV_V2', 'true');
        expect((await nav()).MOBILE_NAV_V2).toBe(true);
    });
});

describe('AC2: four tabs, every page belongs to one', () => {
    it('is Home, Menu, QR, You', async () => {
        const { NAV_V2 } = await nav();
        expect(NAV_V2.map(t => [t.id, t.label, t.href])).toEqual([
            ['home', 'Home', '/manage/dashboard'],
            ['menu', 'Menu', '/manage/product-inventory'],
            ['qr', 'QR', '/manage/qr'],
            ['you', 'You', '/manage/you'],
        ]);
    });

    it('maps each dashboard page to its tab', async () => {
        const { activeTabFor } = await nav();
        expect(activeTabFor('/manage/dashboard')).toBe('home');
        expect(activeTabFor('/manage/product-inventory')).toBe('menu');
        expect(activeTabFor('/manage/qr')).toBe('qr');
        for (const p of ['/manage/you', '/manage/settings', '/manage/banner-management', '/manage/subscription']) {
            expect(activeTabFor(p), p).toBe('you');
        }
        expect(activeTabFor('/somewhere-else')).toBeNull();
    });
});

describe('AC3: badges carry information', () => {
    it('counts dishes without photos, capped at 9+', async () => {
        const { badgeText } = await nav();
        expect(badgeText(0)).toBeNull();
        expect(badgeText(3)).toBe('3');
        expect(badgeText(9)).toBe('9');
        expect(badgeText(12)).toBe('9+');
    });

    it('the bar puts the photo count on Menu and settings/banner issues on You', () => {
        const src = shipped(NAV);
        expect(src).toMatch(/badgeText\(missingImageCount\)/);
        expect(src).toMatch(/settingsIncomplete \|\| bannerDot/);
    });
});

describe('AC4: an accessible, app-like bar', () => {
    it('marks the current tab, labels at 12 px or more, re-tap scrolls to top', () => {
        const src = shipped(NAV);
        expect(src).toMatch(/aria-current=\{[^}]*'page'/);
        expect(src).toMatch(/fontSize: 12\b/);
        expect(src).toMatch(/scrollTo\(\{ top: 0/);
    });

    it('keeps today\'s bar when the flag is off', () => {
        const src = shipped(NAV);
        expect(src).toMatch(/MOBILE_NAV_V2 && qrMenuOnly/);
        expect(src).toMatch(/QR_MENU_NAV/);
    });
});

describe('AC5: a tap answers at once', () => {
    it('the pending store notifies, sets and clears', async () => {
        const { startNav, clearNav, getPendingNav, subscribePendingNav } = await import('@/lib/ui/navPending');
        const seen: Array<string | null> = [];
        const off = subscribePendingNav(() => seen.push(getPendingNav()));
        startNav('/manage/qr');
        expect(getPendingNav()).toBe('/manage/qr');
        clearNav();
        expect(getPendingNav()).toBeNull();
        off();
        startNav('/manage/you');
        expect(seen).toEqual(['/manage/qr', null]);
        clearNav();
    });

    it('the bar starts it and the shell shows a skeleton and progress until the page changes', () => {
        expect(shipped(NAV)).toMatch(/startNav\(/);
        const shell = shipped(SHELL);
        expect(shell).toMatch(/usePendingNav\(\)/);
        expect(shell).toMatch(/clearNav\(\)/);
        expect(shell).toMatch(/<ProgressTrack\b/);
        expect(shell).toMatch(/Skeleton/);
    });
});

describe('AC6: the You page', () => {
    /**
     * Superseded 2026-09-25 by the You tab redesign (owner-approved; see
     * you-tab.test.ts AC6): the rows now open phone-first screens under
     * /manage/you/… instead of the desktop banner and subscription pages, and
     * the sign-out question names the app.
     */
    it('has every destination that left the bar and the header', () => {
        const you = shipped(YOU);
        for (const label of ['Store details', 'Banners', 'Plan', 'Help', 'Add a store', 'Sign out']) {
            expect(you, label).toContain(label);
        }
        expect(you).toMatch(/YOU_ROUTES\.banners/);
        expect(you).toMatch(/YOU_ROUTES\.plan/);
        expect(you).toMatch(/storeCreation\(/);
    });

    it('asks before signing out', () => {
        expect(shipped(YOU)).toMatch(/Sign out of vsite\?/);
    });
});

describe('AC7: a simpler phone header', () => {
    it('hides the avatar on phones and the switcher for one-store owners', () => {
        const h = shipped(HEADER);
        expect(h).toMatch(/MOBILE_NAV_V2/);
        expect(h).toMatch(/allSites\.length > 1/);
        expect(h).toMatch(/hidden md:block/);
    });

    it('labels the dashboard\'s preview button', () => {
        expect(shipped(DASH)).toMatch(/View menu/);
    });
});

describe('AC8: one rule for adding stores', () => {
    it('allows a new store under both limits, blocks at either', async () => {
        const { storeCreation } = await import('@/lib/store/storeLimits');
        const day = 86_400_000;
        const now = Date.parse('2026-09-25T00:00:00Z');
        const trial = (ageDays: number) => ({ created_at: new Date(now - ageDays * day).toISOString(), site_subscriptions: null });
        const paid = () => ({ created_at: new Date(now - 90 * day).toISOString(), site_subscriptions: { store_expires_at: new Date(now + 20 * day).toISOString() } });
        expect(storeCreation([trial(1)], now).canCreate).toBe(true);
        expect(storeCreation([trial(1), trial(2)], now)).toMatchObject({ canCreate: false, atTrialLimit: true });
        expect(storeCreation([paid(), paid(), paid(), paid(), paid()], now)).toMatchObject({ canCreate: false, atPaidLimit: true });
        expect(storeCreation([paid(), trial(1)], now)).toMatchObject({ canCreate: true, paidCount: 1, activeTrialCount: 1 });
    });

    it('the header uses it too', () => {
        expect(shipped(HEADER)).toMatch(/storeCreation\(/);
    });
});
