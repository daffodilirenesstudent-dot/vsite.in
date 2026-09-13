'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    OTP_LENGTH, distributeDigits, isOtpComplete, emptyOtp,
} from '@/lib/auth/otpInput';

/**
 * The six OTP boxes, shared by /login and /signup.
 *
 * Both pages used to carry a hand-maintained copy of this logic, which is how
 * a fix can land on one and miss the other. The parsing lives in
 * `@/lib/auth/otpInput` (pure, tested); this hook owns the React parts —
 * state, focus, and the single-shot auto-submit.
 */

interface UseOtpInputOptions {
    /**
     * Fired once the sixth digit lands. Called at most once per distinct code:
     * Firebase consumes a code on first use, so a second confirm() on the same
     * ConfirmationResult rejects and would flash "invalid code" at an owner
     * whose login actually succeeded.
     */
    onComplete: (code: string) => void;
}

export function useOtpInput({ onComplete }: UseOtpInputOptions) {
    const [otp, setOtp] = useState<string[]>(emptyOtp);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const submittedRef = useRef<string | null>(null);
    /** Focus is applied after render, so the target is parked here. */
    const pendingFocusRef = useRef<number | null>(null);

    // onComplete is re-created on every render of the page component. Holding
    // it in a ref keeps it out of the effect's dependency list, so the submit
    // effect fires on the code changing and on nothing else.
    const onCompleteRef = useRef(onComplete);
    useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

    const code = otp.join('');
    const complete = isOtpComplete(otp);

    useEffect(() => {
        const target = pendingFocusRef.current;
        if (target === null) return;
        pendingFocusRef.current = null;
        inputRefs.current[target]?.focus();
    }, [otp]);

    useEffect(() => {
        if (!complete) return;
        if (submittedRef.current === code) return;
        submittedRef.current = code;
        // On a phone the keyboard covers the button and the spinner. Dropping
        // it first is the only way the owner sees that anything happened.
        inputRefs.current[OTP_LENGTH - 1]?.blur();
        onCompleteRef.current(code);
    }, [complete, code]);

    const apply = useCallback((index: number, raw: string) => {
        setOtp(prev => {
            const { boxes, focus } = distributeDigits(prev, index, raw);
            pendingFocusRef.current = focus;
            return boxes;
        });
    }, []);

    const handleChange = useCallback((index: number, value: string) => {
        apply(index, value);
    }, [apply]);

    const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !e.currentTarget.value && index > 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        }
    }, []);

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        if (!text) return;
        // Without preventDefault the browser ALSO pastes into the focused box
        // and the change handler runs last, undoing everything done here.
        e.preventDefault();
        // A pasted code always starts the form, never continues it — the owner
        // is pasting the whole thing, whichever box happened to have focus.
        apply(0, text);
    }, [apply]);

    /**
     * Wipe the boxes and re-arm the auto-submit.
     *
     * Needed after a rejected code and after a resend. The submit guard is
     * keyed on the code, so without this a re-entered wrong code would be
     * swallowed as a duplicate.
     */
    const resetOtp = useCallback(() => {
        submittedRef.current = null;
        pendingFocusRef.current = 0;
        setOtp(emptyOtp());
    }, []);

    return {
        otp,
        code,
        complete,
        inputRefs,
        handleChange,
        handleKeyDown,
        handlePaste,
        resetOtp,
    };
}

export type OtpInput = ReturnType<typeof useOtpInput>;
