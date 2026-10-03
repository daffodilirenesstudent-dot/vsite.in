import 'server-only';
import { decodeJwt } from 'jose';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';

/**
 * The owner's phone, from the Firebase ID token — server-side.
 *
 * Phone sign-in puts the number the owner proved with OTP in the token's
 * `phone_number` claim (E.164). Profiles created since 2026-08-30 have no
 * phone_number: the browser's provisioning lost the race to /auth/continue,
 * which wrote the row with `phone: null`, and its ignoreDuplicates upsert never
 * fills a column later. Every WhatsApp notification is looked up by
 * profiles.phone_number, so those owners were skipped silently.
 *
 * Callers pass a token that verifyFirebaseToken has ALREADY verified in the
 * same request — this only reads a claim from it, it does not verify.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

/** The verified phone in E.164, or null. Never throws. */
export function phoneFromIdToken(token: string): string | null {
    try {
        const phone = decodeJwt(token).phone_number;
        return typeof phone === 'string' && E164.test(phone) ? phone : null;
    } catch {
        return null;
    }
}

/**
 * Fill a blank profiles.phone_number. Never overwrites a stored one: the
 * condition is in the UPDATE itself, so it is atomic. True when a row changed.
 */
export async function backfillProfilePhone(uid: string, phone: string): Promise<boolean> {
    const { data, error } = await supabaseServer
        .from('profiles')
        .update({ phone_number: phone, updated_at: new Date().toISOString() })
        .eq('id', uid)
        .is('phone_number', null)
        .select('id');
    if (error) throw new Error(`profile phone backfill failed: ${error.message}`);
    return (data ?? []).length > 0;
}

/**
 * Best-effort `backfillProfilePhone` from a verified token, for request paths
 * (login, onboarding, payment): resolves either way, never rejects.
 */
export async function rememberVerifiedPhone(uid: string, verifiedToken: string): Promise<void> {
    const phone = phoneFromIdToken(verifiedToken);
    if (!phone) return;
    try {
        await backfillProfilePhone(uid, phone);
    } catch (err) {
        logger.error('[profilePhone] backfill failed:', err instanceof Error ? err.message : 'unknown');
    }
}
