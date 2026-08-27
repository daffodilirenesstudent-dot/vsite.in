/**
 * New-user provisioning: the profiles + user_subscriptions rows every account
 * needs before it can use the dashboard.
 *
 * This is the ONLY place in the codebase that inserts a `profiles` row.
 * /api/onboarding/complete merely UPDATEs it, so if this never runs the row is
 * never created — and a zero-row UPDATE reports success, leaving the account
 * permanently un-onboarded and bounced back to /onboarding on every visit.
 *
 * Therefore: provisioning is UNCONDITIONAL and IDEMPOTENT. It must be safe to
 * call on every single sign-in, not just the first. It previously ran only
 * when Firebase reported `isNewUser`, which is true exactly once per account —
 * so any failure before it (the awaited cookie sync hitting the 30/min/IP
 * limit on /api/auth/session, a dropped mobile connection) stranded the
 * account with no profile and no way to ever create one. Both upserts use
 * `ignoreDuplicates`, so re-running heals a missing row without touching an
 * existing one.
 */

/**
 * Thrown when a provisioning write fails. A distinct type so the auth layer can
 * surface the real reason instead of routing it through friendlyAuthError,
 * which only understands Firebase `code` values and would flatten it to
 * "Something went wrong".
 */
export class ProvisioningError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProvisioningError';
    }
}

interface UpsertOptions {
    onConflict: string;
    ignoreDuplicates: boolean;
}

interface UpsertResult {
    error: { message: string } | null;
}

/**
 * The slice of the Supabase client this module needs. Narrow on purpose: it
 * keeps the function unit-testable without standing up a real client, and
 * documents that provisioning does nothing but two upserts.
 */
export interface ProvisionClient {
    from(table: string): {
        upsert(
            values: Record<string, unknown>,
            options: UpsertOptions,
        ): PromiseLike<UpsertResult>;
    };
}

export interface ProvisionInput {
    /** Firebase UID — the primary key of `profiles`, a TEXT column (not a UUID). */
    uid: string;
    /** E.164 phone from Firebase, or null if the provider did not supply one. */
    phone: string | null;
    /** Display name collected on the signup form; absent on plain /login. */
    name?: string;
}

const TRIAL_DAYS = 14;

export async function provisionUser(
    client: ProvisionClient,
    { uid, phone, name }: ProvisionInput,
): Promise<void> {
    const profile: Record<string, unknown> = {
        id: uid,
        full_name: name ?? '',
        contact_email: '',
        onboarding_completed: false,
        updated_at: new Date().toISOString(),
    };

    // Only write the phone when we actually have one. Writing an explicit null
    // would blank a good stored value on a later healing run.
    if (phone) profile.phone_number = phone;

    const { error: profileError } = await client
        .from('profiles')
        .upsert(profile, { onConflict: 'id', ignoreDuplicates: true });

    // Deliberately NOT an early return: a failed profile write must not also
    // cost the user their subscription row. Whichever succeeded stays, and the
    // next sign-in heals the rest.
    const { error: subError } = await client.from('user_subscriptions').upsert(
        {
            user_id: uid,
            store_plan: 'base',
            store_expires_at: new Date().toISOString(),
            product_limit: 0,
            banner_limit: 0,
            site_limit: 0,
            trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'user_id', ignoreDuplicates: true },
    );

    // Name the failing write. The previous generic copy was routed through
    // friendlyAuthError, which recognises only Firebase `code` values and so
    // replaced it with "Something went wrong" — erasing the one detail that
    // would have identified this bug in production.
    if (profileError) {
        throw new ProvisioningError(`Could not save your profile: ${profileError.message}`);
    }
    if (subError) {
        throw new ProvisioningError(`Could not set up your account: ${subError.message}`);
    }
}
