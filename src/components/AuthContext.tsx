'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { firebaseAuth } from '@/lib/firebase';
import {
    signInWithPhoneNumber,
    RecaptchaVerifier,
    signOut as firebaseSignOut,
    onIdTokenChanged,
    getAdditionalUserInfo,
    type ConfirmationResult,
    type User as FirebaseUser,
} from 'firebase/auth';

const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

// Minimal user shape — all components only need `.id` and `.name`
interface AuthUser {
    id: string;
}

interface AuthContextType {
    user: AuthUser | null;
    // Kept for backward compat with components that use session.user.id
    session: { user: AuthUser } | null;
    loading: boolean;
    sendOTP: (phone: string) => Promise<{ error: string | null }>;
    verifyOTP: (otp: string, name?: string) => Promise<{ error: string | null; isNewUser: boolean }>;
    resetOTP: () => void;
    signOut: () => Promise<void>;
}

function friendlyAuthError(err: unknown): string {
    if (!(err instanceof Error)) return 'Something went wrong. Please try again.';
    const code = (err as { code?: string }).code ?? '';
    const map: Record<string, string> = {
        'auth/too-many-requests':    'Too many attempts. Please wait a few minutes and try again.',
        'auth/invalid-phone-number': 'Invalid phone number. Please check and try again.',
        'auth/invalid-verification-code': 'Incorrect OTP. Please try again.',
        'auth/code-expired':         'OTP has expired. Please request a new one.',
        'auth/session-expired':      'Session expired. Please request a new OTP.',
        'auth/quota-exceeded':       'SMS quota exceeded. Please try again later.',
        'auth/captcha-check-failed': 'Verification failed. Please refresh and try again.',
        'auth/invalid-app-credential': 'App verification failed. Please refresh and try again.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
    };
    return map[code] ?? 'Something went wrong. Please try again.';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Fetch with retries + exponential backoff.
// Flaky 4G is the norm for TN restaurants — silently dropping a cookie sync
// leaves the user with a stale cookie and bounces them on next navigation.
//
// 429 handling honours the server's Retry-After header. Rate-limit windows
// (60s on /api/auth/session) are far longer than naive backoff (~600ms across
// 3 tries) would ever cover. Under a 50-concurrent-signup burst, this means
// the 20 users who hit the limit actually recover instead of seeing an OTP error.
const MAX_429_WAIT_MS = 8_000;  // honour Retry-After up to 8s; longer = surface error
async function fetchWithRetry(
    url: string,
    init: RequestInit,
    attempts = 4,
): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, init);
            if (res.ok) return res;
            // 5xx / 429 → retry; 4xx (besides 429) → don't retry (token issue)
            if (res.status < 500 && res.status !== 429) return res;

            // Honour server's Retry-After for 429s. Falls back to exponential
            // backoff (300ms → 600ms → 1200ms) for 5xx or missing header.
            let waitMs: number;
            if (res.status === 429) {
                const ra = parseInt(res.headers.get('Retry-After') ?? '', 10);
                waitMs = Number.isFinite(ra) && ra > 0
                    ? Math.min(ra * 1000, MAX_429_WAIT_MS)
                    : Math.min(800 * Math.pow(2, i), MAX_429_WAIT_MS);
            } else {
                waitMs = 300 * Math.pow(2, i);
            }
            lastErr = new Error(`HTTP ${res.status}`);
            if (i < attempts - 1) await new Promise((r) => setTimeout(r, waitMs));
        } catch (err) {
            lastErr = err;
            if (i < attempts - 1) {
                await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)));
            }
        }
    }
    throw lastErr;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [session, setSession] = useState<{ user: AuthUser } | null>(null);
    const [loading, setLoading] = useState(true);
    const confirmationResultRef = useRef<ConfirmationResult | null>(null);
    const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
    // Track the last token we synced so we don't POST duplicate cookies when
    // the token hasn't actually rotated (verifyOTP + onIdTokenChanged both fire).
    const lastSyncedTokenRef = useRef<string | null>(null);

    // Sync Firebase ID token as HttpOnly cookie via server API so JS cannot read it.
    // Idempotent: skips if the token is the same one we just synced.
    const syncCookie = async (firebaseUser: FirebaseUser | null) => {
        if (typeof window === 'undefined') return;

        if (firebaseUser) {
            try {
                const token = await firebaseUser.getIdToken();
                if (lastSyncedTokenRef.current === token) return; // dedupe
                await fetchWithRetry('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                lastSyncedTokenRef.current = token;
            } catch {
                // All retries failed. Next navigation may bounce to /auth/refresh,
                // which will re-attempt the sync — graceful degradation.
            }
        } else {
            try {
                await fetchWithRetry('/api/auth/session', { method: 'DELETE' });
            } catch {
                // best-effort
            }
            lastSyncedTokenRef.current = null;
        }
    };

    useEffect(() => {
        // Listen to Firebase auth state — this is the source of truth.
        // onIdTokenChanged also fires on silent hourly token refreshes, keeping
        // the HttpOnly cookie in lockstep with the Firebase session.
        const unsubscribe = onIdTokenChanged(firebaseAuth, async (firebaseUser) => {
            if (firebaseUser) {
                const authUser: AuthUser = { id: firebaseUser.uid };
                setUser(authUser);
                setSession({ user: authUser });
                await syncCookie(firebaseUser);
            } else {
                setUser(null);
                setSession(null);
                await syncCookie(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const resetOTP = () => {
        // Called when user clicks "edit number" — destroy the verifier so a
        // fresh one is created against the re-mounted DOM node on next send
        recaptchaVerifierRef.current?.clear();
        recaptchaVerifierRef.current = null;
        confirmationResultRef.current = null;
    };

    const sendOTP = async (phone: string): Promise<{ error: string | null }> => {
        try {
            if (isLocalhost) {
                firebaseAuth.settings.appVerificationDisabledForTesting = true;
            }

            if (!recaptchaVerifierRef.current) {
                recaptchaVerifierRef.current = new RecaptchaVerifier(
                    firebaseAuth,
                    'recaptcha-container',
                    { size: 'invisible' }
                );
                await recaptchaVerifierRef.current.render();
            }

            const confirmation = await signInWithPhoneNumber(firebaseAuth, phone, recaptchaVerifierRef.current);
            confirmationResultRef.current = confirmation;
            return { error: null };
        } catch (err: unknown) {
            recaptchaVerifierRef.current?.clear();
            recaptchaVerifierRef.current = null;
            return { error: friendlyAuthError(err) };
        }
    };

    const verifyOTP = async (otp: string, name?: string): Promise<{ error: string | null; isNewUser: boolean }> => {
        if (!confirmationResultRef.current) {
            return { error: 'Please request an OTP first', isNewUser: false };
        }
        try {
            const credential = await confirmationResultRef.current.confirm(otp);
            const firebaseUser = credential.user;

            // Firebase is the authoritative source for new vs existing user.
            // A Supabase DB check is unreliable here: RLS may block the SELECT
            // if the client JWT hasn't been validated by Supabase yet, causing
            // existing users to be incorrectly treated as new on every login.
            const isNewUser = getAdditionalUserInfo(credential)?.isNewUser ?? false;

            // Wait for cookie before returning — prevents middleware bouncing the redirect.
            // syncCookie dedupes via lastSyncedTokenRef so onIdTokenChanged's call is free.
            await syncCookie(firebaseUser);

            await provisionNewUser(firebaseUser.uid, firebaseUser.phoneNumber, name, isNewUser);

            return { error: null, isNewUser };
        } catch (err: unknown) {
            return { error: friendlyAuthError(err), isNewUser: false };
        }
    };

    // Provisions a new user profile and subscription row.
    // isNew comes from Firebase's authoritative AdditionalUserInfo — do not re-derive it here.
    // Both writes are idempotent via upsert with ignoreDuplicates, so a retry after a
    // partial failure heals state without clobbering existing data.
    const provisionNewUser = async (uid: string, phone: string | null, name?: string, isNew = false): Promise<void> => {
        // Profile — only create for brand-new Firebase accounts.
        // We intentionally do NOT overwrite full_name/onboarding_completed on conflict.
        if (isNew) {
            const { error: profileError } = await supabase.from('profiles').upsert(
                {
                    id: uid,
                    full_name: name ?? '',
                    contact_email: '',
                    onboarding_completed: false,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'id', ignoreDuplicates: true },
            );
            if (profileError) throw new Error('Failed to create your profile. Please try again.');
        }

        // Subscription — always upsert. If a prior verifyOTP attempt succeeded at profile
        // but failed at subscription, this heals that state on retry. ignoreDuplicates so
        // we never clobber an existing (possibly paid) subscription.
        const { error: subError } = await supabase.from('user_subscriptions').upsert(
            {
                user_id: uid,
                store_plan: 'base',
                store_expires_at: new Date().toISOString(),
                product_limit: 0,
                banner_limit: 0,
                site_limit: 0,
                trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: 'user_id', ignoreDuplicates: true },
        );
        if (subError) throw new Error('Failed to set up your account. Please try again.');
    };

    const signOut = async () => {
        await syncCookie(null); // delete cookie before navigating so middleware doesn't bounce
        await firebaseSignOut(firebaseAuth);
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, sendOTP, verifyOTP, resetOTP, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
