import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Store Details — what we ask an owner for, and what we stopped asking.
 *
 * ─── REMOVED ─────────────────────────────────────────────────────────────────
 * The tab used to open with two fields that ask the owner to do marketing: a
 * logo to upload and a blurb to write. Most owners have neither. 052 already
 * conceded the point in a schema comment — "most stores have no logo, and the
 * header must read as finished without one" — and then shipped a toggle for
 * hiding the logo anyway. A field empty on most rows is not a field; it is an
 * obstacle on the first screen after signup. All three go: the upload, the
 * description, and the show_logo toggle that existed to hide the first.
 *
 * ─── REPLACED ────────────────────────────────────────────────────────────────
 * sites.description was the meta description and OG blurb for every public
 * menu. Deleting it without a replacement would flatten every /shop/[slug] in
 * the product to one generic sentence, so the page now derives that sentence
 * from type + location. Derived beats owner-written: never empty, never stale.
 * This is the test that stops the removal from quietly costing the SEO.
 *
 * ─── ADDED ───────────────────────────────────────────────────────────────────
 * Business type, location and PIN — answerable in a tap or a few digits, true
 * of every store, and useful to both the meta description and (later) local
 * search. Timing becomes a picker: the free-text box produced "9-11", "morning
 * to night" and blank, none of which a customer can read off a menu header.
 *
 * ─── THE MIGRATION RULE ──────────────────────────────────────────────────────
 * No code may still SELECT a dropped column. Supabase does not fail a select
 * on an unknown column loudly — it 400s the whole query — so one stale name in
 * a select list takes out the entire settings screen, not just the field.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const MIGRATIONS = join(WEB, 'supabase', 'migrations');

const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const shipped = (p: string) =>
    read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const SETTINGS = 'app/manage/settings/page.tsx';
const APPEARANCE = 'app/manage/settings/_components/AppearancePanel.tsx';
const GUIDE = 'components/StoreSetupGuide.tsx';
const SHOP_PAGE = 'app/shop/[slug]/page.tsx';
const SHOP_CLIENT = 'app/shop/[slug]/ShopPageClient.tsx';
const TIMING = 'lib/store/storeTiming.ts';
const TYPES = 'lib/store/businessTypes.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The migration
// ─────────────────────────────────────────────────────────────────────────────

