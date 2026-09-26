/**
 * Rules for the inventory "Add / Edit Product" drawer. Pure and client-safe.
 *
 * The order is an owner's order of thought, not the database's: name first
 * (everything else keys off it — the library photo is matched from it),
 * the photo right under it, then the required choices, then price, and the
 * optional description last. Product type is not a step: single / sizes /
 * combo only changes how the item is priced, so it lives inside pricing.
 * See tests/acceptance/smart-add-product.test.ts for the research behind it.
 */

/** Build-time flag. OFF unless exactly "true" — flag off is today's drawer. */
export const SMART_ADD_PRODUCT: boolean = process.env.NEXT_PUBLIC_SMART_ADD_PRODUCT === 'true';

export const SMART_FORM_ORDER = [
    'name',
    'photo',
    'dishType',
    'category',
    'pricing',
    'description',
    'visibility',
] as const;

export type SmartFormField = typeof SMART_FORM_ORDER[number];

/** `value` is what the products table stores in `type`; `label` is what the owner reads. */
export const PRICING_MODES = [
    { value: 'Single Item', label: 'One price' },
    { value: 'Variants',    label: 'Sizes' },
    { value: 'Combo',       label: 'Combo' },
] as const;

export type DishTypeChoice = 'Vegetarian' | 'Non-Vegetarian' | '';

/**
 * No default when the flag is on. Owners keep whatever is preselected, and the
 * old preselected Non-Vegetarian put veg dishes on the menu as non-veg.
 */
export function initialDishType(smart: boolean): DishTypeChoice {
    return smart ? '' : 'Non-Vegetarian';
}

/** One size row. Prices arrive as strings from the drawer and as numbers from AI extraction. */
export interface SizeRow { size: string; price: string | number }

const priceOf = (raw: string | number): number => {
    const n = typeof raw === 'number' ? raw : raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? n : 0;
};

/**
 * The price the menu card shows. A Sizes dish is listed at its cheapest size
 * ("₹140 onwards"); the Selling Price box is not asked for there, so it is
 * usually empty and saving it put "₹0 onwards" on the menu. 0 when nothing is
 * priced — never Infinity, which `Math.min()` of nothing would be.
 */
export function listedPrice(productType: string, sellingPrice: string, sizes: readonly SizeRow[]): number {
    if (productType !== 'Variants') return priceOf(sellingPrice);
    const priced = sizes.filter(s => s.size.trim()).map(s => priceOf(s.price)).filter(p => p > 0);
    return priced.length > 0 ? Math.min(...priced) : 0;
}

/**
 * The price a menu card prints. Sizes dishes saved before listedPrice existed
 * carry selling_price 0; derive theirs from the sizes so the menu is right
 * without rewriting menu data. Any price the owner set is kept as it is.
 */
export function menuCardPrice(sellingPrice: number, metadata: Record<string, unknown> | null | undefined): number {
    const stored = Number(sellingPrice) || 0;
    if (stored > 0) return stored;
    const variants = metadata?.variants;
    if (!Array.isArray(variants)) return stored;
    const sizes = variants.filter((v): v is SizeRow =>
        !!v && typeof v === 'object' && typeof (v as SizeRow).size === 'string'
        && (typeof (v as SizeRow).price === 'string' || typeof (v as SizeRow).price === 'number'));
    return listedPrice('Variants', '', sizes) || stored;
}

/** The first thing stopping a save, in the owner's words, or null when it can be saved. */
export function validateProductForm(
    form: { name: string; sellingPrice: string; dishType: string; productType?: string; sizes?: readonly SizeRow[] },
    opts: { requireDishType: boolean },
): string | null {
    if (!form.name.trim()) return 'Product name is required';
    if (opts.requireDishType && !form.dishType) return 'Choose Veg or Non-veg';

    // A diner must never read ₹0 for something they have to pay for.
    if (form.productType === 'Variants') {
        const sizes = form.sizes ?? [];
        const filled = (p: string | number) => String(p).trim() !== '';
        if (sizes.some(s => !s.size.trim() && filled(s.price))) return 'Give every size a name';
        const named = sizes.filter(s => s.size.trim());
        const unpriced = named.find(s => priceOf(s.price) <= 0);
        if (unpriced) return `Add a price for "${unpriced.size.trim()}"`;
        if (named.length === 0) return 'Add at least one size with its price';
        return null;
    }
    const price = priceOf(form.sellingPrice);
    if (price < 0) return 'Price cannot be negative';
    if (price === 0) return 'Enter a price above ₹0';
    return null;
}
