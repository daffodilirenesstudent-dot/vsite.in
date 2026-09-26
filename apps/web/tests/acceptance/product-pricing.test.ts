import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A dish's price is what a diner reads first. QA 2026-09-26 found two ways the
 * inventory drawer put a wrong one on the live menu:
 *
 *   1. SIZES SHOWED "₹0 onwards". A Sizes dish saved the plain Selling Price
 *      box — usually left empty, so 0 — instead of its cheapest size. The menu
 *      card prints `selling_price` + "onwards", so every size was ₹0 onwards.
 *   2. NO PRICE AT ALL WENT LIVE AT ₹0. validateProductForm only refused a
 *      negative price, so an empty one saved as 0 ("Browine ₹0" on the QA
 *      store came from this).
 *
 * The listed price is DERIVED from the sizes for a Sizes dish, and a dish
 * cannot be saved until it has a price a diner can pay.
 */

const SRC = join(__dirname, '..', '..', 'src');
const shipped = (p: string) =>
    readFileSync(join(SRC, p), 'utf8').replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

const PAGE = 'app/manage/product-inventory/page.tsx';

describe('the listed price of a Sizes dish is its cheapest size', () => {
    it('ignores the Selling Price box and takes the lowest size price', async () => {
        const { listedPrice } = await import('@/lib/menu/productForm');
        const sizes = [{ size: 'Full', price: '220' }, { size: 'Half', price: '140' }];
        expect(listedPrice('Variants', '', sizes)).toBe(140);
        expect(listedPrice('Variants', '0', sizes)).toBe(140);
    });

    it('skips unnamed rows and unpriced sizes when finding the cheapest', async () => {
        const { listedPrice } = await import('@/lib/menu/productForm');
        const sizes = [{ size: '', price: '50' }, { size: 'Large', price: '180' }, { size: 'Small', price: '' }];
        expect(listedPrice('Variants', '', sizes)).toBe(180);
    });

    it('accepts numeric prices too (AI extraction stores numbers)', async () => {
        const { listedPrice } = await import('@/lib/menu/productForm');
        expect(listedPrice('Variants', '', [{ size: 'Regular', price: 90 }, { size: 'Jumbo', price: 150 }])).toBe(90);
    });

    it('is 0 — never Infinity — when no size has a price', async () => {
        const { listedPrice } = await import('@/lib/menu/productForm');
        expect(listedPrice('Variants', '', [{ size: 'Small', price: '' }])).toBe(0);
        expect(listedPrice('Variants', '', [])).toBe(0);
    });

    it('is the Selling Price for one-price and combo dishes', async () => {
        const { listedPrice } = await import('@/lib/menu/productForm');
        expect(listedPrice('Single Item', '120', [{ size: 'Half', price: '60' }])).toBe(120);
        expect(listedPrice('Combo', '299', [])).toBe(299);
    });
});

describe('a dish cannot go live without a price', () => {
    const base = { name: 'Brownie', dishType: 'Vegetarian' };
    const opts = { requireDishType: true };

    it('refuses an empty price on a one-price dish', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ ...base, sellingPrice: '' }, opts)).toBe('Enter a price above ₹0');
    });

    it('refuses a ₹0 price', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ ...base, sellingPrice: '0', productType: 'Single Item' }, opts)).toBe('Enter a price above ₹0');
    });

    it('refuses a combo with no price', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ ...base, sellingPrice: '', productType: 'Combo' }, opts)).toBe('Enter a price above ₹0');
    });

    it('still refuses a negative price', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ ...base, sellingPrice: '-5' }, opts)).toBe('Price cannot be negative');
    });

    it('accepts a real price', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ ...base, sellingPrice: '80' }, opts)).toBeNull();
    });

    it('refuses a Sizes dish with no priced size, whatever the Selling Price box says', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        const form = { ...base, sellingPrice: '120', productType: 'Variants', sizes: [{ size: '', price: '' }] };
        expect(validateProductForm(form, opts)).toBe('Add at least one size with its price');
    });

    it('refuses a named size with no price, naming it', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        const form = { ...base, sellingPrice: '', productType: 'Variants', sizes: [{ size: 'Half', price: '140' }, { size: 'Full', price: '' }] };
        expect(validateProductForm(form, opts)).toBe('Add a price for "Full"');
    });

    it('refuses a size price with no size name, rather than dropping it silently', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        const form = { ...base, sellingPrice: '', productType: 'Variants', sizes: [{ size: 'Half', price: '140' }, { size: ' ', price: '220' }] };
        expect(validateProductForm(form, opts)).toBe('Give every size a name');
    });

    it('accepts a Sizes dish with an empty Selling Price box once a size is priced', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        const form = { ...base, sellingPrice: '', productType: 'Variants', sizes: [{ size: 'Half', price: '140' }, { size: '', price: '' }] };
        expect(validateProductForm(form, opts)).toBeNull();
    });

    it('checks the name and veg/non-veg before the price', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ name: '', dishType: '', sellingPrice: '' }, opts)).toBe('Product name is required');
        expect(validateProductForm({ name: 'Tea', dishType: '', sellingPrice: '' }, opts)).toBe('Choose Veg or Non-veg');
    });
});

