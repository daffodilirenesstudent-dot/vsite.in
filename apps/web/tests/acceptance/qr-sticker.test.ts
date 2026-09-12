import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QR_STICKER_PRICE_INR, QR_STICKER_LABEL, stickerOrderTotal, MAX_STICKER_QTY } from '@/lib/platform/hardware';

/**
 * The one piece of hardware vsite sells: an NFC + QR sticker at ₹30.
 *
 * It replaces the ₹99 NFC card outright. The card's price was written as a
 * bare `99` in five places — four in the QR page and once as `cardCount * 99`
 * in the route — which is exactly how the plan card came to advertise
 * "NFC card + QR stickers" as included while the QR page charged for them.
 * One exported constant now feeds every surface so they cannot drift again.
 *
 * This is a lead, not a checkout: the route emails the team and the owner is
 * contacted to arrange payment. Nothing here touches Razorpay.
 */

const WEB = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(WEB, 'src', p), 'utf8');

const QR_PAGE = 'app/manage/qr/page.tsx';
const ROUTE = 'app/api/manage/qr-card-request/route.ts';
const SUBSCRIPTION = 'app/manage/subscription/page.tsx';

describe('the sticker price has a single source of truth', () => {
    it('exports the price, the cap and a label', () => {
        expect(QR_STICKER_PRICE_INR).toBe(30);
        expect(MAX_STICKER_QTY).toBe(200);
        expect(QR_STICKER_LABEL.toLowerCase()).toContain('sticker');
    });

    it('prices an order as quantity × unit price', () => {
        expect(stickerOrderTotal(1)).toBe(30);
        expect(stickerOrderTotal(8)).toBe(240);
    });

    it('treats a missing or nonsense quantity as one sticker', () => {
        expect(stickerOrderTotal(0)).toBe(30);
        expect(stickerOrderTotal(-4)).toBe(30);
        expect(stickerOrderTotal(Number.NaN)).toBe(30);
        expect(stickerOrderTotal(2.7)).toBe(60); // floored to 2
    });

    it('caps an order at the stock ceiling rather than trusting the client', () => {
        expect(stickerOrderTotal(10_000)).toBe(MAX_STICKER_QTY * QR_STICKER_PRICE_INR);
    });

    it('is imported by both the page and the route, not retyped', () => {
        expect(read(QR_PAGE)).toMatch(/from '@\/lib\/platform\/hardware'/);
        expect(read(ROUTE)).toMatch(/from '@\/lib\/platform\/hardware'/);
    });
});

describe('the ₹99 card is gone from every owner surface', () => {
    it('never quotes ₹99 or prices anything "per card"', () => {
        for (const file of [QR_PAGE, ROUTE]) {
            expect(read(file), `${file} still quotes ₹99`).not.toMatch(/₹99\b/);
            expect(read(file), `${file} still says "per card"`).not.toMatch(/per card/i);
        }
    });

    it('does not multiply a hardcoded price in the route', () => {
        // The literal that made the route and the page disagree.
        expect(read(ROUTE)).not.toMatch(/\*\s*99\b/);
    });
});

describe('the plan sells software, not hardware', () => {
    it('no longer lists NFC hardware as included in ₹299', () => {
        const sub = read(SUBSCRIPTION);
        expect(sub).not.toMatch(/NFC card \+ QR stickers/);
    });
});
