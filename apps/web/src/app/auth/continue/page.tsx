import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { provisionUser } from '@/lib/auth/provisionUser';
import {
    resolvePostAuthDestination,
    safeInternalPath,
} from '@/lib/auth/postAuthDestination';

/**
 * The single door into the app after OTP.
 *
 * /login and /signup both land here instead of each deciding for themselves.
 * They used to branch on Firebase's `isNewUser` — true exactly once per
 * Firebase account, and unrelated to whether the person owns any stores — then
 * hand off to a client-side gate in ManageLayoutClient that re-decided the same
 * question from `profiles.onboarding_completed`. Two answers to one question,
 * from two unreliable signals, on two code paths. Owners of live stores were
 * told they were new and could not reach their dashboard.
 *
 * Now the question is asked once, on the server, against the fact that actually
 * settles it: does this account own a site? The redirect is issued before any
 * HTML ships, so there is no dashboard flash and no client round-trip.
 *
 * `ManageLayoutClient`'s gate stays as defence in depth — it protects direct
 * navigation to /manage/* that never passes through here.
 */

export const dynamic = 'force-dynamic';

export default async function AuthContinuePage({
    searchParams,
}: {
    searchParams: { next?: string };
}) {
    const token = cookies().get('sb-access-token')?.value;
    const next = safeInternalPath(searchParams.next ?? null);

    // No usable session: back to login, preserving where they were headed so
    // the deep link survives the round trip.
    if (!token) {
        redirect(next ? `/login?redirectTo=${encodeURIComponent(next)}` : '/login');
    }

    const uid = await verifyFirebaseToken(token);
    if (!uid) {
        redirect(next ? `/login?redirectTo=${encodeURIComponent(next)}` : '/login');
    }

    // head:true keeps this a COUNT — we need the number, never the rows.
    const { count, error } = await supabaseServer
        .from('sites')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);

    if (error) {
        // Fail towards the dashboard, not onboarding. Its own gate fails open
        // too, so a transient Supabase error shows an empty dashboard the user
        // can retry — rather than marching an existing owner through a wizard
        // that would have them create a duplicate store. Getting this backwards
        // is the bug this whole route exists to prevent.
        redirect(next ?? '/manage/dashboard');
    }

    const siteCount = count ?? 0;

    // Heal a missing profiles row while we are already here and know the truth.
    // Provisioning was once gated on Firebase's isNewUser, so accounts whose
    // first sign-in failed never got a row; they still created stores, because
    // `sites` does not depend on `profiles`. Idempotent — safe on every login.
    try {
        await provisionUser(supabaseServer, { uid, phone: null });
        if (siteCount > 0) {
            // Owning a store IS being onboarded. Correct the flag so the client
            // gate does not send them round again.
            await supabaseServer
                .from('profiles')
                .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
                .eq('id', uid)
                .eq('onboarding_completed', false);
        }
    } catch {
        // Best effort: the redirect below is decided from siteCount, which we
        // already have. A failed repair costs nothing this request.
    }

    redirect(resolvePostAuthDestination({ siteCount, next }));
}
