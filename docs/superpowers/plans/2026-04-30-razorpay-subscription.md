# Razorpay Subscription Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock payment modal with real Razorpay Subscriptions for the Smart QR Menu plan (₹2,398 on day 1, ₹399/month auto-debit thereafter).

**Architecture:** Client calls `POST /api/subscription/create-subscription` (Firebase-authed) to get a Razorpay `subscription_id`, opens the Razorpay JS checkout popup, then polls for plan activation. All subscription state is written exclusively by the webhook handler at `POST /api/webhooks/razorpay`, which verifies HMAC-SHA256 signatures before touching the DB.

**Tech Stack:** Next.js 14 App Router, Razorpay Node SDK (`razorpay`), Razorpay Checkout JS (CDN), Supabase (service role), Firebase Auth, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/012_razorpay_subscription_id.sql` | Create | Adds `razorpay_subscription_id` + `razorpay_status` columns |
| `src/app/api/subscription/create-subscription/route.ts` | Create | Validates auth + ownership, creates Razorpay subscription, returns subscriptionId |
| `src/app/api/webhooks/razorpay/route.ts` | Create | Verifies HMAC signature, dispatches event → DB update |
| `src/app/manage/subscription/page.tsx` | Modify | Replaces mock modal with real Razorpay JS checkout + polling |
| `tests/api/routes.test.ts` | Modify | Adds test suites for create-subscription and webhook routes |

---

## Task 1: DB Migration — Add Razorpay columns to site_subscriptions

**Files:**
- Create: `supabase/migrations/012_razorpay_subscription_id.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/012_razorpay_subscription_id.sql`:

```sql
-- Migration 012: Add Razorpay subscription tracking columns
--
-- razorpay_subscription_id — links site to a Razorpay subscription object
-- razorpay_status          — mirrors Razorpay status (created/active/halted/cancelled)
-- Indexed for fast webhook lookups by subscription ID.

ALTER TABLE public.site_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_site_subs_razorpay_id
  ON public.site_subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

Run in Supabase dashboard SQL editor, or via CLI:
```bash
npx supabase db push
```

Expected: no errors, columns exist on `site_subscriptions`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_razorpay_subscription_id.sql
git commit -m "feat: add razorpay_subscription_id to site_subscriptions"
```

---

## Task 2: Install Razorpay SDK

**Files:** `package.json` (auto-modified)

- [ ] **Step 1: Install the package**

```bash
npm install razorpay
```

Expected: `razorpay` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Verify TypeScript types are available**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors about missing `razorpay` types (the package ships its own declarations).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install razorpay sdk"
```

---

## Task 3: create-subscription API route (TDD)

**Files:**
- Create: `src/app/api/subscription/create-subscription/route.ts`
- Modify: `tests/api/routes.test.ts`

### Step 1: Write failing tests

- [ ] **Add Razorpay mock and import to `tests/api/routes.test.ts`**

Add these blocks at the very top of the file (before existing `vi.mock` blocks), using `vi.hoisted` so the spy is accessible in tests:

```typescript
// Hoist the spy so it's accessible in test assertions
const mockSubscriptionsCreate = vi.hoisted(() => vi.fn());

// Mock Razorpay SDK
vi.mock('razorpay', () => {
  class MockRazorpay {
    subscriptions = { create: mockSubscriptionsCreate };
    constructor(_opts: unknown) {}
  }
  return { default: MockRazorpay };
});
```

Then add this import in the "Import after mocks" section:

```typescript
import { POST as createSubPost } from '@/app/api/subscription/create-subscription/route';
```

Then add this test suite at the end of the file:

