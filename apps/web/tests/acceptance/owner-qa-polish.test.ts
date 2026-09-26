import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QA 2026-09-26 — the tablet findings and the copy / accessibility pass.
 *
 * Mostly source-level assertions, in this repo's usual style: each names the
 * exact defect it guards so a regression reads as the bug it reintroduces.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const raw = (p: string) => (existsSync(join(SRC, p)) ? readFileSync(join(SRC, p), 'utf8') : '');
const shipped = (p: string) => raw(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

const INVENTORY = 'app/manage/product-inventory/page.tsx';
const BANNERS = 'app/manage/banner-management/page.tsx';
const SIDEBAR = 'components/Sidebar.tsx';
const BULK = 'components/manage/BulkImportModal.tsx';

afterEach(() => { vi.useRealTimers(); });

// ─────────────────────────────────────────────────────────────────────────────
// Tablet (768–1023 px)
// ─────────────────────────────────────────────────────────────────────────────

describe('tablet: the banner list fits the room it has', () => {
    it('chooses table or cards by the content width, not the window width', () => {
        // md: flipped to the 700px table at 768px, with the sidebar already
        // taking its share — headers collided and VISIBLE was cut off.
        const page = shipped(BANNERS);
        expect(page).toMatch(/className="cq"/);
        expect(page).toMatch(/cq-wide/);
        expect(page).toMatch(/cq-narrow/);
        expect(page).not.toMatch(/hidden md:block overflow-x-auto/);
    });
});

describe('tablet: banners reorder without dragging', () => {
    it('moves an item up and down', async () => {
        const { moveItem } = await import('@/lib/ui/reorder');
        expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
        expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    });

    it('ignores a move past either end', async () => {
        const { moveItem } = await import('@/lib/ui/reorder');
        const list = ['a', 'b'];
        expect(moveItem(list, 0, -1)).toBe(list);
        expect(moveItem(list, 1, 2)).toBe(list);
    });

    it('every banner has labelled move-up / move-down buttons, in cards and table', () => {
        const page = shipped(BANNERS);
        const uses = page.match(/<MoveButtons name=\{banner\.name\}/g) ?? [];
        expect(uses.length).toBe(2);
        const buttons = page.slice(page.indexOf('function MoveButtons'), page.indexOf('export default function'));
        expect(buttons).toMatch(/aria-label=\{`Move \$\{name\} \$\{dir\}`\}/);
        expect(buttons).toMatch(/btn\('up'\)[\s\S]*btn\('down'\)/);
    });
});

describe('tablet: the plan is reachable from the icon sidebar', () => {
    it('the icon column links to Manage plan', () => {
        const side = shipped(SIDEBAR);
        const column = side.slice(side.indexOf('const IconColumn'), side.indexOf('return (\n        <>'));
        expect(column).toMatch(/href="\/manage\/subscription"/);
        expect(column).toMatch(/aria-label="Manage plan"/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard and screen readers
// ─────────────────────────────────────────────────────────────────────────────

describe('Escape closes what it should', () => {
    it('the notifications panel', () => {
        const bell = shipped('components/NotificationBell.tsx');
        expect(bell).toMatch(/'Escape'/);
    });

    it('the bulk upload modal, unless it is mid-upload', () => {
        const bulk = shipped(BULK);
        expect(bulk).toMatch(/e\.key === 'Escape' && canClose/);
    });

    it.each([INVENTORY, BANNERS])('the %s drawer', (page) => {
        expect(shipped(page)).toMatch(/'Escape'/);
    });
});

describe('screen readers hear names, not icon ligatures', () => {
    it.each([INVENTORY, BANNERS])('%s drawer is announced as a dialog', (page) => {
        const src = shipped(page);
        expect(src).toMatch(/role="dialog"\s+aria-modal="true"\s+aria-labelledby=/);
    });

    it('the inventory size/topping/combo delete buttons say what they delete', () => {
        const src = shipped(INVENTORY);
        const btn = src.slice(src.indexOf('function DeleteBtn'), src.indexOf('function SectionRows'));
        expect(btn).toMatch(/aria-label=\{label\}/);
        expect(btn).toMatch(/aria-hidden/);
        expect(src).not.toMatch(/<DeleteBtn(?![^>]*label=)[^>]*\/>/);
    });

    it('banner delete buttons name the banner', () => {
        const hits = shipped(BANNERS).match(/aria-label=\{`Delete \$\{banner\.name\}`\}/g) ?? [];
        expect(hits.length).toBe(2); // cards + table
    });

    it('collapsed-sidebar links are named and their icons hidden', () => {
        const side = shipped(SIDEBAR);
        const column = side.slice(side.indexOf('const IconColumn'), side.indexOf('return (\n        <>'));
        expect(column).toMatch(/aria-label=\{item\.name\}/);
        expect(column).toMatch(/aria-hidden/);
    });

    it('bulk "Choose Files" is a real button a keyboard can reach', () => {
        const bulk = shipped(BULK);
        expect(bulk).toMatch(/<button[^>]*onClick=\{[^}]*fileInputRef\.current\?\.click\(\)[^}]*\}[^>]*>\s*Choose Files/);
        expect(bulk).not.toMatch(/<label[^>]*>\s*Choose Files/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────────────────────

describe('browser tab titles', () => {
    it('the dashboard layout does not repeat the brand the root template adds', () => {
        expect(shipped('app/manage/layout.tsx')).not.toMatch(/\| Vsite/);
    });

    it.each([
        ['app/manage/product-inventory/layout.tsx', 'Products'],
        ['app/manage/banner-management/layout.tsx', 'Banners'],
        ['app/manage/settings/layout.tsx', 'Store settings'],
        ['app/manage/subscription/layout.tsx', 'Plan & billing'],
        ['app/manage/qr/layout.tsx', 'QR codes'],
    ])('%s is titled "%s"', (layout, title) => {
        expect(shipped(layout)).toMatch(new RegExp(`title:\\s*'${title}'`));
    });
});

describe('the header says who is signed in', () => {
    it('never shows the placeholder "User" or "Product Management"', () => {
        const header = shipped('components/DashboardHeader.tsx');
        expect(header).not.toMatch(/Product Management/);
        expect(header).not.toMatch(/\|\|\s*'User'/);
    });

    it('falls back to "Owner" and shows the store beneath', async () => {
        const { headerIdentity } = await import('@/lib/ui/headerIdentity');
        expect(headerIdentity({ fullName: '', storeName: 'Chai Point' })).toEqual({ name: 'Owner', subtitle: 'Chai Point' });
        expect(headerIdentity({ fullName: ' Priya ', storeName: 'Chai Point' })).toEqual({ name: 'Priya', subtitle: 'Chai Point' });
        expect(headerIdentity({ fullName: null, storeName: null })).toEqual({ name: 'Owner', subtitle: 'Store owner' });
    });
});

describe('the subscription page tells one story', () => {
    const sub = () => shipped('app/manage/subscription/page.tsx');

    it('does not offer an early renewal it cannot take', () => {
        // Payment only reopens after the plan lapses; "Renew to extend" sat
        // above "Renew from here once it ends".
        expect(sub()).not.toMatch(/Renew to extend/);
    });

    it('does not tell an active store to activate the plan', () => {
        const s = sub();
        const empty = s.slice(s.indexOf("invoicesState === 'ready' && invoices.length === 0"));
        expect(empty.slice(0, 600)).toMatch(/isQrMenuActive\s*\?/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// What the owner and the diner see
// ─────────────────────────────────────────────────────────────────────────────

describe('menu-design previews show real prices, never a bare ₹', () => {
    it('the swatch prints ₹ only beside a price', () => {
        const swatch = shipped('components/menu/ThemeSwatch.tsx');
        expect(swatch).not.toMatch(/>\s*₹\s*</);
        expect(swatch).toMatch(/dishPrices/);
    });

    it.each([
        'app/manage/settings/page.tsx',
        'app/manage/you/design/page.tsx',
        'app/onboarding/components/SummaryPhase.tsx',
    ])('%s passes the prices along', (caller) => {
        expect(shipped(caller)).toMatch(/dishPrices/);
    });
});

describe('the customer menu shows the saved hours and location', () => {
    it('the menu template renders them', () => {
        const t = shipped('components/templates/QRMenuTemplate.tsx');
        expect(t).toMatch(/shopTimings/);
        expect(t).toMatch(/shopLocation/);
    });

    it('the shop passes them in', () => {
        const c = shipped('app/shop/[slug]/ShopPageClient.tsx');
        expect(c).toMatch(/shopTimings=\{/);
        expect(c).toMatch(/shopLocation=\{/);
    });
});

describe('touch targets a finger can hit', () => {
    it('drawer category chips are 44px tall', () => {
        const src = shipped(INVENTORY);
        const section = src.slice(src.indexOf('const categorySection'), src.indexOf('const descriptionSection'));
        const chips = section.slice(section.indexOf('categories.map(cat =>'));
        expect(chips.slice(0, 900)).toMatch(/minHeight:\s*44/);
    });

    it('brand colour swatches are 44px', () => {
        const picker = shipped('components/menu/MenuDesignPicker.tsx');
        expect(picker).toMatch(/width:\s*44,\s*\n\s*height:\s*44/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Photo suggestions
// ─────────────────────────────────────────────────────────────────────────────

describe('a cleared name clears its suggested photo', () => {
    it('emptying the name after a match drops the match', async () => {
        vi.useFakeTimers();
        const { createPhotoSuggester, SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_SEARCH_MS } = await import('@/lib/menu/photoSuggest');
        const states: Array<{ status: string }> = [];
        const lookups: string[] = [];
        const s = createPhotoSuggester(
            { lookup: async (q) => { lookups.push(q); return 'https://lib/tea.jpg'; }, preload: async () => {}, now: () => Date.now() },
            st => states.push(st),
        );
        s.request('Masala Tea');
        await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS + SUGGEST_MIN_SEARCH_MS);
        expect(states[states.length - 1].status).toBe('found');

        s.request('');
        expect(states[states.length - 1].status).toBe('none');
        expect(s.lastQuery()).toBeNull();

        // Typing the same name again finds it again.
        s.request('Masala Tea');
        await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS + SUGGEST_MIN_SEARCH_MS);
        expect(lookups).toEqual(['masala tea', 'masala tea']);
    });

    it('a short name with nothing suggested stays quiet', async () => {
        const { createPhotoSuggester } = await import('@/lib/menu/photoSuggest');
        const states: unknown[] = [];
        const s = createPhotoSuggester({ lookup: async () => null, preload: async () => {}, now: () => 0 }, st => states.push(st));
        s.request('Ch');
        expect(states).toEqual([]);
    });
});

describe('a combo, or a bare "veg", is not the photo of one dish', () => {
    let img: (q: string) => string | null;
    beforeAll(async () => {
        const { buildImageIndex, matchImage } = await import('@/lib/menu/conceptMatcher');
        const lib = JSON.parse(readFileSync(join(WEB, 'tests', 'fixtures', 'defaultImageLibraryDiet.json'), 'utf8'));
        const index = buildImageIndex(lib);
        img = (q) => { const r = matchImage(q, index); return r.decision === 'abstain' ? null : r.image; };
    });

    // Observed 2026-09-26: "Veg Combo" was given veg-kolhapuri, a curry.
    it.each(['Veg Combo', 'Paneer Combo', 'Chicken Combo', 'Veg', 'Veg Special', 'Veg Plate'])('“%s” gets no library photo', (q) => {
        expect(img(q)).toBeNull();
    });

    it.each([['Biryani Combo', 'biriyani'], ['Burger Combo', 'burger']])('“%s” built around one dish still gets it', (q, want) => {
        expect(img(q)).toBe(want);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSP
// ─────────────────────────────────────────────────────────────────────────────

describe('CSP lets Firebase load its Google API loader', () => {
    it('script-src allows https://apis.google.com', () => {
        const config = readFileSync(join(WEB, 'next.config.mjs'), 'utf8');
        const scriptSrc = config.match(/"script-src[^"]*"/)?.[0] ?? '';
        expect(scriptSrc).toMatch(/https:\/\/apis\.google\.com(\s|")/);
    });
});
