/**
 * Turning whatever arrives at an OTP box into six digits.
 *
 * Three sources feed these boxes and only one of them is typing:
 *
 *   - the owner types, one character at a time;
 *   - the owner pastes the SMS body, which carries prose around the code;
 *   - iOS QuickType or Android autofill drops the WHOLE code into whichever
 *     single box has focus.
 *
 * The previous implementation handled the first and assumed the rest away
 * (`value.slice(-1)`), which is why paste and autofill both silently failed.
 * Everything here is pure so the parsing can be tested without a DOM — see
 * tests/acceptance/otp-entry.test.ts.
 */

export const OTP_LENGTH = 6;

/**
 * The code inside `raw`, or '' if there isn't one.
 *
 * Real SMS bodies carry other numbers ("valid 10 min", "vsite 24x7"). The old
 * `replace(/\D/g, '').slice(0, 6)` glued them onto the code and truncated, so
 * pasting a whole SMS produced a wrong code rather than no code — the worse of
 * the two failures, because it looks like the owner mistyped.
 *
 * So: prefer a run of exactly OTP_LENGTH digits. Only if there is none do we
 * fall back to trimming a longer run, and only then to stitching short runs
 * together (senders who split the code, "123 456").
 */
export function extractOtpDigits(raw: string): string {
    const runs = raw.match(/\d+/g);
    if (!runs) return '';

    const exact = runs.find(run => run.length === OTP_LENGTH);
    if (exact) return exact;

    const longer = runs.find(run => run.length > OTP_LENGTH);
    if (longer) return longer.slice(0, OTP_LENGTH);

    return runs.join('').slice(0, OTP_LENGTH);
}

export interface DistributeResult {
    boxes: string[];
    /** Index of the box that should hold focus once React has re-rendered. */
    focus: number;
}

/**
 * Writes the digits found in `raw` into `boxes`, starting at `index`.
 *
 * One digit advances the focus by one (typing). Six digits fill the form
 * (autofill/paste). Anything past the last box is dropped rather than wrapped,
 * and `focus` never runs off the end — index OTP_LENGTH has no input behind it.
 */
export function distributeDigits(
    boxes: readonly string[],
    index: number,
    raw: string,
): DistributeResult {
    const next = Array.from({ length: OTP_LENGTH }, (_, i) => boxes[i] ?? '');
    const digits = extractOtpDigits(raw);

    if (digits.length === 0) {
        // An empty value is a real deletion and must clear the box. A value
        // with no digits in it is a stray keystroke — leave the code alone
        // rather than destroying a digit the owner already entered.
        if (raw === '') next[index] = '';
        return { boxes: next, focus: index };
    }

    let cursor = index;
    for (const digit of digits) {
        if (cursor >= OTP_LENGTH) break;
        next[cursor] = digit;
        cursor += 1;
    }

    return { boxes: next, focus: Math.min(cursor, OTP_LENGTH - 1) };
}

/** Whether `boxes` holds a submittable code. */
export function isOtpComplete(boxes: readonly string[]): boolean {
    return boxes.length === OTP_LENGTH && boxes.every(box => /^\d$/.test(box));
}

/** A fresh, empty set of boxes. */
export function emptyOtp(): string[] {
    return Array.from({ length: OTP_LENGTH }, () => '');
}
