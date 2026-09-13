/**
 * Opening hours, as something you tap rather than something you type.
 *
 * The old field was a bare text input with the placeholder "9:00 AM – 11:00 PM".
 * What it actually collected was "9-11", "morning to night", "10am-11pm", and
 * mostly nothing — none of which a customer can read off a menu header, and
 * none of which anything downstream can reason about.
 *
 * Storage stays exactly where it was: one display string in sites.timing. The
 * picker writes a canonical form and parses it back, so the public menu needs
 * no change and no data migration. Free text already in the column is left
 * ALONE unless the owner uses the picker — see parseTiming.
 */

export interface StoreTiming {
    open247: boolean;
    opensAt: string | null;
    closesAt: string | null;
}

const OPEN_247_LABEL = 'Open 24 hours';

/**
 * Every half hour of the day, starting at 6:00 AM.
 *
 * Starting at 6 rather than midnight puts a tea shop's actual opening time in
 * the first few options instead of thirteen scrolls down. The list wraps
 * through midnight to 5:30 AM so a late-night place can still say 1:00 AM.
 */
export const TIME_SLOTS: readonly string[] = buildSlots();

function buildSlots(): string[] {
    const slots: string[] = [];
    // 48 half-hours, offset so index 0 is 6:00 AM and the tail runs past
    // midnight to 5:30 AM.
    for (let i = 0; i < 48; i += 1) {
        const minutes = (6 * 60 + i * 30) % (24 * 60);
        const hour24 = Math.floor(minutes / 60);
        const minute = minutes % 60;
        const suffix = hour24 < 12 ? 'AM' : 'PM';
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
        slots.push(`${hour12}:${String(minute).padStart(2, '0')} ${suffix}`);
    }
    return slots;
}

/** The string written to sites.timing. */
export function formatTiming(value: StoreTiming): string {
    if (value.open247) return OPEN_247_LABEL;
    if (!value.opensAt || !value.closesAt) return '';
    return `${value.opensAt} - ${value.closesAt}`;
}

/**
 * Read sites.timing back into the picker.
 *
 * Only our own two shapes are understood. Anything else — every value the old
 * free-text box collected — parses to "nothing selected", which leaves the
 * stored string untouched until the owner actually picks something. Guessing
 * at "morning to night" would mean opening the settings tab silently rewrites
 * a store's published hours.
 */
export function parseTiming(raw: string | null | undefined): StoreTiming {
    const empty: StoreTiming = { open247: false, opensAt: null, closesAt: null };
    if (!raw) return empty;

    const text = raw.trim();
    if (text.toLowerCase() === OPEN_247_LABEL.toLowerCase()) {
        return { open247: true, opensAt: null, closesAt: null };
    }

    // Accept the en dash too: it is what the old placeholder showed, so some
    // owners will have copied it verbatim.
    const parts = text.split(/\s+[-–]\s+/);
    if (parts.length !== 2) return empty;

    const [opensAt, closesAt] = parts.map(p => p.trim());
    if (!TIME_SLOTS.includes(opensAt) || !TIME_SLOTS.includes(closesAt)) return empty;

    return { open247: false, opensAt, closesAt };
}

/** Whether `raw` is something the picker can represent without losing it. */
export function isPickerTiming(raw: string | null | undefined): boolean {
    if (!raw || raw.trim() === '') return true;
    const parsed = parseTiming(raw);
    return parsed.open247 || (parsed.opensAt !== null && parsed.closesAt !== null);
}
