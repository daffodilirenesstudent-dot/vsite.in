/**
 * Normalise a stored phone number to the shape the Cloud API `to` field takes:
 * country code + number, digits only, no `+`.
 *
 * `profiles.phone_number` is written from Firebase phone auth, so it is
 * normally E.164 (`+919876543210`). Older rows and hand edits are not, so a
 * bare 10-digit Indian mobile (starts 6–9) gets `91` prepended. Anything that
 * does not look like a real mobile returns null — the caller records the row
 * as skipped rather than paying Meta to reject it.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
    if (/^91[6-9]\d{9}$/.test(digits)) return digits;
    // Other countries: E.164 allows up to 15 digits. The leading `+` was the
    // only thing telling us this was a full international number.
    if (raw.trim().startsWith('+') && /^[1-9]\d{9,14}$/.test(digits)) return digits;
    return null;
}