```typescript
// ── 4. /api/subscription/create-subscription ─────────────────────────────────

describe('POST /api/subscription/create-subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
    process.env.RAZORPAY_PLAN_ID = 'plan_test123';
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = jsonRequest({ siteId: 'site-1' });
    const res = await createSubPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when token verification fails', async () => {
    mockVerify(null);
    const req = jsonRequest({ siteId: 'site-1' }, 'bad-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when siteId is missing', async () => {
    mockVerify('uid-1');
    const req = jsonRequest({}, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/siteId/i);
  });

  it('returns 404 when site does not belong to user', async () => {
    mockVerify('uid-1');
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });
    const req = jsonRequest({ siteId: 'site-x' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(404);
  });

  it('returns 409 when site already has an active subscription', async () => {
    mockVerify('uid-1');
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'site-1', name: 'Cafe' }, error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { store_expires_at: futureDate }, error: null }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });
    const req = jsonRequest({ siteId: 'site-1' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(409);
  });

  it('returns 200 with subscriptionId on success', async () => {
    mockVerify('uid-1');
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'site-1', name: 'Cafe' }, error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      return {} as any;
    });

    // Set up Razorpay mock to return a subscription
    mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_test123', status: 'created' });

    const req = jsonRequest({ siteId: 'site-1' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscriptionId).toBe('sub_test123');
    expect(body.keyId).toBe('rzp_test_key');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/api/routes.test.ts 2>&1 | tail -20
```

Expected: errors like `Cannot find module '@/app/api/subscription/create-subscription/route'`.

### Step 3: Implement the route

