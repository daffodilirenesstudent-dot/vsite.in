'use client';
import { PageLoader } from '@/components/loading';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { firebaseAuth } from '@/lib/auth/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Silent refresh interstitial. Middleware routes here when a user's cookie
// contains an expired Firebase ID token but Firebase client may still hold a
// refreshable session (persisted in IndexedDB). We force a token refresh,
// re-sync the HttpOnly cookie server-side, and bounce back to the original
// destination — all invisible to the user (~300ms spinner).
//
// If the Firebase client has no session, we fall through to /login.

function RefreshInner() {
    const params = useSearchParams();
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;

        const rawTo = params.get('to') ?? '/manage/dashboard';
        // Only allow internal paths — blocks open-redirect attacks
        const to = rawTo.startsWith('/') && !rawTo.startsWith('//')
            ? rawTo
            : '/manage/dashboard';

        // Give Firebase a moment to restore its persisted session before deciding.
        // onAuthStateChanged fires once with the restored user (or null) after init.
        const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
            if (handled.current) return;
            handled.current = true;
            unsub();

            if (!user) {
                // No persisted session — user must log in fresh
                window.location.replace(`/login?expired=true&redirectTo=${encodeURIComponent(to)}`);
                return;
            }

            try {
                // Force refresh — gets a brand new ID token with fresh 1h exp
                const token = await user.getIdToken(true);
                const res = await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                if (!res.ok) throw new Error('session sync failed');
                window.location.replace(to);
            } catch {
                // Refresh failed (network, revoked token, etc.) — fall back to login
                window.location.replace(`/login?expired=true&redirectTo=${encodeURIComponent(to)}`);
            }
        });

        // Safety: if onAuthStateChanged never fires (offline init, etc.),
        // bail to login after 5s so the user isn't stuck on a spinner.
        const timeoutId = window.setTimeout(() => {
            if (handled.current) return;
            handled.current = true;
            unsub();
            window.location.replace(`/login?expired=true&redirectTo=${encodeURIComponent(to)}`);
        }, 5000);

        return () => {
            window.clearTimeout(timeoutId);
            unsub();
        };
    }, [params]);

    return (
        <div className="bg-white">
            <PageLoader message="Restoring your session…" />
        </div>
    );
}

export default function AuthRefreshPage() {
    return (
        <Suspense
            fallback={
                <div className="bg-white">
                    <PageLoader />
                </div>
            }
        >
            <RefreshInner />
        </Suspense>
    );
}