describe('the inventory drawer saves the derived price', () => {
    it('validates with the size rows', () => {
        expect(shipped(PAGE)).toMatch(/validateProductForm\(\{\s*\.\.\.form,\s*sizes:\s*variants\s*\}/);
    });

    it('stores listedPrice, not the raw Selling Price box, as selling_price', () => {
        const page = shipped(PAGE);
        expect(page).toMatch(/listedPrice\(form\.productType,\s*form\.sellingPrice,\s*variants\)/);
        expect(page).not.toMatch(/selling_price:\s*Number\(form\.sellingPrice\)/);
    });

    it('shows a Sizes dish its derived price instead of an editable Selling Price box', () => {
        expect(shipped(PAGE)).toMatch(/<PriceFields[^>]*derivedPrice=\{/);
    });
});

/**
 * Dishes saved before the fix still carry selling_price 0. The menu derives
 * their "onwards" price from the sizes on read, so they are right today
 * without rewriting menu data. Only a ₹0 price is replaced — an owner's own
 * price (an offer, say) is never second-guessed.
 */
describe('the customer menu never shows a Sizes dish at ₹0', () => {
    const sizes = { variants: [{ size: 'Half', price: 140 }, { size: 'Full', price: '220' }] };

    it('derives the price of an old ₹0 Sizes dish from its sizes', async () => {
        const { menuCardPrice } = await import('@/lib/menu/productForm');
        expect(menuCardPrice(0, sizes)).toBe(140);
    });

    it('keeps a price the owner set', async () => {
        const { menuCardPrice } = await import('@/lib/menu/productForm');
        expect(menuCardPrice(120, sizes)).toBe(120);
    });

    it('leaves a dish with nothing to derive from alone', async () => {
        const { menuCardPrice } = await import('@/lib/menu/productForm');
        expect(menuCardPrice(0, null)).toBe(0);
        expect(menuCardPrice(0, { variants: [{ size: 'Small', price: 0 }] })).toBe(0);
    });

    it('the shop applies it to server and realtime rows alike', () => {
        expect(shipped('app/shop/[slug]/ShopPageClient.tsx')).toMatch(/menuCardPrice\(/);
    });
});

describe('AI extraction never lists a Sizes dish at Infinity', () => {
    // Tuple format the model returns: [name, price, category, type, food, sizes].
    it('falls back to 0 when every size price is unreadable', async () => {
        const { tupleToItem } = await import('@/lib/menu/menuExtractor');
        const item = tupleToItem(['Lassi', 0, 'Drinks', 'v', 'v', [['Small', 0], ['Large', 0]]]);
        expect(item?.price).toBe(0);
    });

    it('still takes the cheapest size when the dish price is missing', async () => {
        const { tupleToItem } = await import('@/lib/menu/menuExtractor');
        const item = tupleToItem(['Lassi', 0, 'Drinks', 'v', 'v', [['Large', 80], ['Small', 50]]]);
        expect(item?.price).toBe(50);
    });
});