describe('migration 054', () => {
    const sql = () => {
        const file = readdirSync(MIGRATIONS).find(f => f.startsWith('054_'));
        expect(file, 'no 054_ migration found').toBeTruthy();
        return readFileSync(join(MIGRATIONS, file!), 'utf8');
    };

    it('drops all three columns from sites', () => {
        const s = sql();
        expect(s).toMatch(/DROP COLUMN IF EXISTS image_url/);
        expect(s).toMatch(/DROP COLUMN IF EXISTS description/);
        expect(s).toMatch(/DROP COLUMN IF EXISTS show_logo/);
    });

    it('replaces delete_site before dropping what it reads', () => {
        // delete_site() copies the site row into deleted_sites. Drop first and
        // the next store deletion raises instead of archiving — a data-loss
        // bug that only surfaces when someone deletes a store.
        const s = sql();
        const fn = s.indexOf('CREATE OR REPLACE FUNCTION public.delete_site');
        const drop = s.indexOf('DROP COLUMN IF EXISTS image_url');
        expect(fn, 'delete_site is not rewritten').toBeGreaterThan(-1);
        expect(fn).toBeLessThan(drop);
    });

    it('keeps delete_site locked down', () => {
        // SECURITY DEFINER on a function any authenticated user can call. The
        // ownership check and the frozen search_path are what make that safe.
        const s = sql();
        expect(s).toMatch(/SET search_path = public, pg_temp/);
        expect(s).toMatch(/FORBIDDEN/);
        expect(s).toMatch(/REVOKE ALL ON FUNCTION public\.delete_site\(uuid\) FROM PUBLIC, anon/);
    });

    it('rejects a PIN that no Indian address can have', () => {
        // Leading zero excluded on purpose: '000000' is how a required numeric
        // field gets filled in to make it go away.
        expect(sql()).toMatch(/\^\[1-9\]\[0-9\]\{5\}\$/);
    });

    it('clears offending legacy PINs before adding the constraint', () => {
        // ADD CONSTRAINT validates existing rows. One junk PIN written before
        // the field was asked for would abort the whole migration.
        const s = sql();
        const cleanup = s.indexOf('SET pincode = NULL');
        const add = s.indexOf('ADD CONSTRAINT sites_pincode_format');
        expect(cleanup).toBeGreaterThan(-1);
        expect(cleanup).toBeLessThan(add);
    });

    it('adds business_type as a new column', () => {
        expect(sql()).toMatch(/ADD COLUMN IF NOT EXISTS business_type TEXT/);
    });

    it('constrains business_type to the five ids the chips offer', () => {
        // A value the UI cannot render must not be storable, or the chip row
        // silently shows nothing selected for a store that did choose.
        expect(sql()).toMatch(/sites_business_type_valid/);
    });

    it('never repurposes sites.type', () => {
        // sites.type is 'Shop' | 'Menu' on every live row — the product-kind
        // discriminator PosterGenerator prints onto the QR poster and that
        // ShopCard and SiteInfo branch on. Writing 'cafe' into it would
        // mislabel standees already sitting on tables. This assertion exists
        // because the first draft of this migration did exactly that.
        const s = sql();
        expect(s).not.toMatch(/^\s*(ALTER|UPDATE)[^\n]*\btype\b\s*=/m);
        expect(s).not.toMatch(/DROP COLUMN IF EXISTS type\b/);
    });

    it('archives business_type on delete like every other field', () => {
        const s = sql();
        const fn = s.slice(s.indexOf('CREATE OR REPLACE FUNCTION'), s.indexOf('$$;'));
        expect(fn.match(/business_type/g) ?? []).toHaveLength(2); // insert + select
    });

    it('runs as one transaction', () => {
        const s = sql();
        expect(s).toMatch(/^BEGIN;/m);
        expect(s).toMatch(/^COMMIT;/m);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. No dropped column is still read
// ─────────────────────────────────────────────────────────────────────────────

describe('the dropped columns', () => {
    /**
     * Every `from('sites').select(...)` in the tree, not a hand-listed few.
     *
     * The first version of this test named five files it expected to be
     * affected. Two others — SiteContext and NotificationContext — also read
     * sites.image_url, were missed, and shipped. The result was not a missing
     * field: PostgREST rejects the WHOLE query with 42703, SiteContext
     * destructures only `data`, so every owner's site list came back empty and
     * the gate marched them into "create your first store" on repeat.
     *
     * A list of files is not coverage. Enumerate the call sites instead.
     */
    const SRC_FILES = (function walk(dir: string): string[] {
        return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) return walk(full);
            return /\.tsx?$/.test(entry.name) ? [full] : [];
        });
    })(SRC);

    /** Select lists belonging to a `from('sites')` chain. */
    function siteSelects(source: string): string[] {
        const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        const re = /\.from\(\s*['"`]sites['"`]\s*\)[\s\S]{0,400}?\.select\(\s*['"`]([^'"`]*)['"`]/g;
        return Array.from(clean.matchAll(re), m => m[1]);
    }

    it('are selected from sites nowhere in the tree', () => {
        const offenders: string[] = [];
        for (const file of SRC_FILES) {
            for (const list of siteSelects(readFileSync(file, 'utf8'))) {
                for (const col of ['image_url', 'description', 'show_logo']) {
                    if (new RegExp(`\\b${col}\\b`).test(list)) {
                        offenders.push(`${file.slice(SRC.length + 1)} → ${col}`);
                    }
                }
            }
        }
        expect(offenders, 'a dropped column is still selected from sites').toEqual([]);
    });

    it('are not read off a site object anywhere', () => {
        // The select is only half of it. NotificationContext also BRANCHED on
        // site.description and site.image_url to decide whether settings were
        // complete — so even with the query fixed, every owner would have been
        // flagged incomplete forever.
        const offenders: string[] = [];
        for (const file of SRC_FILES) {
            const clean = readFileSync(file, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
            for (const m of clean.matchAll(/\bsite\.(image_url|description|show_logo)\b/g)) {
                offenders.push(`${file.slice(SRC.length + 1)} → site.${m[1]}`);
            }
        }
        expect(offenders, 'a dropped column is still read off a site row').toEqual([]);
    });

    it('leaves no logo upload on the settings tab', () => {
        const src = shipped(SETTINGS);
        expect(src).not.toMatch(/logoInputRef|handleLogoChange|uploadingLogo/);
    });

    it('leaves no description field on the settings tab', () => {
        expect(shipped(SETTINGS)).not.toMatch(/<textarea/);
    });

    it('leaves no show-logo toggle on the appearance tab', () => {
        const src = shipped(APPEARANCE);
        expect(src).not.toMatch(/show_logo/);
        expect(src).not.toMatch(/hasLogo/);
    });

    it('drops the upload-your-logo step from the setup guide', () => {
        // A checklist step pointing at a field that no longer exists is a
        // permanently-incomplete guide.
        const src = shipped(GUIDE);
        expect(src).not.toMatch(/Upload your logo/);
        expect(src).not.toMatch(/hasLogo/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The public menu keeps a real description
// ─────────────────────────────────────────────────────────────────────────────

describe('the public menu meta description', () => {
    it('is built from the store type and place', () => {
        const src = shipped(SHOP_PAGE);
        expect(src).toMatch(/buildMenuDescription/);
    });

    it('reads as a sentence for a store that filled both in', async () => {
        const { buildMenuDescription } = await import('@/lib/store/businessTypes');
        const out = buildMenuDescription({ name: 'Cream Story', type: 'cafe', location: 'Madurai' });
        expect(out).toContain('Cream Story');
        expect(out).toContain('Café');
        expect(out).toContain('Madurai');
    });

    it('still reads as a sentence for a store that filled in neither', async () => {
        // Most existing rows. A template with a hole in it is worse than the
        // generic line it replaced.
        const { buildMenuDescription } = await import('@/lib/store/businessTypes');
        const out = buildMenuDescription({ name: 'Cream Story', type: null, location: null });
        expect(out).toContain('Cream Story');
        expect(out).not.toMatch(/undefined|null|\s—\s*\./);
    });

    it('stays inside the length Google will render', async () => {
        const { buildMenuDescription } = await import('@/lib/store/businessTypes');
        const out = buildMenuDescription({
            name: 'Sri Balaji Bhavan Family Restaurant and Catering Services',
            type: 'restaurant',
            location: 'Tiruchirappalli',
        });
        expect(out.length).toBeLessThanOrEqual(160);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Business type
// ─────────────────────────────────────────────────────────────────────────────

describe('business types', () => {
    it('offers exactly five, chosen for this market', async () => {
        // Five fits one tap-row on a phone without a dropdown. The list is
        // Tamil Nadu-weighted on purpose: a mess/tiffin centre is not a
        // restaurant, and calling it one is how the field gets left blank.
        const { BUSINESS_TYPES } = await import('@/lib/store/businessTypes');
        expect(BUSINESS_TYPES.map(t => t.id)).toEqual([
            'restaurant', 'cafe', 'takeaway', 'mess', 'tea_shop',
        ]);
    });

    it('labels every one in English only', async () => {
        // The dashboard is the owner's own admin and stays English. CLAUDE.md's
        // "Tamil + English where user-facing" means the CUSTOMER-facing menu,
        // where diners read it — not this screen. Dual-labelling the chips made
        // them long and cluttered for no reader.
        const { BUSINESS_TYPES } = await import('@/lib/store/businessTypes');
        for (const t of BUSINESS_TYPES) {
            expect(t.label.length, `${t.id} has no label`).toBeGreaterThan(0);
            expect(t.label, `${t.id} carries Tamil in the dashboard`).not.toMatch(/[஀-௿]/);
        }
    });

    it('keeps Tamil out of the Store Details tab entirely', () => {
        expect(shipped(SETTINGS), 'Tamil script in the dashboard').not.toMatch(/[஀-௿]/);
    });

    it('accepts only ids it offers', async () => {
        const { isBusinessType } = await import('@/lib/store/businessTypes');
        expect(isBusinessType('cafe')).toBe(true);
        expect(isBusinessType('bakery')).toBe(false);
        expect(isBusinessType(null)).toBe(false);
    });

    it('is rendered as tappable choices, not a text box', () => {
        expect(shipped(SETTINGS)).toMatch(/BUSINESS_TYPES/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PIN validation
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidPincode', () => {
    it('accepts a real PIN', async () => {
        const { isValidPincode } = await import('@/lib/store/businessTypes');
        expect(isValidPincode('625001')).toBe(true); // Madurai
        expect(isValidPincode('600001')).toBe(true); // Chennai
    });

    it('rejects the shapes a hurried owner types', async () => {
        const { isValidPincode } = await import('@/lib/store/businessTypes');
        expect(isValidPincode('62500')).toBe(false);   // five digits
        expect(isValidPincode('6250011')).toBe(false); // seven
        expect(isValidPincode('000000')).toBe(false);  // leading zero
        expect(isValidPincode('62 5001')).toBe(false); // space
        expect(isValidPincode('abcdef')).toBe(false);
    });

    it('treats blank as not-yet-answered rather than wrong', async () => {
        // The field is optional. Painting an empty box red on arrival is how
        // a settings screen reads as broken.
        const { isValidPincode } = await import('@/lib/store/businessTypes');
        expect(isValidPincode('')).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Opening hours
// ─────────────────────────────────────────────────────────────────────────────

describe('store timing', () => {
    it('offers half-hourly slots across a full day', async () => {
        const { TIME_SLOTS } = await import('@/lib/store/storeTiming');
        expect(TIME_SLOTS).toContain('6:00 AM');
        expect(TIME_SLOTS).toContain('11:30 PM');
        expect(TIME_SLOTS.length).toBe(48);
    });

    it('formats a normal day as one readable string', async () => {
        const { formatTiming } = await import('@/lib/store/storeTiming');
        expect(formatTiming({ open247: false, opensAt: '9:00 AM', closesAt: '11:00 PM' }))
            .toBe('9:00 AM - 11:00 PM');
    });

    it('formats round-the-clock without a meaningless range', async () => {
        const { formatTiming } = await import('@/lib/store/storeTiming');
        expect(formatTiming({ open247: true, opensAt: '9:00 AM', closesAt: '11:00 PM' }))
            .toBe('Open 24 hours');
    });

    it('reads back what it wrote', async () => {
        // Every existing row holds free text written by the old box. Parsing
        // has to round-trip our own format and fail softly on everything else,
        // or opening the tab silently rewrites an owner's hours.
        const { formatTiming, parseTiming } = await import('@/lib/store/storeTiming');
        const value = { open247: false, opensAt: '7:30 AM', closesAt: '10:00 PM' };
        expect(parseTiming(formatTiming(value))).toEqual(value);
        expect(parseTiming('Open 24 hours').open247).toBe(true);
    });

    it('does not pretend to understand the old free text', async () => {
        const { parseTiming } = await import('@/lib/store/storeTiming');
        const parsed = parseTiming('morning to night');
        expect(parsed.opensAt).toBeNull();
        expect(parsed.closesAt).toBeNull();
        expect(parsed.open247).toBe(false);
    });

    it('is rendered as a picker, not a text box', () => {
        expect(shipped(SETTINGS)).toMatch(/TIME_SLOTS/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. The mobile number
// ─────────────────────────────────────────────────────────────────────────────

describe('the mobile number field', () => {
    it('is seeded from the number the owner signed in with', () => {
        // They verified it minutes ago via OTP. Asking again is asking a
        // question we already know the answer to.
        expect(shipped(SETTINGS)).toMatch(/user\?\.phoneNumber/);
    });

    it('stays editable', () => {
        // A shop's published number is often the counter landline, not the
        // owner's personal phone. Seeding is a convenience, not a lock.
        const src = shipped(SETTINGS);
        const field = src.slice(src.indexOf('phoneNumber'), src.indexOf('phoneNumber') + 2000);
        expect(field).not.toMatch(/readOnly/);
    });
});
