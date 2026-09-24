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

/** The first thing stopping a save, in the owner's words, or null when it can be saved. */
export function validateProductForm(
    form: { name: string; sellingPrice: string; dishType: string },
    opts: { requireDishType: boolean },
): string | null {
    if (!form.name.trim()) return 'Product name is required';
    if (opts.requireDishType && !form.dishType) return 'Choose Veg or Non-veg';
    if (form.sellingPrice !== '' && Number(form.sellingPrice) < 0) return 'Price cannot be negative';
    return null;
}
