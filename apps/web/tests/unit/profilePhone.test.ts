/**
 * The owner's phone, captured server-side from the verified Firebase ID token.
 *
 * Profiles created since 2026-08-30 had no phone_number: the browser-side
 * provisioning lost the race to /auth/continue, which wrote the row with
 * `phone: null`, and ignoreDuplicates meant nothing filled it later. WhatsApp
 * then skipped those owners silently. The token's `phone_number` claim is the
 * number the owner proved with OTP, so the server fills a blank phone from it —
 * and never overwrites one that is already stored.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: (t: string) => fakeClient(holder.db).from(t) },
}));

import { phoneFromIdToken, backfillProfilePhone, rememberVerifiedPhone } from '@/lib/auth/profilePhone';

/** An unsigned JWT-shaped string. Signature checks are verifyFirebaseToken's job, upstream. */
function token(claims: Record<string, unknown>): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ sub: 'u1', ...claims })}.sig`;
}

const profiles = () => holder.db.tables.profiles as Array<Record<string, unknown>>;

beforeEach(() => {
    holder.db = createFakeDb({ tables: { profiles: [] } });
});

describe('phoneFromIdToken', () => {
    it('reads the E.164 phone_number claim', () => {
        expect(phoneFromIdToken(token({ phone_number: '+919876543210' }))).toBe('+919876543210');
    });
    it('null when the account has no phone', () => {
        expect(phoneFromIdToken(token({}))).toBeNull();
    });
    it('null for a claim that is not E.164', () => {
        expect(phoneFromIdToken(token({ phone_number: '9876543210' }))).toBeNull();
        expect(phoneFromIdToken(token({ phone_number: 12345 }))).toBeNull();
    });
    it('null for a malformed token, never a throw', () => {
        expect(phoneFromIdToken('not-a-jwt')).toBeNull();
        expect(phoneFromIdToken('')).toBeNull();
    });
});

describe('backfillProfilePhone', () => {
    it('fills a blank phone', async () => {
        profiles().push({ id: 'u1', phone_number: null });
        expect(await backfillProfilePhone('u1', '+919876543210')).toBe(true);
        expect(profiles()[0].phone_number).toBe('+919876543210');
    });
    it('never overwrites a stored phone', async () => {
        profiles().push({ id: 'u1', phone_number: '+919800000001' });
        expect(await backfillProfilePhone('u1', '+919876543210')).toBe(false);
        expect(profiles()[0].phone_number).toBe('+919800000001');
    });
    it("touches only this owner's row", async () => {
        profiles().push({ id: 'u1', phone_number: null }, { id: 'u2', phone_number: null });
        await backfillProfilePhone('u1', '+919876543210');
        expect(profiles()[1].phone_number).toBeNull();
    });
});

describe('rememberVerifiedPhone', () => {
    it('fills the phone from the token', async () => {
        profiles().push({ id: 'u1', phone_number: null });
        await rememberVerifiedPhone('u1', token({ phone_number: '+919876543210' }));
        expect(profiles()[0].phone_number).toBe('+919876543210');
    });
    it('never throws: a database failure cannot cost a login, signup or payment', async () => {
        profiles().push({ id: 'u1', phone_number: null });
        holder.db.failNext = { table: 'profiles', op: 'update' };
        await expect(rememberVerifiedPhone('u1', token({ phone_number: '+919876543210' }))).resolves.toBeUndefined();
    });
});
