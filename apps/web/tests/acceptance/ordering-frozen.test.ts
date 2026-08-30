import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * vsite takes no orders, by any route.
 *
 * The product is the Smart QR Menu: a customer scans, reads the menu, and
 * orders from a member of staff exactly as they always have. Nothing on the
 * platform accepts an order — not the in-app cart, not the counter/token
 * flow, and not WhatsApp order-taking.
 *
 * `ORDERING_FROZEN` in @/lib/platform/productFlags is the single switch. This
 * suite is the tripwire that keeps every path behind it, so that re-enabling
 * ordering is a deliberate act (flip the flag, watch these fail) rather than
 * something that leaks back in through one ungated handler.
 *
 * NOT frozen, deliberately: `subscription/verify-payment` is how restaurant
 * owners pay for the plan. Freezing it would stop revenue, not ordering.
 */

const WEB = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(WEB, 'src', p), 'utf8');

/** Every handler that could create, advance, bill or settle a customer order. */
const ORDER_TAKING_ROUTES = [
    'app/api/orders/route.ts',
    'app/api/orders/[id]/route.ts',
    'app/api/orders/[id]/verify-payment/route.ts',
    'app/api/orders/finalize-payment/route.ts',
    'app/api/orders/whatsapp/route.ts',
    'app/api/bill-request/route.ts',
    'app/api/manage/orders/route.ts',
    'app/api/manage/orders/[id]/kot/route.ts',
    'app/api/manage/bill-requests/route.ts',
    'app/api/manage/bill-requests/[id]/route.ts',
    'app/api/manage/table-checkout/route.ts',
    'app/api/manage/sites/[siteId]/whatsapp-orders/route.ts',
    'app/api/shop/payment-options/route.ts',
];

describe('no order-taking route is reachable while frozen', () => {
    it.each(ORDER_TAKING_ROUTES)('%s is gated on ORDERING_FROZEN', (route) => {
        const code = src(route);
        expect(code, `${route} does not import the freeze flag`).toMatch(/ORDERING_FROZEN/);
        expect(code, `${route} imports the flag but never returns frozenResponse`).toMatch(
            /if \(ORDERING_FROZEN\) return frozenResponse\(\)/,
        );
    });
});

describe('the revenue path stays open', () => {
    it('subscription/verify-payment is NOT frozen', () => {
        // Owners paying ₹299 for the Smart QR Menu must always get through.
        expect(src('app/api/subscription/verify-payment/route.ts')).not.toMatch(/ORDERING_FROZEN/);
    });

    it('order status stays readable', () => {
        // Read-only, creates nothing. Signed email links to pre-freeze orders
        // must keep resolving.
        expect(src('app/api/orders/[id]/status/route.ts')).not.toMatch(/frozenResponse/);
    });
});

describe('WhatsApp order-taking cannot render', () => {
    it('the public menu gates whatsappMode on the freeze flag directly', () => {
        // It was gated only by `tier === 'order_no_pay'`, which normalizePlan
        // already makes unreachable. That is correct but indirect — one edit to
        // the tier logic would silently re-expose it, so the flag is named here.
        const template = src('components/templates/QRMenuTemplate.tsx');
        const uses = template.match(/whatsappMode=\{[^}]*\}/g) ?? [];
        expect(uses.length).toBeGreaterThan(0);
        for (const use of uses) {
            expect(use, `whatsappMode not gated on the freeze flag: ${use}`).toMatch(
                /!ORDERING_FROZEN/,
            );
        }
    });

    it('the owner cannot switch it on from settings', () => {
        // Gated via usePlan() -> normalizePlan, which collapses qr_order into
        // qr_menu while frozen, so `isQrOrder` is always false.
        const settings = src('app/manage/settings/page.tsx');
        expect(settings).toMatch(/activeTab === 'orders' && isQrOrder/);
        expect(src('components/PlanContext.tsx')).toMatch(
            /const plan: Plan\s*=\s*normalizePlan\(/,
        );
    });
});
