import { isValidPincode } from '@/lib/store/businessTypes';
import { formatTiming, parseTiming, type StoreTiming } from '@/lib/store/storeTiming';

/**
 * Store details for the phone screen — the same five fields and the same
 * `sites` columns the settings tab has always written. Pure, so the rules are
 * tested once and the screen stays a layout.
 */

export const STORE_DETAILS_COLUMNS = 'id, slug, name, contact_number, location, pincode, business_type, timing';

export interface StoreDetailsRow {
    name: string | null;
    contact_number: string | null;
    location: string | null;
    pincode: string | null;
    business_type: string | null;
    timing: string | null;
}

export interface StoreDetailsForm {
    name: string;
    phone: string;
    location: string;
    pincode: string;
    businessType: string;
    timing: StoreTiming;
}

const blank = (v: string | null | undefined) => !v || !v.trim();

/**
 * The first thing Store details is missing, phrased as the next step. The
 * columns and their order are NotificationContext's — the dot on the You tab
 * and this line are the same fact, so they must agree.
 */
export function detailsNudge(row: Partial<StoreDetailsRow> | null): string | null {
    if (!row) return null;
    if (blank(row.name)) return 'Add your store name';
    if (blank(row.contact_number)) return 'Add a phone number for customers';
    if (blank(row.location)) return 'Add your area and city';
    if (blank(row.business_type)) return 'Choose your type of place';
    if (blank(row.timing)) return 'Add your opening hours';
    return null;
}

/**
 * The form as loaded. A store with no phone saved is seeded with the number the
 * owner just verified by OTP — but a saved number (often the counter landline)
 * is never replaced.
 */
export function formFromRow(row: Partial<StoreDetailsRow>, signInPhone?: string | null): StoreDetailsForm {
    return {
        name: row.name ?? '',
        phone: row.contact_number || signInPhone || '',
        location: row.location ?? '',
        pincode: row.pincode ?? '',
        businessType: row.business_type ?? '',
        timing: parseTiming(row.timing),
    };
}

/** The message to show, or null when the form can be saved. */
export function validateStoreDetails(form: StoreDetailsForm): string | null {
    if (!form.name.trim()) return 'Add your store name';
    if (!isValidPincode(form.pincode)) return 'Enter a valid 6-digit PIN code';
    return null;
}

/**
 * The `sites` update — exactly what the settings tab writes. Hours the picker
 * cannot express (old free text) are kept until the owner picks new ones.
 */
export function detailsUpdate(form: StoreDetailsForm, rawTiming: string | null): Record<string, string | null> {
    return {
        name: form.name.trim(),
        contact_number: form.phone.trim() || null,
        location: form.location.trim() || null,
        pincode: form.pincode.trim() || null,
        business_type: form.businessType || null,
        timing: formatTiming(form.timing) || rawTiming || null,
    };
}

export function isDirty(saved: StoreDetailsForm, current: StoreDetailsForm): boolean {
    return JSON.stringify(saved) !== JSON.stringify(current);
}

/** Deleting a store needs its name typed back; case and outer spaces do not count. */
export function canConfirmDelete(typed: string, storeName: string): boolean {
    return typed.trim() !== '' && typed.trim().toLowerCase() === storeName.trim().toLowerCase();
}
