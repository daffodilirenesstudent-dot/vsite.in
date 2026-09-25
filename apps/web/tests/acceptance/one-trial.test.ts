import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One free trial per account — the owner's hybrid plan (2026-09-25).
 *
 * Measured on the live database before this change (32 owners, 60 stores):
 *   - 12 owners had 2+ stores; 25 extra stores were never paid for and had 18
 *     customer visitors between them — rolling free trials, not restaurants;
 *   - the rules allowed 2 stores on trial at once, and a trial that ended
 *     unpaid freed its slot, so a new store every 7 days never ran out;
 *   - a store's trial was `sites.created_at + 7 days`, and owners can UPDATE
 *     their own `sites` rows from the browser — created_at included;
 *   - the database trigger said 14 days while the app said 7.
 *
 * The rule now: at most 2 stores per account; the first gets the 7-day trial,
 * once per account for good; any later store is built free but goes live only
 * after it is paid for, and the owner agrees to that first. The trial date
 * lives on site_subscriptions, which browsers cannot write.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const MIGRATIONS = join(WEB, 'supabase', 'migrations');
const read = (p: string) => (existsSync(join(SRC, p)) ? readFileSync(join(SRC, p), 'utf8') : '');
const shipped = (p: string) => read(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const migration = (prefix: string) => {
    const file = existsSync(MIGRATIONS) ? readdirSync(MIGRATIONS).find(f => f.startsWith(prefix)) : undefined;
    return file ? readFileSync(join(MIGRATIONS, file), 'utf8') : '';
};
/** The SQL that runs — comments stripped, so prose cannot satisfy an assertion. */
const sql = (prefix: string) => migration(prefix).replace(/--[^\n]*/g, '');

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-25T06:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

// ─────────────────────────────────────────────────────────────────────────────

describe('AC1: one rule decides store creation', () => {
    it('allows 2 stores, a trial only once, and asks for consent after that', async () => {
        const { STORE_LIMIT, decideStoreCreation } = await import('@/lib/store/trialRules');
        expect(STORE_LIMIT).toBe(2);
        expect(decideStoreCreation({ storeCount: 0, trialUsed: false, paidConsent: false })).toEqual({ ok: true, trial: true });
        // The trial store was deleted: a new one is allowed, never with a trial.
        expect(decideStoreCreation({ storeCount: 0, trialUsed: true, paidConsent: false })).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED' });
        expect(decideStoreCreation({ storeCount: 1, trialUsed: true, paidConsent: false })).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED' });
        expect(decideStoreCreation({ storeCount: 1, trialUsed: true, paidConsent: true })).toEqual({ ok: true, trial: false });
        expect(decideStoreCreation({ storeCount: 2, trialUsed: true, paidConsent: true })).toMatchObject({ ok: false, code: 'PLAN_LIMIT' });
    });

    it('takes consent only from an explicit header value', async () => {
        const { PAID_STORE_CONSENT_HEADER, hasPaidConsent } = await import('@/lib/store/trialRules');
        const headers = (v: string | null) => new Headers(v === null ? {} : { [PAID_STORE_CONSENT_HEADER]: v });
        expect(hasPaidConsent(headers('yes'))).toBe(true);
        expect(hasPaidConsent(headers('true'))).toBe(false);
        expect(hasPaidConsent(headers(null))).toBe(false);
    });

    it('recognises the database refusals, and nothing else', async () => {
        const { refusalFromDbError } = await import('@/lib/store/trialRules');
        expect(refusalFromDbError({ code: 'P0001', message: 'CONSENT_REQUIRED: trial used' })).toBe('CONSENT_REQUIRED');
        expect(refusalFromDbError({ code: 'P0001', message: 'PLAN_LIMIT: 2 stores' })).toBe('PLAN_LIMIT');
        expect(refusalFromDbError({ code: '23505', message: 'duplicate key' })).toBeNull();
        expect(refusalFromDbError(new Error('network'))).toBeNull();
    });

    it('the app counts stores against the same limit', async () => {
        const { storeCreation } = await import('@/lib/store/storeLimits');
        const s = { created_at: iso(NOW), site_subscriptions: null };
        expect(storeCreation([s])).toMatchObject({ storeCount: 1, atLimit: false, canCreate: true });
        expect(storeCreation([s, s])).toMatchObject({ storeCount: 2, atLimit: true, canCreate: false });
    });
});

describe('AC2: migration 058 — expand-only, backfilled, trial decided by the database', () => {
    const m = () => sql('058_');

    it('exists and only adds', () => {
        expect(m()).not.toBe('');
        expect(m()).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
        expect(m()).not.toMatch(/ALTER\s+COLUMN/i);
        expect(m()).not.toMatch(/enforce_store_limits/i);
    });

    it('puts the trial date where browsers cannot write it, and adds the consent column', () => {
        expect(m()).toMatch(/ALTER TABLE public\.site_subscriptions\s+ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz/i);
        expect(m()).toMatch(/ALTER TABLE public\.sites\s+ADD COLUMN IF NOT EXISTS paid_store_consent_at timestamptz/i);
    });

    it('records each account\'s trial once, outliving the store, readable by no browser', () => {
        const create = m().match(/CREATE TABLE IF NOT EXISTS public\.trial_claims\s*\(([\s\S]*?)\);/i);
        expect(create, 'trial_claims table').not.toBeNull();
        expect(create![1]).toMatch(/user_id\s+text\s+PRIMARY KEY/i);
        expect(create![1]).not.toMatch(/REFERENCES/i);
        expect(m()).toMatch(/ALTER TABLE public\.trial_claims ENABLE ROW LEVEL SECURITY/i);
        expect(m()).toMatch(/REVOKE ALL ON (TABLE )?public\.trial_claims FROM PUBLIC, anon, authenticated/i);
        expect(m()).not.toMatch(/CREATE POLICY[^;]*trial_claims/i);
    });

    it('backfills so every existing store keeps the trial state it has today', () => {
        expect(m()).toMatch(/INSERT INTO public\.site_subscriptions[\s\S]*?WHERE NOT EXISTS/i);
        expect(m()).toMatch(/trial_ends_at\s*=\s*s\.created_at \+ interval '7 days'/i);
        expect(m()).toMatch(/INSERT INTO public\.trial_claims[\s\S]*?DISTINCT ON \(s\.user_id\)/i);
    });

    it('opens every new store\'s subscription with its trial decided, once per account', () => {
        expect(m()).toMatch(/AFTER INSERT ON public\.sites/i);
        expect(m()).toMatch(/INSERT INTO public\.trial_claims[^;]*ON CONFLICT \(user_id\) DO NOTHING/i);
        expect(m()).toMatch(/v_trial\s*:=\s*FOUND/i);
        expect(m()).toMatch(/CASE WHEN v_trial THEN now\(\) \+ interval '7 days' END/i);
        expect(m()).toMatch(/SECURITY DEFINER/i);
        expect(m()).toMatch(/REVOKE ALL ON FUNCTION public\.open_store_subscription\(\) FROM PUBLIC, anon, authenticated/i);
    });

    it('uses the same trial length as the app', async () => {
        const { TRIAL_DURATION_MS } = await import('@/lib/platform/productFlags');
        const found = Array.from((sql('058_') + sql('059_')).matchAll(/interval '(\d+) days'/gi), x => Number(x[1]));
        expect(found.length).toBeGreaterThan(0);
        for (const days of found) expect(days).toBe(TRIAL_DURATION_MS / DAY);
    });
});

describe('AC3: migration 059 — the database enforces 2 stores and the consent', () => {
    const m = () => sql('059_');

    it('replaces the old 5-store / 2-trial rule', () => {
        expect(m()).toMatch(/CREATE OR REPLACE FUNCTION public\.enforce_store_limits\(\)/i);
        expect(m()).toMatch(/IF v_total >= 2 THEN\s+RAISE EXCEPTION 'PLAN_LIMIT:/i);
        expect(m()).not.toMatch(/TRIAL_LIMIT/);
    });

    it('requires consent once the account\'s trial is used', () => {
        expect(m()).toMatch(/FROM public\.trial_claims WHERE user_id = NEW\.user_id/i);
        expect(m()).toMatch(/NEW\.paid_store_consent_at IS NULL[\s\S]*?RAISE EXCEPTION 'CONSENT_REQUIRED:/i);
    });

    it('serialises store creation per account, so two taps cannot both pass', () => {
        expect(m()).toMatch(/pg_advisory_xact_lock\(hashtext\('store_limits:' \|\| NEW\.user_id\)\)/i);
        expect(m()).toMatch(/SECURITY DEFINER/i);
        expect(m()).toMatch(/SET search_path = public, pg_temp/i);
    });
});

describe('AC4: every trial gate reads trial_ends_at', () => {
    const GATES = [
        'app/shop/[slug]/page.tsx', 'app/api/sites/toggle-live/route.ts', 'components/PlanContext.tsx',
        'lib/you/planStatus.ts', 'lib/menu/aiPageLimits.ts', 'lib/menu/aiPageLedger.ts',
        'lib/platform/storeEligibility.ts', 'lib/store/storeLimits.ts',
    ];

    it.each(GATES)('%s never derives a trial from created_at', (p) => {
        const src = shipped(p);
        expect(src, p).not.toBe('');
        // created_at / createdAt / siteCreatedMs … + TRIAL_DURATION_MS, any case
        expect(src).not.toMatch(/created_?at[^;\n]*\+\s*TRIAL_DURATION_MS/i);
        expect(src).not.toMatch(/created\w*\s*\+\s*TRIAL_DURATION_MS/i);
    });

    it('the public menu, the go-live toggle, the store list and the AI allowance read the trial date', () => {
        for (const p of ['app/shop/[slug]/page.tsx', 'app/api/sites/toggle-live/route.ts', 'components/SiteContext.tsx', 'components/PlanContext.tsx', 'lib/menu/aiPageLedger.ts']) {
            expect(shipped(p), p).toMatch(/trial_ends_at/);
        }
    });

    it('plan status: a store with no trial is "not live yet" and can be paid for', async () => {
        const { planStatus } = await import('@/lib/you/planStatus');
        const { PLAN_PRICES_INR } = await import('@/lib/platform/productFlags');
        const noTrial = planStatus({ created_at: iso(NOW - DAY), site_subscriptions: { store_expires_at: null, trial_ends_at: null } }, NOW);
        expect(noTrial).toMatchObject({ state: 'unpaid', canPay: true, cta: `Pay ₹${PLAN_PRICES_INR.qr_menu} to go live` });
        const trial = planStatus({ created_at: iso(NOW - 2 * DAY), site_subscriptions: { store_expires_at: null, trial_ends_at: iso(NOW + 5 * DAY) } }, NOW);
        expect(trial).toMatchObject({ state: 'trial', daysLeft: 5, canPay: false });
        // A created_at rewritten from the browser no longer buys anything.
        const forged = planStatus({ created_at: iso(NOW + 365 * DAY), site_subscriptions: { store_expires_at: null, trial_ends_at: iso(NOW - DAY) } }, NOW);
        expect(forged.state).toBe('trialEnded');
    });

    it('AI uploads: the trial allowance follows the trial date', async () => {
        const { resolveBulkAllowance } = await import('@/lib/menu/aiPageLimits');
        expect(resolveBulkAllowance({ trialEndsAt: iso(NOW + DAY), storeExpiresAt: null, now: NOW }).state).toBe('trial');
        expect(resolveBulkAllowance({ trialEndsAt: null, storeExpiresAt: null, now: NOW }).state).toBe('expired');
    });
});

describe('AC5: the server asks before it spends or creates', () => {
    it('eligibility uses the one rule and the trial record', () => {
        const e = shipped('lib/platform/storeEligibility.ts');
        expect(e).toMatch(/decideStoreCreation\(/);
        expect(e).toMatch(/from\('trial_claims'\)/);
    });

    it('extract and launch pass the owner\'s consent into the check', () => {
        for (const p of ['app/api/onboarding/extract/route.ts', 'app/api/onboarding/complete/route.ts']) {
            expect(shipped(p), p).toMatch(/checkStoreEligibility\(userId, \{ paidConsent: hasPaidConsent\(/);
        }
    });

    it('launch records the consent, turns a database refusal into a clear 403, and says whether the store is live', () => {
        const c = shipped('app/api/onboarding/complete/route.ts');
        expect(c).toMatch(/paid_store_consent_at/);
        expect(c).toMatch(/refusalFromDbError\(/);
        expect(c).toMatch(/\blive\b/);
    });

    it('an eligibility route tells the app where the account stands', () => {
        const r = shipped('app/api/onboarding/eligibility/route.ts');
        expect(r).toMatch(/export async function GET/);
        expect(r).toMatch(/verifyFirebaseToken/);
        expect(r).toMatch(/readStoreEligibility\(/);
    });
});

describe('AC6: the consent screen', () => {
    it('names the phone number, the trial store and the price, and cannot continue until the owner agrees', async () => {
        const { createElement } = await import('react');
        const { renderToStaticMarkup } = await import('react-dom/server');
        const { default: PaidStoreConsent } = await import('@/components/store/PaidStoreConsent');
        const html = renderToStaticMarkup(createElement(PaidStoreConsent, {
            phone: '+911234567890', trialStoreName: 'Cream Story', onContinue: () => {}, onCancel: () => {},
        }));
        expect(html).toContain('+91 12345 67890');
        expect(html).toContain('Cream Story');
        expect(html).toMatch(/free trial/i);
        expect(html).toContain('₹299');
        expect(html).toMatch(/type="checkbox"/);
        expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
        const continueButton = html.match(/<button[^>]*data-consent-continue[^>]*>/)?.[0] ?? '';
        expect(continueButton, 'continue button').toMatch(/disabled=""/);
    });
});

describe('AC7: the screen comes before a no-trial store is built', () => {
    it('onboarding asks the server, shows the consent screen, and sends the consent', () => {
        const o = shipped('app/onboarding/page.tsx');
        expect(o).toMatch(/\/api\/onboarding\/eligibility/);
        expect(o).toMatch(/<PaidStoreConsent\b/);
        expect(o).toMatch(/PAID_STORE_CONSENT_HEADER/);
        expect(o).toMatch(/CONSENT_REQUIRED/);
    });

    it('the launch screen never calls a no-trial store live', () => {
        expect(shipped('app/onboarding/components/LaunchLoadingScreen.tsx')).toMatch(/paidRequired/);
        expect(shipped('app/onboarding/components/LaunchLoadingScreen.tsx')).toMatch(/to go live/);
        expect(shipped('app/onboarding/page.tsx')).toMatch(/paidRequired=\{/);
    });

    it('the You tab sends a second store through the same screen; the header counts the same limit', () => {
        const a = shipped('app/manage/you/add-store/page.tsx');
        expect(a).toMatch(/<PaidStoreConsent\b/);
        expect(a).toMatch(/\/api\/onboarding\/eligibility/);
        expect(a).toMatch(/consent=paid/);
        expect(shipped('components/DashboardHeader.tsx')).toMatch(/storeCreation\(/);
    });
});

describe('AC8: a store that never had a trial is never told its trial ended', () => {
    it('the plan context knows whether the store had a trial', () => {
        expect(shipped('components/PlanContext.tsx')).toMatch(/hasTrial/);
    });

    it.each([
        'components/manage/TrialBanner.tsx', 'components/SubscriptionNotifications.tsx',
        'app/manage/dashboard/page.tsx', 'app/manage/subscription/page.tsx',
    ])('%s says "not live yet" to such a store', (p) => {
        const src = shipped(p);
        expect(src).toMatch(/hasTrial/);
        expect(src).toMatch(/not live yet/i);
    });
});
