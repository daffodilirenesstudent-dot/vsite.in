// Display currency helpers.
// Cosmetic only — the underlying numbers are stored as plain decimals; the
// currency_code on the site (and snapshotted on each order row) decides how
// they render to humans.

export type CurrencyCode = 'INR' | 'AED';

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
    INR: '₹',
    AED: 'AED ',
};

// Receipt printers can't print '₹' or 'د.إ' reliably — use ASCII fallbacks.
export const CURRENCY_PRINT_SYMBOL: Record<CurrencyCode, string> = {
    INR: 'Rs.',
    AED: 'AED',
};

export function isCurrencyCode(s: unknown): s is CurrencyCode {
    return s === 'INR' || s === 'AED';
}

export function currencySymbol(code: string | null | undefined): string {
    return isCurrencyCode(code) ? CURRENCY_SYMBOL[code] : CURRENCY_SYMBOL.INR;
}

/** Format a price for display. Uses the symbol directly to avoid Intl.NumberFormat
 *  pulling locale data into the bundle on the customer side. */
export function formatPrice(amount: number | string, code?: string | null, opts?: { decimals?: number }): string {
    const n = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!Number.isFinite(n)) return `${currencySymbol(code)}0`;
    const decimals = opts?.decimals ?? (Number.isInteger(n) ? 0 : 2);
    return `${currencySymbol(code)}${n.toFixed(decimals)}`;
}
