import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Getting six digits out of an SMS and into the form.
 *
 * This is the narrowest gate in the product: an owner who cannot get past it
 * has no account, no menu and no way to ask for help. Every other screen can
 * afford a bad day. This one cannot.
 *
 * Three defects shipped together, and they share ONE cause. The change handler
 * did `next[index] = value.slice(-1)` — it assumed a box only ever receives a
 * single character, because that is what typing looks like.
 *
 *   1. PASTE. `handleOtpPaste` set all six boxes but never called
 *      preventDefault(), so the native paste still landed in the focused box
 *      and the change handler fired AFTER it, overwriting the six digits with
 *      the last one. Copying the code from the SMS app did nothing.
 *
 *   2. AUTOFILL. iOS QuickType and Android autofill hand the WHOLE code to a
 *      single input. `.slice(-1)` threw away five of the six digits. The OS
 *      offer worked; the form discarded it.
 *
 *   3. AUTO-VERIFY. Six digits in, and the owner still had to find and press
 *      Verify. Every SaaS login worth copying submits on the sixth digit.
 *
 * So the contract is: a box may receive any number of characters, from any
 * source, and the form distributes them. That one rule fixes all three.
 *
 * Two things are deliberately NOT here:
 *
 *   - The WebOTP API (`navigator.credentials.get({ otp: ... })`). It only
 *     fires for an SMS whose last line is `@domain #code`. Firebase Auth does
 *     not send that format, so WebOTP would be dead code that looks like a
 *     feature. iOS/Android heuristic autofill is what actually works here.
 *
 *   - Removing the Verify button. Auto-submit is an accelerator, never the
 *     only way through. If the effect misses, a visible button is the
 *     difference between a slow login and no login.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');

