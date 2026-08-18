/**
 * Regression tests for new-user provisioning.
 *
 * Production symptom: a phone+OTP signup created the Firebase account but left
 * no row in `profiles`.
 *
 * Two defects were behind it, both reproduced here:
 *
 * 1. The profile insert was gated on Firebase's `isNewUser`, which is true
 *    exactly once per account. Anything that failed before it — the awaited
 *    cookie sync hitting the 30/min/IP rate limit on /api/auth/session, a
 *    dropped connection — left an account with no profile, and every retry
 *    afterwards saw `isNewUser === false` and skipped the insert forever.
 *    Nothing else in the codebase ever inserts a profiles row, so the gap was
 *    permanent: ManageLayoutClient bounced the user to /onboarding, and
 *    /api/onboarding/complete only UPDATEs profiles, so it matched zero rows
 *    and never set onboarding_completed. An unbreakable onboarding loop.
 *
 * 2. The phone number was passed into the provisioning function and never
 *    written, so `profiles.phone_number` stayed empty even when the row existed.
 *
 * Provisioning must therefore be unconditional and idempotent: safe to run on
 * every sign-in, healing a missing row without clobbering an existing one.
 */

import { describe, it, expect } from 'vitest';
import { provisionUser } from '../../src/lib/provisionUser';

interface Captured {
  table: string;
  values: Record<string, unknown>;
  options: { onConflict?: string; ignoreDuplicates?: boolean };
}

/** Fake Supabase client that records upserts and can be told to fail. */
function makeClient(failOn?: string) {
  const calls: Captured[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(values: Record<string, unknown>, options: Captured['options'] = {}) {
          calls.push({ table, values, options });
          return Promise.resolve({
            error: failOn === table ? { message: `RLS denied on ${table}` } : null,
          });
        },
      };
    },
  };
  return { client, calls };
}

const NEW_USER = { uid: 'firebase-uid-placeholder-001', phone: '+911234500000', name: 'Test Owner' };

describe('provisionUser — profile row', () => {
  it('writes a profiles row for a brand-new signup', async () => {
    const { client, calls } = makeClient();
    await provisionUser(client, NEW_USER);

    const profile = calls.find((c) => c.table === 'profiles');
    expect(profile).toBeDefined();
    expect(profile!.values.id).toBe(NEW_USER.uid);
    expect(profile!.values.full_name).toBe('Test Owner');
  });

  it('persists the phone number (defect 2)', async () => {
    const { client, calls } = makeClient();
    await provisionUser(client, NEW_USER);

    const profile = calls.find((c) => c.table === 'profiles');
    expect(profile!.values.phone_number).toBe('+911234500000');
  });

  it('provisions even when the Firebase account already exists (defect 1)', async () => {
    // The healing case: account created on an earlier attempt whose profile
    // insert never happened. There is no isNewUser gate to skip it any more.
    const { client, calls } = makeClient();
    await provisionUser(client, { uid: 'returning-uid-002', phone: '+911234500001' });

    expect(calls.find((c) => c.table === 'profiles')).toBeDefined();
  });

  it('never clobbers an existing profile', async () => {
    const { client, calls } = makeClient();
    await provisionUser(client, NEW_USER);

    const profile = calls.find((c) => c.table === 'profiles')!;
    expect(profile.options.onConflict).toBe('id');
    expect(profile.options.ignoreDuplicates).toBe(true);
  });

  it('defaults full_name to an empty string when no name is supplied', async () => {
    const { client, calls } = makeClient();
    await provisionUser(client, { uid: 'no-name-003', phone: null });

    const profile = calls.find((c) => c.table === 'profiles')!;
    expect(profile.values.full_name).toBe('');
  });

  it('omits phone_number rather than writing null when Firebase has no phone', async () => {
    const { client, calls } = makeClient();
    await provisionUser(client, { uid: 'no-phone-004', phone: null });

    const profile = calls.find((c) => c.table === 'profiles')!;
    // Writing an explicit null would blank a good value on a later heal.
    expect('phone_number' in profile.values).toBe(false);
  });
});

describe('provisionUser — subscription row', () => {
  it('upserts a subscription without clobbering a paid one', async () => {
    const { client, calls } = makeClient();
    await provisionUser(client, NEW_USER);

    const sub = calls.find((c) => c.table === 'user_subscriptions')!;
    expect(sub.values.user_id).toBe(NEW_USER.uid);
    expect(sub.options.onConflict).toBe('user_id');
    expect(sub.options.ignoreDuplicates).toBe(true);
  });
});

describe('provisionUser — error reporting', () => {
  it('surfaces which write failed instead of a generic message', async () => {
    const { client } = makeClient('profiles');
    await expect(provisionUser(client, NEW_USER)).rejects.toThrow(/profile/i);
  });

  it('still attempts the subscription write after a profile failure', async () => {
    // A profile failure must not strand the account with neither row.
    const { client, calls } = makeClient('profiles');
    await provisionUser(client, NEW_USER).catch(() => undefined);

    expect(calls.find((c) => c.table === 'user_subscriptions')).toBeDefined();
  });
});
