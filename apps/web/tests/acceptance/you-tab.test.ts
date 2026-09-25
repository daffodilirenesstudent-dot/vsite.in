import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * You tab redesign — owner-approved 2026-09-25 on the design canvas
 * (https://claude.ai/artifact/JH435VTbKGwj3dDP9M1xSy).
 *
 * What the owner saw on a phone before this change:
 *   - the You page opened on "Your account", a phone number and the store
 *     name — nothing an owner can act on;
 *   - every row opened a desktop page: Store details and Menu design as tabs of
 *     an 1,800-line settings screen with a breadcrumb, Banners as a five-column
 *     table, the plan as a desktop pricing page;
 *   - Help opened the public marketing FAQ;
 *   - Sign out sat in its own red section, one tap from a confirmation — and
 *     every re-login costs an SMS.
 *
 * The new screens live under /manage/you/…, reuse today's backend exactly, and
 * the ₹299 checkout is moved — not rewritten — into one hook both plan screens use.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const read = (p: string) => (existsSync(join(SRC, p)) ? readFileSync(join(SRC, p), 'utf8') : '');
const shipped = (p: string) => read(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const YOU = 'app/manage/you/page.tsx';
const page = (s: string) => `app/manage/you/${s}/page.tsx`;
const SHELL = 'components/ManageLayoutClient.tsx';
const SUBSCRIPTION = 'app/manage/subscription/page.tsx';
const SETTINGS = 'app/manage/settings/page.tsx';
const HOOK = 'hooks/useQrMenuCheckout.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-25T06:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

// ─────────────────────────────────────────────────────────────────────────────

describe('AC1: plan status is one pure rule', () => {
    // The trial window is the store's own trial_ends_at since "one free trial
    // per account" (2026-09-25, one-trial.test.ts); these fixtures give each
    // store the window it would have had: created + trial length.
    it('reads trial, active, ending soon, trial ended and expired', async () => {
        const { planStatus } = await import('@/lib/you/planStatus');
        const { PLAN_PRICES_INR, TRIAL_DURATION_MS } = await import('@/lib/platform/productFlags');
        const price = PLAN_PRICES_INR.qr_menu;
        const trialFor = (createdMs: number) => iso(createdMs + TRIAL_DURATION_MS);

        const trial = planStatus({ created_at: iso(NOW - 2 * DAY), site_subscriptions: { store_expires_at: null, trial_ends_at: trialFor(NOW - 2 * DAY) } }, NOW);
        expect(trial).toMatchObject({ state: 'trial', daysLeft: 5, canPay: false, cta: null });
        expect(trial.progress).toBeCloseTo(2 / 7, 2);
        expect(trial.endsAt.getTime()).toBe(NOW - 2 * DAY + TRIAL_DURATION_MS);

        const active = planStatus({ created_at: iso(NOW - 60 * DAY), site_subscriptions: { store_expires_at: iso(NOW + 20 * DAY) } }, NOW);
        expect(active).toMatchObject({ state: 'active', daysLeft: 20, canPay: false, cta: null });

        const soon = planStatus({ created_at: iso(NOW - 60 * DAY), site_subscriptions: { store_expires_at: iso(NOW + 3 * DAY) } }, NOW);
        expect(soon).toMatchObject({ state: 'endingSoon', daysLeft: 3, canPay: false });

        // Paid during the trial: the plan is what counts.
        const paidEarly = planStatus({ created_at: iso(NOW - DAY), site_subscriptions: { store_expires_at: iso(NOW + 30 * DAY), trial_ends_at: trialFor(NOW - DAY) } }, NOW);
        expect(paidEarly.state).toBe('active');

        const ended = planStatus({ created_at: iso(NOW - 10 * DAY), site_subscriptions: { store_expires_at: null, trial_ends_at: trialFor(NOW - 10 * DAY) } }, NOW);
        expect(ended).toMatchObject({ state: 'trialEnded', daysLeft: 0, canPay: true, price });
        expect(ended.cta).toBe(`Activate — ₹${price}/month`);
        expect(ended.endsAt.getTime()).toBe(NOW - 10 * DAY + TRIAL_DURATION_MS);

        const expired = planStatus({ created_at: iso(NOW - 90 * DAY), site_subscriptions: { store_expires_at: iso(NOW - 5 * DAY) } }, NOW);
        expect(expired).toMatchObject({ state: 'expired', daysLeft: 0, canPay: true, cta: `Renew — ₹${price}` });
    });
});

describe('AC2: store details', () => {
    const full = {
        name: 'Cream Story', contact_number: '+91 12345 67890', location: 'Anna Nagar, Madurai',
        pincode: '625020', business_type: 'cafe', timing: '9:00 AM - 11:00 PM',
    };

    it('turns the first missing detail into the You-page nudge', async () => {
        const { detailsNudge } = await import('@/lib/you/storeDetails');
        expect(detailsNudge(full)).toBeNull();
        expect(detailsNudge(null)).toBeNull();
        expect(detailsNudge({ ...full, timing: '' })).toBe('Add your opening hours');
        expect(detailsNudge({ ...full, business_type: null, timing: null })).toBe('Choose your type of place');
        expect(detailsNudge({ ...full, contact_number: ' ', timing: null })).toBe('Add a phone number for customers');
    });

    it('checks the columns the You dot checks, so the two never disagree', () => {
        const dot = read('components/NotificationContext.tsx');
        for (const col of ['name', 'contact_number', 'location', 'business_type', 'timing']) {
            expect(dot, col).toMatch(new RegExp(`row\\.${col}`));
        }
    });

    it('validates and saves exactly what settings saves', async () => {
        const m = await import('@/lib/you/storeDetails');
        const form = m.formFromRow(full);
        expect(m.validateStoreDetails(form)).toBeNull();
        expect(m.validateStoreDetails({ ...form, name: '  ' })).toMatch(/name/i);
        expect(m.validateStoreDetails({ ...form, pincode: '012345' })).toMatch(/PIN/);

        expect(m.detailsUpdate({ ...form, name: ' Cream Story ', phone: '' }, full.timing)).toEqual({
            name: 'Cream Story', contact_number: null, location: 'Anna Nagar, Madurai',
            pincode: '625020', business_type: 'cafe', timing: '9:00 AM - 11:00 PM',
        });

        // Hours typed into the old free-text box survive until the owner picks new ones.
        const legacy = m.formFromRow({ ...full, timing: 'morning to night' });
        expect(legacy.timing).toEqual({ open247: false, opensAt: null, closesAt: null });
        expect(m.detailsUpdate(legacy, 'morning to night').timing).toBe('morning to night');

        // The sign-in number fills an empty phone, never replaces a saved one.
        expect(m.formFromRow({ ...full, contact_number: null }, '+911234567890').phone).toBe('+911234567890');
        expect(m.formFromRow(full, '+919999999999').phone).toBe('+91 12345 67890');

        expect(m.isDirty(form, form)).toBe(false);
        expect(m.isDirty(form, { ...form, timing: { open247: true, opensAt: null, closesAt: null } })).toBe(true);
    });

    it('the store screen uses them and refreshes the You dot after saving', () => {
        const src = shipped(page('store'));
        expect(src).toMatch(/validateStoreDetails\(/);
        expect(src).toMatch(/detailsUpdate\(/);
        expect(src).toMatch(/BUSINESS_TYPES/);
        expect(src).toMatch(/TIME_SLOTS/);
        expect(src).toMatch(/refresh\(\)/);
        expect(src).toMatch(/Discard changes\?/);
    });
});

describe('AC3: banners', () => {
    const list = [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }, { id: 'c', sort_order: 2 }];

    it('moves up and down, renumbering, and does nothing at the ends', async () => {
        const { moveBanner, orderChanges } = await import('@/lib/you/banners');
        expect(moveBanner(list, 'b', 'up').map(x => [x.id, x.sort_order])).toEqual([['b', 0], ['a', 1], ['c', 2]]);
        expect(moveBanner(list, 'b', 'down').map(x => x.id)).toEqual(['a', 'c', 'b']);
        expect(moveBanner(list, 'a', 'up')).toBe(list);
        expect(moveBanner(list, 'c', 'down')).toBe(list);
        expect(orderChanges(list, moveBanner(list, 'b', 'up'))).toEqual([{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1 }]);
    });

    it('previews in the customer menu\'s own crop', async () => {
        const { BANNER_ASPECT } = await import('@/lib/you/banners');
        expect(read('components/templates/QRMenuTemplate.tsx')).toContain(`aspectRatio: '${BANNER_ASPECT.w}/${BANNER_ASPECT.h}'`);
    });

    it('says how many are showing', async () => {
        const { bannerSummary } = await import('@/lib/you/banners');
        expect(bannerSummary([])).toBe('Add your first banner');
        expect(bannerSummary([{ is_active: false }])).toBe('None showing right now');
        expect(bannerSummary([{ is_active: true }, { is_active: false }])).toBe('1 showing on your menu');
        expect(bannerSummary([{ is_active: true }, { is_active: true }])).toBe('2 showing on your menu');
    });

    it('the banners screen reorders with it and asks before deleting', () => {
        const src = shipped(page('banners'));
        expect(src).toMatch(/moveBanner\(/);
        expect(src).toMatch(/BANNER_ASPECT/);
        expect(src).toMatch(/Delete this banner\?/);
    });
});

describe('AC4: add a store', () => {
    /**
     * The "when does a free-trial spot open" rule is gone: since 2026-09-25 an
     * account gets one trial, ever, and at most 2 stores (one-trial.test.ts).
     * The pre-screen now asks for the owner's agreement to pay instead.
     */
    it('is a limit-aware pre-screen into the existing wizard', () => {
        const src = shipped(page('add-store'));
        expect(src).toMatch(/storeCreation\(/);
        expect(src).toMatch(/STORE_LIMIT/);
        expect(src).toMatch(/\/onboarding\?intent=add-store/);
        expect(src).toMatch(/supportWhatsAppUrl\(/);
    });
});

describe('AC5: help and support', () => {
    it('pre-fills WhatsApp with the store and uses the published contacts', async () => {
        const s = await import('@/lib/you/support');
        const url = s.supportWhatsAppUrl({ name: 'Cream Story', slug: 'cream-story' });
        expect(url.startsWith(`https://wa.me/${s.SUPPORT_WHATSAPP}?text=`)).toBe(true);
        const text = decodeURIComponent(url.split('text=')[1]);
        expect(text).toContain('Cream Story');
        expect(text).toContain('cream-story');
        expect(s.supportWhatsAppUrl(null).startsWith(`https://wa.me/${s.SUPPORT_WHATSAPP}?text=`)).toBe(true);
        const publicPage = read('app/support/page.tsx');
        expect(publicPage).toContain(s.SUPPORT_WHATSAPP);
        expect(publicPage).toContain(s.SUPPORT_EMAIL);
    });

    it('shows owner questions only — nothing about ordering', async () => {
        const { ownerFaqs } = await import('@/lib/you/support');
        const { FAQ_GROUPS } = await import('@/app/support/faqData');
        const faqs = ownerFaqs(FAQ_GROUPS);
        expect(faqs.length).toBeGreaterThan(3);
        const orderIds = FAQ_GROUPS.find(g => g.id === 'orders')?.items.map(i => i.id) ?? [];
        for (const f of faqs) expect(orderIds).not.toContain(f.id);
    });

    it('is a placeholder with a clear "coming soon" for requests', () => {
        const src = shipped(page('help'));
        expect(src).toMatch(/supportWhatsAppUrl\(/);
        expect(src).toMatch(/ownerFaqs\(/);
        expect(src).toMatch(/Coming soon/);
        expect(src).toMatch(/mailto:/);
    });
});

describe('AC6: the You page', () => {
    it('routes to the six new screens', async () => {
        const { YOU_ROUTES } = await import('@/lib/ui/mobileNav');
        expect(YOU_ROUTES).toEqual({
            store: '/manage/you/store', design: '/manage/you/design', banners: '/manage/you/banners',
            plan: '/manage/you/plan', addStore: '/manage/you/add-store', help: '/manage/you/help',
        });
        const you = shipped(YOU);
        for (const key of Object.keys(YOU_ROUTES)) expect(you, key).toMatch(new RegExp(`YOU_ROUTES\\.${key}\\b`));
        for (const key of Object.keys(YOU_ROUTES)) expect(existsSync(join(SRC, `app${YOU_ROUTES[key as keyof typeof YOU_ROUTES]}/page.tsx`)), key).toBe(true);
        expect(read(YOU)).not.toMatch(/\/manage\/settings|\/manage\/banner-management|\/manage\/subscription|href="\/support"/);
    });

    it('leads with the store and its plan, and every row says something live', () => {
        const you = shipped(YOU);
        expect(you).toMatch(/planStatus\(/);
        expect(you).toMatch(/detailsNudge\(/);
        expect(you).toMatch(/bannerSummary\(/);
        expect(you).toMatch(/storeCreation\(/);
        expect(you).toMatch(/View your menu/);
    });

    it('puts sign-out last and quiet, behind a question', () => {
        const you = shipped(YOU);
        expect(you).toMatch(/Sign out of vsite\?/);
        expect(you).toMatch(/Stay signed in/);
        expect(you).not.toMatch(/tone="danger"/);
        const signOut = you.indexOf('data-you-signout');
        expect(signOut).toBeGreaterThan(-1);
        expect(signOut).toBeGreaterThan(you.lastIndexOf('YOU_ROUTES.help'));
    });
});

describe('AC7: sub-pages are full-screen on phones', () => {
    it('are recognised and still light the You tab', async () => {
        const { isYouSubPage, activeTabFor, YOU_ROUTES } = await import('@/lib/ui/mobileNav');
        for (const r of Object.values(YOU_ROUTES)) {
            expect(isYouSubPage(r), r).toBe(true);
            expect(activeTabFor(r), r).toBe('you');
        }
        expect(isYouSubPage('/manage/you')).toBe(false);
        expect(isYouSubPage('/manage/youtube')).toBe(false);
    });

    it('the shell drops the header, notices and bottom bar there — with the flag on only', () => {
        const shell = shipped(SHELL);
        expect(shell).toMatch(/MOBILE_NAV_V2 && isYouSubPage\(pathname\)/);
        expect(shell).toMatch(/!fullScreen && <MobileNav/);
    });
});

describe('AC8: the payment flow is moved, not changed', () => {
    it('lives in one hook: create-subscription → Razorpay → verify-payment → poll', () => {
        const hook = read(HOOK);
        expect(hook).toMatch(/\/api\/subscription\/create-subscription/);
        expect(hook).toMatch(/plan: 'qr_menu'/);
        expect(hook).toMatch(/checkout\.razorpay\.com/);
        expect(hook).toMatch(/\/api\/subscription\/verify-payment/);
        expect(hook).toMatch(/MAX_ATTEMPTS = 15/);
    });

    it('the old page uses it and no longer carries its own ₹299 checkout', () => {
        const sub = read(SUBSCRIPTION);
        expect(sub).toMatch(/useQrMenuCheckout\(/);
        expect(sub).not.toMatch(/plan: 'qr_menu'/);
    });

    it('the new plan screen uses it, quotes only ₹299 and the canonical roadmap line', () => {
        const plan = read(page('plan'));
        expect(plan).toMatch(/useQrMenuCheckout\(/);
        expect(plan).toMatch(/planStatus\(/);
        expect(plan).toMatch(/billing-history/);
        expect(plan).toMatch(/ORDERING_COMING_SOON_SHORT/);
        expect(plan).not.toMatch(/create-subscription|checkout\.razorpay\.com|verify-payment/);
        expect(plan).not.toMatch(/499|699|qr_order|pay_eat|QR Ordering/);
    });
});

describe('AC9: motion is subtle and optional', () => {
    it('animates briefly and stops under reduced motion', () => {
        const css = read('components/you/YouStyles.tsx');
        expect(css).toMatch(/@keyframes/);
        expect(css).toMatch(/prefers-reduced-motion: reduce/);
        const durations = [...css.matchAll(/(\d+)ms/g)].map(m => Number(m[1]));
        expect(durations.length).toBeGreaterThan(0);
        for (const d of durations) expect(d).toBeLessThanOrEqual(320);
    });
});

describe('AC10: deleting a store', () => {
    it('needs the store name typed back', async () => {
        const { canConfirmDelete } = await import('@/lib/you/storeDetails');
        expect(canConfirmDelete('cream story ', 'Cream Story')).toBe(true);
        expect(canConfirmDelete('', 'Cream Story')).toBe(false);
        expect(canConfirmDelete('Cream', 'Cream Story')).toBe(false);
    });

    it('has one implementation, used by settings and the new store screen', () => {
        expect(read('lib/store/deleteStore.ts')).toMatch(/from\('deleted_sites'\)/);
        const settings = shipped(SETTINGS);
        expect(settings).toMatch(/deleteStore\(/);
        expect(settings).not.toMatch(/from\('deleted_sites'\)/);
        const store = shipped(page('store'));
        expect(store).toMatch(/deleteStore\(/);
        expect(store).toMatch(/canConfirmDelete\(/);
    });
});

describe('AC11: flag off, nothing changes', () => {
    it('keeps today\'s pages for desktop and for the old bar', () => {
        for (const p of [SETTINGS, SUBSCRIPTION, 'app/manage/banner-management/page.tsx']) {
            expect(existsSync(join(SRC, p)), p).toBe(true);
        }
    });
});