- [ ] **Create `src/app/api/subscription/create-subscription/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
    try {
        // ── Auth ────────────────────────────────────────────────────────────
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
        if (!userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // ── Rate limit ──────────────────────────────────────────────────────
        const rl = rateLimit(`create-sub:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
            );
        }

        // ── Parse body ──────────────────────────────────────────────────────
        let body: { siteId?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { siteId } = body;
        if (!siteId || typeof siteId !== 'string') {
            return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
        }

        // ── Verify site belongs to this user ────────────────────────────────
        const { data: site, error: siteError } = await supabaseServer
            .from('sites')
            .select('id, name')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── Check not already subscribed ────────────────────────────────────
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('store_expires_at')
            .eq('site_id', siteId)
            .single();

        if (existingSub?.store_expires_at) {
            const expiry = new Date(existingSub.store_expires_at).getTime();
            if (expiry > Date.now()) {
                return NextResponse.json(
                    { error: 'This store already has an active subscription.' },
                    { status: 409 }
                );
            }
        }

        // ── Create Razorpay subscription ────────────────────────────────────
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!,
        });

        const subscription = await razorpay.subscriptions.create({
            plan_id: process.env.RAZORPAY_PLAN_ID!,
            total_count: 120,
            quantity: 1,
            addons: [
                {
                    item: {
                        name: `Smart QR Menu — Setup Fee (${site.name})`,
                        amount: 199900,
                        currency: 'INR',
                    },
                },
            ],
        });

        // ── Save subscription ID to DB (status: created/pending) ─────────────
        await supabaseServer
            .from('site_subscriptions')
            .upsert(
                {
                    site_id: siteId,
                    user_id: userId,
                    store_plan: 'qr_menu',
                    razorpay_subscription_id: subscription.id,
                    razorpay_status: 'created',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'site_id' }
            );

        return NextResponse.json({
            subscriptionId: subscription.id,
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error('[create-subscription] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npx vitest run tests/api/routes.test.ts 2>&1 | tail -20
```

Expected: all tests in the `POST /api/subscription/create-subscription` describe block PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/subscription/create-subscription/route.ts tests/api/routes.test.ts
git commit -m "feat: add create-subscription API route with Razorpay"
```

---

## Task 4: Razorpay Webhook Handler (TDD)

**Files:**
- Create: `src/app/api/webhooks/razorpay/route.ts`
- Modify: `tests/api/routes.test.ts`

### Step 1: Write failing tests

- [ ] **Add webhook import and test suite to `tests/api/routes.test.ts`**

Add this import in the "Import after mocks" section:

```typescript
import { POST as razorpayWebhook } from '@/app/api/webhooks/razorpay/route';
```

Add this helper function near the top of the file (after `jsonRequest`):

```typescript
import crypto from 'crypto';

function webhookRequest(body: unknown, secret: string): NextRequest {
  const rawBody = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return new NextRequest(new URL('http://localhost/api/webhooks/razorpay'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sig,
    },
    body: rawBody,
  });
}
```

Add this test suite at the end of the file:

```typescript
// ── 5. /api/webhooks/razorpay ─────────────────────────────────────────────────

describe('POST /api/webhooks/razorpay', () => {
  const WEBHOOK_SECRET = 'test_webhook_secret';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it('returns 400 when signature is missing', async () => {
    const req = new NextRequest(new URL('http://localhost/api/webhooks/razorpay'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'subscription.activated' }),
    });
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signature is invalid', async () => {
    const req = new NextRequest(new URL('http://localhost/api/webhooks/razorpay'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'bad_signature',
      },
      body: JSON.stringify({ event: 'subscription.activated' }),
    });
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 on subscription.activated and activates site in DB', async () => {
    const payload = {
      event: 'subscription.activated',
      payload: {
        subscription: { entity: { id: 'sub_abc', status: 'active' } },
        payment: { entity: { id: 'pay_123', amount: 239800, currency: 'INR' } },
      },
    };

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { site_id: 'site-1', user_id: 'uid-1' },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      if (table === 'billing_history') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
      }
      return {} as any;
    });

    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 on subscription.charged and extends expiry', async () => {
    const payload = {
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_abc', status: 'active' } },
        payment: { entity: { id: 'pay_456', amount: 39900, currency: 'INR' } },
      },
    };

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { site_id: 'site-1', user_id: 'uid-1' },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      if (table === 'billing_history') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
      }
      return {} as any;
    });

    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 on subscription.halted and clears expiry', async () => {
    const payload = {
      event: 'subscription.halted',
      payload: {
        subscription: { entity: { id: 'sub_abc', status: 'halted' } },
      },
    };

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { site_id: 'site-1', user_id: 'uid-1' },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      return {} as any;
    });

    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 on unknown events (idempotent)', async () => {
    const payload = { event: 'payment.captured', payload: {} };
    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/api/routes.test.ts 2>&1 | tail -20
```

Expected: errors like `Cannot find module '@/app/api/webhooks/razorpay/route'`.

### Step 3: Implement the webhook handler

- [ ] **Create `src/app/api/webhooks/razorpay/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';

// Razorpay retries on non-2xx. Always return 200 after signature check.
// Only 400 for invalid signatures (stop retrying garbage requests).

type WebhookEvent = {
    event: string;
    payload: {
        subscription: { entity: { id: string; status: string } };
        payment?: { entity: { id: string; amount: number; currency: string } };
    };
};

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature;
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature') ?? '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

    if (!signature || !verifySignature(rawBody, signature, secret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    let event: WebhookEvent;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ ok: true }); // malformed JSON after valid sig — ignore
    }

    const subscriptionId = event.payload?.subscription?.entity?.id;
    const paymentEntity = event.payload?.payment?.entity;

    switch (event.event) {
        case 'subscription.activated':
            await handleActivated(subscriptionId, paymentEntity);
            break;
        case 'subscription.charged':
            await handleCharged(subscriptionId, paymentEntity);
            break;
        case 'subscription.halted':
        case 'subscription.cancelled':
            await handleDeactivated(subscriptionId, event.event);
            break;
        default:
            // Unknown event — log and return 200 so Razorpay stops retrying
            console.log(`[razorpay-webhook] unhandled event: ${event.event}`);
    }

    return NextResponse.json({ ok: true });
}

async function findSiteBySubscriptionId(subscriptionId: string) {
    const { data, error } = await supabaseServer
        .from('site_subscriptions')
        .select('site_id, user_id')
        .eq('razorpay_subscription_id', subscriptionId)
        .single();

    if (error || !data) {
        console.error('[razorpay-webhook] site not found for subscription:', subscriptionId);
        return null;
    }
    return data;
}

async function handleActivated(
    subscriptionId: string,
    payment?: { id: string; amount: number; currency: string }
) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_plan: 'qr_menu',
            store_expires_at: expiresAt,
            razorpay_subscription_id: subscriptionId,
            razorpay_status: 'active',
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );

    if (payment) {
        await supabaseServer.from('billing_history').insert({
            user_id: site.user_id,
            plan_name: 'Smart QR Menu — Setup + First Month',
            amount: Math.round(payment.amount / 100), // paise → rupees
            currency: payment.currency,
            status: 'Success',
            razorpay_payment_id: payment.id,
        });
    }
}

async function handleCharged(
    subscriptionId: string,
    payment?: { id: string; amount: number; currency: string }
) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_expires_at: expiresAt,
            razorpay_subscription_id: subscriptionId,
            razorpay_status: 'active',
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );

    if (payment) {
        await supabaseServer.from('billing_history').insert({
            user_id: site.user_id,
            plan_name: 'Smart QR Menu — Monthly Renewal',
            amount: Math.round(payment.amount / 100),
            currency: payment.currency,
            status: 'Success',
            razorpay_payment_id: payment.id,
        });
    }
}

async function handleDeactivated(subscriptionId: string, eventName: string) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    const status = eventName === 'subscription.halted' ? 'halted' : 'cancelled';

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_expires_at: null,
            razorpay_subscription_id: subscriptionId,
            razorpay_status: status,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );
}
```

- [ ] **Step 4: Run all tests — all should pass**

```bash
npx vitest run tests/api/routes.test.ts 2>&1 | tail -30
```

Expected: all tests PASS (no failures).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/razorpay/route.ts tests/api/routes.test.ts
git commit -m "feat: add Razorpay webhook handler"
```

---

## Task 5: Update Subscription Page — Replace Mock with Real Checkout

**Files:**
- Modify: `src/app/manage/subscription/page.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire `src/app/manage/subscription/page.tsx` with the following. Key changes:
- `PaymentState` gains `'creating' | 'activating' | 'slow'` states, removes the mock state
- `handleConfirmPayment` replaced by `handleActivate`
- Modal body replaces mock form with a real "Pay ₹2,398 & Activate" button
- Razorpay script loaded on demand
- Polling on plan activation after checkout

```typescript
'use client';

import React, { useState, useRef } from 'react';
import { useAuth } from '@/components/AuthContext';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/firebase';

const SETUP_FEE = 1999;
const QR_MENU_MONTHLY = 399;
const QR_ORDERING_MONTHLY = 799;

type ModalType = 'payment' | 'coming_soon' | null;
type PaymentState = 'idle' | 'creating' | 'activating' | 'slow' | 'success' | 'failed';

const QR_MENU_FEATURES = [
    'Clean digital menu (no printing needed)',
    'AI-generated food images',
    'Edit menu anytime from dashboard',
    'Highlight offers & sold-out items live',
    'Works for dine-in & takeaway',
    'NFC card + QR stickers',
    'Shareable QR code link',
];

const QR_ORDERING_FEATURES = [
    'Everything in Smart QR Menu, plus —',
    'Customers order directly from phone',
    'Accept UPI, GPay, PhonePe & cash',
    'Live kitchen notifications',
    'Automatic billing — no manual work',
    'Smart queue for rush hours',
    'Full transaction history',
];

declare global {
    interface Window {
        Razorpay: new (options: Record<string, unknown>) => { open(): void };
    }
}

function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return; }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export default function SubscriptionPage() {
    const { user } = useAuth();
    const { activeSite, sitesLoading } = useSite();
    const { isTrialActive, trialDaysLeft, isTrialExpired, planLoading, refreshPlan } = usePlan();
    const [modalType, setModalType] = useState<ModalType>(null);
    const [paymentState, setPaymentState] = useState<PaymentState>('idle');
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const sub = activeSite?.site_subscriptions ?? null;

    const isQrMenuActive = (() => {
        if (!sub?.store_expires_at) return false;
        return sub.store_plan === 'qr_menu' && new Date(sub.store_expires_at).getTime() > Date.now();
    })();

    const expiryLabel = sub?.store_expires_at
        ? new Date(sub.store_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

    const stopPolling = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const startPolling = () => {
        let attempts = 0;
        const MAX_ATTEMPTS = 15; // 30 seconds at 2s intervals

        pollingRef.current = setInterval(async () => {
            attempts += 1;
            await refreshPlan();

            // refreshPlan updates the context; check the re-rendered state via the sub ref
            // The component will re-render and isQrMenuActive will become true
            if (attempts >= MAX_ATTEMPTS) {
                stopPolling();
                setPaymentState('slow');
            }
        }, 2000);
    };

    // Watch for plan activation during polling
    React.useEffect(() => {
        if (paymentState === 'activating' && isQrMenuActive) {
            stopPolling();
            setPaymentState('success');
            setTimeout(() => {
                setModalType(null);
                setPaymentState('idle');
            }, 2500);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isQrMenuActive, paymentState]);

    // Cleanup on unmount
    React.useEffect(() => () => stopPolling(), []);

    const openPayment = () => {
        if (isQrMenuActive) return;
        setModalType('payment');
        setPaymentState('idle');
    };

    const closeModal = () => {
        if (paymentState === 'creating' || paymentState === 'activating') return;
        stopPolling();
        setModalType(null);
        setPaymentState('idle');
    };

    const handleActivate = async () => {
        if (!user || !activeSite || paymentState !== 'idle') return;
        setPaymentState('creating');

        try {
            const firebaseUser = firebaseAuth.currentUser;
            if (!firebaseUser) { setPaymentState('failed'); return; }
            const token = await firebaseUser.getIdToken();

            const res = await fetch('/api/subscription/create-subscription', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ siteId: activeSite.id }),
            });

            const data = await res.json();

            if (!res.ok) {
                console.error('[subscription] create-subscription failed:', data);
                setPaymentState('failed');
                return;
            }

            const loaded = await loadRazorpayScript();
            if (!loaded) {
                setPaymentState('failed');
                return;
            }

            const rzp = new window.Razorpay({
                key: data.keyId,
                subscription_id: data.subscriptionId,
                name: 'vsite',
                description: 'Smart QR Menu — ₹399/month',
                prefill: {
                    name: user.displayName ?? '',
                    contact: user.phoneNumber ?? '',
                },
                theme: { color: '#5452F6' },
                handler: () => {
                    setPaymentState('activating');
                    startPolling();
                },
                modal: {
                    ondismiss: () => {
                        // Only reset if we haven't already moved past 'creating'
                        setPaymentState((prev) => (prev === 'creating' ? 'idle' : prev));
                    },
                },
            });

            rzp.open();
        } catch (err) {
            console.error('[subscription] handleActivate error:', err);
            setPaymentState('failed');
        }
    };

    const isDataLoading = sitesLoading || planLoading;
    const isProcessing = paymentState === 'creating' || paymentState === 'activating';

    return (
        <div className="px-4 md:px-8 py-6 md:py-8 max-w-3xl">

            {/* Header */}
            <div className="mb-6">
                <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 30, lineHeight: '36px' }}>
                    Subscription
                </h1>
                <p className="text-[#52525C] mt-1" style={{ fontSize: 16, lineHeight: '24px' }}>
                    Manage your plan
                </p>
            </div>

            {/* Trial / Plan status card */}
            {!isDataLoading && (
                <div
                    style={{
                        borderRadius: 14,
                        padding: '16px 20px',
                        marginBottom: 24,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        background: isTrialExpired
                            ? '#FEF2F2'
                            : isQrMenuActive
                                ? '#F0FDF4'
                                : '#EEF2FF',
                        border: `1px solid ${isTrialExpired ? '#FECACA' : isQrMenuActive ? '#BBF7D0' : '#C7D2FE'}`,
                    }}
                >
                    <div
                        style={{
                            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isTrialExpired ? '#FEE2E2' : isQrMenuActive ? '#DCFCE7' : '#E0E7FF',
                        }}
                    >
                        <span
                            className="material-symbols-outlined"
                            style={{
                                fontSize: 22,
                                fontVariationSettings: "'FILL' 1",
                                color: isTrialExpired ? '#DC2626' : isQrMenuActive ? '#16A34A' : '#4338CA',
                            }}
                        >
                            {isTrialExpired ? 'error' : isQrMenuActive ? 'verified' : 'schedule'}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        {isTrialExpired && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#DC2626' }}>Free trial ended</p>
                                <p style={{ fontSize: 13, color: '#7F1D1D', marginTop: 2 }}>
                                    Your menu is offline. Activate a plan below to go live again.
                                </p>
                            </>
                        )}
                        {isTrialActive && !isQrMenuActive && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#4338CA' }}>
                                    Free trial — {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} remaining
                                </p>
                                <p style={{ fontSize: 13, color: '#3730A3', marginTop: 2 }}>
                                    Activate a plan before your trial ends to keep your menu live.
                                </p>
                            </>
                        )}
                        {isQrMenuActive && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#166534' }}>Smart QR Menu — Active</p>
                                <p style={{ fontSize: 13, color: '#14532D', marginTop: 2 }}>
                                    {expiryLabel ? `Renews on ${expiryLabel}` : 'Subscription active'}
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Skeleton */}
            {isDataLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[0, 1].map(i => (
                        <div key={i} className="skeleton" style={{ height: 420, borderRadius: 14 }} />
                    ))}
                </div>
            )}

            {/* Plan cards */}
            {!isDataLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Smart QR Menu */}
                    <div
                        style={{
                            background: '#FFFFFF',
                            border: isQrMenuActive ? '2px solid #16A34A' : '1px solid #E4E4E7',
                            borderRadius: 16,
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                        }}
                    >
                        {isQrMenuActive && (
                            <div style={{ position: 'absolute', top: -1, right: 16, background: '#16A34A', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: '0 0 8px 8px' }}>
                                ACTIVE
                            </div>
                        )}
                        <div style={{ marginBottom: 16 }}>
                            <span style={{ display: 'inline-block', border: '1px solid #16A34A', color: '#16A34A', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 9999, marginBottom: 12 }}>
                                Smart QR Menu
                            </span>
                            <div className="flex items-baseline gap-1 mb-3">
                                <span style={{ fontSize: 30, fontWeight: 800, color: '#0A0A0A', lineHeight: 1 }}>₹{QR_MENU_MONTHLY}</span>
                                <span style={{ fontSize: 14, color: '#71717A' }}>/month</span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F4F4F5', border: '1px solid #E4E4E7', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#52525C' }}>
                                <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 14 }}>info</span>
                                One-time setup fee: <span style={{ fontWeight: 700, color: '#0A0A0A', marginLeft: 2 }}>₹{SETUP_FEE.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <div style={{ flex: 1, marginBottom: 20 }}>
                            {QR_MENU_FEATURES.map(f => (
                                <div key={f} className="flex items-start gap-2" style={{ marginBottom: 9 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#16A34A', flexShrink: 0, marginTop: 1, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                    <span style={{ fontSize: 13, color: '#3F3F46', lineHeight: '18px' }}>{f}</span>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={openPayment}
                            disabled={isQrMenuActive}
                            style={{
                                width: '100%', height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                                border: isQrMenuActive ? 'none' : '2px solid #16A34A',
                                background: isQrMenuActive ? '#F0FDF4' : 'transparent',
                                color: '#16A34A',
                                cursor: isQrMenuActive ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!isQrMenuActive) (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4'; }}
                            onMouseLeave={e => { if (!isQrMenuActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                            {isQrMenuActive ? 'Current Plan' : `Activate — ₹${QR_MENU_MONTHLY}/mo`}
                        </button>
                    </div>

                    {/* QR Ordering + Payment — Coming Soon */}
                    <div style={{ background: 'linear-gradient(145deg, #5137EF 0%, #7C3AED 100%)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 9999, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>schedule</span>
                            Coming Soon
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <span style={{ display: 'inline-block', border: '1px solid rgba(255,255,255,0.5)', color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 9999, marginBottom: 12 }}>
                                QR Ordering + Payment
                            </span>
                            <div className="flex items-baseline gap-1 mb-3" style={{ marginTop: 4 }}>
                                <span style={{ fontSize: 30, fontWeight: 800, color: '#FFFFFF', lineHeight: 1 }}>₹{QR_ORDERING_MONTHLY}</span>
                                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>/month</span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>info</span>
                                One-time setup fee: <span style={{ fontWeight: 700, color: '#FFFFFF', marginLeft: 2 }}>₹{SETUP_FEE.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <div style={{ flex: 1, marginBottom: 20 }}>
                            {QR_ORDERING_FEATURES.map((f, i) => (
                                <div key={f} className="flex items-start gap-2" style={{ marginBottom: 9 }}>
                                    {i === 0 ? (
                                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: '18px', fontWeight: 600 }}>{f}</span>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', flexShrink: 0, marginTop: 1, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: '18px' }}>{f}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setModalType('coming_soon')}
                            style={{ width: '100%', height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, border: '2px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>notifications</span>
                            Notify Me When Available
                        </button>
                    </div>
                </div>
            )}

            <p className="mt-5 text-center text-[#71717A]" style={{ fontSize: 12 }}>
                All payments are processed securely by Razorpay. Plans renew monthly. Cancel anytime.
            </p>

            {/* ── Payment modal ── */}
            {modalType === 'payment' && (
                <div
                    className="fixed inset-0 flex items-end md:items-center justify-center"
                    style={{ zIndex: 80, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
                    onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div
                        style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 460, padding: '28px 24px 36px' }}
                        className="md:rounded-2xl md:mx-4"
                    >
                        {paymentState === 'success' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#16A34A', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Plan Activated!</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Your Smart QR Menu is now live. ₹399/month will auto-debit every 30 days.</p>
                                </div>
                            </div>
                        ) : paymentState === 'slow' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#CA8A04', fontVariationSettings: "'FILL' 1" }}>schedule</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Payment Received</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Your payment was successful. Your plan is activating — this may take a minute. Refresh the page shortly.</p>
                                </div>
                                <button
                                    onClick={() => { setModalType(null); setPaymentState('idle'); }}
                                    style={{ width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600, border: 'none', background: '#0A0A0A', color: '#FFFFFF', cursor: 'pointer' }}
                                >
                                    Got it
                                </button>
                            </div>
                        ) : paymentState === 'failed' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#DC2626', fontVariationSettings: "'FILL' 1" }}>cancel</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Something went wrong</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Please try again. If the issue persists, contact support.</p>
                                </div>
                                <button
                                    onClick={() => setPaymentState('idle')}
                                    style={{ width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600, border: 'none', background: '#0A0A0A', color: '#FFFFFF', cursor: 'pointer' }}
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Modal header */}
                                <div className="flex items-start justify-between mb-5">
                                    <div>
                                        <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, lineHeight: '24px' }}>Activate Smart QR Menu</p>
                                        <p className="text-[#52525C]" style={{ fontSize: 13, marginTop: 2 }}>
                                            {activeSite ? <>For store: <span className="font-semibold text-[#0A0A0A]">{activeSite.name}</span></> : 'Review your order'}
                                        </p>
                                    </div>
                                    {!isProcessing && (
                                        <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                            <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 20 }}>close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Order summary */}
                                <div style={{ background: '#F8F7FF', border: '1px solid #E4E4E7', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>Smart QR Menu</p>
                                    <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                                        <span style={{ fontSize: 13, color: '#52525C' }}>Setup fee (one-time)</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{SETUP_FEE.toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                                        <span style={{ fontSize: 13, color: '#52525C' }}>First month</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{QR_MENU_MONTHLY}</span>
                                    </div>
                                    <div style={{ borderTop: '1px dashed #E4E4E7', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>Due today</span>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: '#16A34A' }}>₹{(SETUP_FEE + QR_MENU_MONTHLY).toLocaleString('en-IN')}</span>
                                    </div>
                                    <p style={{ fontSize: 11, color: '#71717A', marginTop: 8 }}>
                                        Then ₹{QR_MENU_MONTHLY}/month auto-debit — cancel anytime.
                                    </p>
                                </div>

                                {/* CTA */}
                                <button
                                    onClick={handleActivate}
                                    disabled={isProcessing}
                                    style={{
                                        width: '100%', height: 52, borderRadius: 10,
                                        fontSize: 15, fontWeight: 700, border: 'none',
                                        background: isProcessing ? '#6B7280' : '#16A34A',
                                        color: '#FFFFFF',
                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    {isProcessing ? (
                                        <>
                                            <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                                            <span>{paymentState === 'activating' ? 'Activating your plan...' : 'Opening checkout...'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>lock</span>
                                            Pay ₹{(SETUP_FEE + QR_MENU_MONTHLY).toLocaleString('en-IN')} & Activate
                                        </>
                                    )}
                                </button>

                                <div className="flex items-center justify-center gap-2 mt-3">
                                    <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 13 }}>lock</span>
                                    <p style={{ fontSize: 11, color: '#71717A' }}>Secured by Razorpay. UPI, cards & netbanking accepted.</p>
                                </div>

                                {!isProcessing && (
                                    <button
                                        onClick={closeModal}
                                        style={{ width: '100%', height: 40, borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid #E4E4E7', background: '#FFFFFF', color: '#52525C', cursor: 'pointer', marginTop: 8 }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Coming Soon modal — unchanged ── */}
            {modalType === 'coming_soon' && (
                <div
                    className="fixed inset-0 flex items-end md:items-center justify-center"
                    style={{ zIndex: 80, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
                    onClick={e => { if (e.target === e.currentTarget) setModalType(null); }}
                >
                    <div style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 440, padding: '28px 24px 36px' }} className="md:rounded-2xl md:mx-4">
                        <div className="flex items-start justify-between mb-5">
                            <div />
                            <button onClick={() => setModalType(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 20 }}>close</span>
                            </button>
                        </div>
                        <div className="flex flex-col items-center text-center gap-4 pb-4">
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #EEF2FF 0%, #EDE9FE 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 30, color: '#5137EF', fontVariationSettings: "'FILL' 1" }}>schedule</span>
                            </div>
                            <div>
                                <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 20, marginBottom: 8 }}>Coming Soon</p>
                                <p className="text-[#52525C]" style={{ fontSize: 14, lineHeight: '22px', maxWidth: 320 }}>
                                    QR Ordering + Payment is under active development. Customers will order and pay directly from their phones — fully integrated with your kitchen.
                                </p>
                            </div>
                            <div style={{ width: '100%', background: '#F4F4F5', borderRadius: 12, padding: '14px 16px', textAlign: 'left' }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#0A0A0A', marginBottom: 8 }}>What&apos;s included at launch:</p>
                                {['Customer ordering from phone', 'UPI / GPay / PhonePe payments', 'Live kitchen notifications', 'Automatic billing'].map(f => (
                                    <div key={f} className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#5137EF', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                        <span style={{ fontSize: 13, color: '#3F3F46' }}>{f}</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => setModalType(null)}
                                style={{ width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600, border: 'none', background: 'linear-gradient(90deg, #5137EF 0%, #7C3AED 100%)', color: '#FFFFFF', cursor: 'pointer' }}
                            >
                                Got it — I&apos;ll wait
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run tests/api/routes.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/manage/subscription/page.tsx
git commit -m "feat: replace mock payment with Razorpay Subscriptions checkout"
```

---

## Task 6: Add billing_history column for razorpay_payment_id

The webhook inserts `razorpay_payment_id` into `billing_history`. Add that column.

**Files:**
- Create: `supabase/migrations/013_billing_history_razorpay_payment_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 013: Add razorpay_payment_id to billing_history
-- Used to deduplicate webhook events and for audit trail.

ALTER TABLE public.billing_history
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_billing_history_razorpay_payment_id
  ON public.billing_history (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

Run in Supabase dashboard SQL editor, or:
```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_billing_history_razorpay_payment_id.sql
git commit -m "feat: add razorpay_payment_id to billing_history"
```

---

## Task 7: Add .env.local keys (user action — not automated)

- [ ] **Step 1: Add these keys to `.env.local`**

```bash
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_PLAN_ID=plan_...
RAZORPAY_WEBHOOK_SECRET=...
```

- [ ] **Step 2: Create the Razorpay Plan in the Razorpay dashboard**

1. Go to Razorpay Dashboard → Subscriptions → Plans → Create Plan
2. Set: Period = `monthly`, Interval = `1`, Amount = `39900` (paise), Currency = `INR`, Name = `Smart QR Menu`
3. Copy the `plan_xxx` ID → paste into `RAZORPAY_PLAN_ID`

- [ ] **Step 3: Register the webhook in the Razorpay dashboard**

1. Go to Razorpay Dashboard → Settings → Webhooks → Add New Webhook
2. Webhook URL: `https://vsite.in/api/webhooks/razorpay`
3. Secret: paste your webhook secret → save to `RAZORPAY_WEBHOOK_SECRET`
4. Events to subscribe: `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`

---

## Webhook Endpoint

```
POST https://vsite.in/api/webhooks/razorpay
```

Register this URL in the Razorpay Dashboard under Settings → Webhooks.