const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments explain rejected designs; assertions must see shipped code only. */
const shipped = (p: string) =>
    read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const OTP_PAGES = {
    login: 'app/login/page.tsx',
    signup: 'app/signup/page.tsx',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Reading digits out of whatever the OS hands us
// ─────────────────────────────────────────────────────────────────────────────

describe('extractOtpDigits', () => {
    it('reads a bare six-digit code', async () => {
        const { extractOtpDigits } = await import('@/lib/auth/otpInput');
        expect(extractOtpDigits('123456')).toBe('123456');
    });

    it('ignores the other numbers in a real SMS body', async () => {
        const { extractOtpDigits } = await import('@/lib/auth/otpInput');
        // The exact shape Firebase Auth sends, and the exact shape the old
        // `replace(/\D/g,'').slice(0,6)` got wrong: stripping non-digits
        // glued the validity window onto the code and then truncated it.
        expect(extractOtpDigits('123456 is your verification code, valid 10 min'))
            .toBe('123456');
        expect(extractOtpDigits('Your vsite code is 654321. Do not share.'))
            .toBe('654321');
    });

    it('joins a code the sender split across a space', async () => {
        const { extractOtpDigits } = await import('@/lib/auth/otpInput');
        expect(extractOtpDigits('123 456')).toBe('123456');
    });

    it('passes a single typed digit straight through', async () => {
        const { extractOtpDigits } = await import('@/lib/auth/otpInput');
        expect(extractOtpDigits('7')).toBe('7');
    });

    it('yields nothing when there is no code to find', async () => {
        const { extractOtpDigits } = await import('@/lib/auth/otpInput');
        expect(extractOtpDigits('')).toBe('');
        expect(extractOtpDigits('no digits here')).toBe('');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Spreading them across the boxes
// ─────────────────────────────────────────────────────────────────────────────

describe('distributeDigits', () => {
    const EMPTY = ['', '', '', '', '', ''];

    it('fills every box when the OS autofills one input', async () => {
        const { distributeDigits } = await import('@/lib/auth/otpInput');
        // This is the autofill case: the whole code arrives at box 0.
        const { boxes } = distributeDigits(EMPTY, 0, '123456');
        expect(boxes).toEqual(['1', '2', '3', '4', '5', '6']);
    });

    it('fills every box when the code is pasted into a later box', async () => {
        const { distributeDigits } = await import('@/lib/auth/otpInput');
        // Paste is anchored at box 0 by the caller, but a distribute that
        // silently dropped digits past the end would still look right there.
        // Anchoring at 3 proves the overflow is clamped, not wrapped.
        const { boxes } = distributeDigits(EMPTY, 3, '123456');
        expect(boxes).toEqual(['', '', '', '1', '2', '3']);
    });

    it('advances the focus by one when a single digit is typed', async () => {
        const { distributeDigits } = await import('@/lib/auth/otpInput');
        const { boxes, focus } = distributeDigits(EMPTY, 0, '4');
        expect(boxes[0]).toBe('4');
        expect(focus).toBe(1);
    });

    it('parks the focus on the last box once the code is complete', async () => {
        const { distributeDigits } = await import('@/lib/auth/otpInput');
        // Focus must never run off the end — index 6 has no input to focus,
        // and the blur that dismisses the keyboard targets the last box.
        expect(distributeDigits(EMPTY, 0, '123456').focus).toBe(5);
    });

    it('clears the box on a deletion', async () => {
        const { distributeDigits } = await import('@/lib/auth/otpInput');
        const { boxes, focus } = distributeDigits(['1', '2', '', '', '', ''], 1, '');
        expect(boxes).toEqual(['1', '', '', '', '', '']);
        expect(focus).toBe(1);
    });

    it('leaves the code untouched when a non-digit arrives', async () => {
        const { distributeDigits } = await import('@/lib/auth/otpInput');
        const filled = ['1', '2', '3', '', '', ''];
        expect(distributeDigits(filled, 3, 'a').boxes).toEqual(filled);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Knowing when to submit
// ─────────────────────────────────────────────────────────────────────────────

describe('isOtpComplete', () => {
    it('is true only for six digits', async () => {
        const { isOtpComplete } = await import('@/lib/auth/otpInput');
        expect(isOtpComplete(['1', '2', '3', '4', '5', '6'])).toBe(true);
        expect(isOtpComplete(['1', '2', '3', '4', '5', ''])).toBe(false);
        expect(isOtpComplete(['1', '2', '3', '4', '5', 'a'])).toBe(false);
        expect(isOtpComplete([])).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Both pages run the same code
// ─────────────────────────────────────────────────────────────────────────────

describe.each(Object.entries(OTP_PAGES))('%s OTP step', (_name, file) => {
    const src = () => shipped(file);

    it('drives its boxes from the shared hook', () => {
        // login and signup carried two hand-maintained copies of this logic.
        // That is how one of them can be fixed and the other left broken, and
        // it is why the fix lives in one module both pages import.
        expect(src()).toMatch(/useOtpInput/);
    });

    it('keeps no private copy of the single-character assumption', () => {
        expect(src()).not.toMatch(/slice\(-1\)/);
    });

    it('cancels the native paste before writing the boxes', () => {
        // Without this the browser ALSO pastes into the focused box and the
        // change handler runs last, undoing everything the paste handler did.
        expect(shipped('hooks/useOtpInput.ts')).toMatch(/preventDefault\(\)/);
    });

    it('offers the SMS code on every box, not just the first', () => {
        // The OS fills whichever box has focus. Tagging only box 0 means the
        // offer never appears for an owner who tapped box 3 first.
        const page = src();
        expect(page).toMatch(/autoComplete=["']one-time-code["']/);
        expect(
            page,
            'autoComplete is still conditional on the box index',
        ).not.toMatch(/autoComplete=\{\s*i\s*===\s*0/);
    });

    it('still renders a Verify button as the fallback path', () => {
        expect(src()).toMatch(/onVerify/);
    });

    it('hands the form back after a failed code so the retry can auto-submit', () => {
        // The submit guard is keyed on the code, so a re-entered WRONG code
        // would be swallowed. Clearing the boxes on failure is what makes the
        // second attempt a fresh code and therefore submittable.
        expect(src()).toMatch(/resetOtp|clearOtp/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. The hook itself
// ─────────────────────────────────────────────────────────────────────────────

describe('useOtpInput', () => {
    const src = () => shipped('hooks/useOtpInput.ts');

    it('submits exactly once per code', () => {
        // Firebase consumes the code on first use. A second confirm() on the
        // same ConfirmationResult rejects, so an unguarded effect would flash
        // "invalid code" on a login that actually succeeded.
        expect(src()).toMatch(/submittedRef/);
    });

    it('dismisses the mobile keyboard before submitting', () => {
        // On a phone the keyboard covers the spinner. Blurring first means the
        // owner can see that something is happening.
        expect(src()).toMatch(/\.blur\(\)/);
    });
});
