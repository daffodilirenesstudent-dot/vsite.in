/** "+911234567890" → "+91 12345 67890": how an Indian number is read aloud. Anything else is returned as given. */
export function readablePhone(raw: string | null | undefined): string {
    if (!raw) return '';
    const m = raw.replace(/\s+/g, '').match(/^\+91(\d{5})(\d{5})$/);
    return m ? `+91 ${m[1]} ${m[2]}` : raw;
}
