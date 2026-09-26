import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

/**
 * QR print kit — first pass of the QR page UX work (owner-approved 2026-09-24).
 *
 * Measured on the current page before this change:
 *   - the poster preview is 897 px tall, so "Download PDF" sat 370 px below the
 *     fold on a laptop and behind the bottom nav on a phone;
 *   - "Download PDF" saved a PNG;
 *   - the artwork is 1181×1654 px at 300 dpi — about A6 — and was the only
 *     size offered, so an owner printing on A4 got a 140 dpi upscale;
 *   - there was no way to copy or share the menu link.
 *
 * Research the numbers below come from:
 *   - 10:1 rule: a QR scans from about ten times its own width; add 20–30 %
 *     for real conditions (QRLynx, Uniqode, Tabres print guides).
 *   - Print shops want the exact size plus 3 mm bleed, no crop marks
 *     (Tradeprint table-tent spec). Home printers cannot print to the edge,
 *     so home sheets keep a margin and carry cut lines.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const read = (p: string) => (existsSync(join(SRC, p)) ? readFileSync(join(SRC, p), 'utf8') : '');
/** Shipped code only; a block comment starts after whitespace or `{` so `image/*` is not one. */
const shipped = (p: string) => read(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

const PAGE = 'app/manage/qr/page.tsx';
const PANEL = 'components/manage/MenuQrPanel.tsx';

const MM_TO_PT = 72 / 25.4;
/** 1×1 PNG: enough for jsPDF to embed and count. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

/** A real w×h RGB PNG of one colour, as a data URL (no image library needed). */
function solidPng(w: number, h: number): string {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type: string, data: Buffer) => {
        const t = Buffer.from(type, 'ascii');
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([t, data])));
        return Buffer.concat([len, t, data, sum]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
    const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x51)]);
    const idat = deflateSync(Buffer.concat(Array.from({ length: h }, () => row)));
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
    ]);
    return `data:image/png;base64,${png.toString('base64')}`;
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

const kit = () => import('@/lib/qr/printKit');

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — flag
// ─────────────────────────────────────────────────────────────────────────────

describe('AC1: flag', () => {
    it('is OFF when the env var is missing', async () => {
        vi.stubEnv('NEXT_PUBLIC_QR_PRINT_KIT', '');
        expect((await kit()).QR_PRINT_KIT).toBe(false);
    });

    it('is ON only for "true"', async () => {
        vi.stubEnv('NEXT_PUBLIC_QR_PRINT_KIT', 'yes');
        expect((await kit()).QR_PRINT_KIT).toBe(false);
        vi.resetModules();
        vi.stubEnv('NEXT_PUBLIC_QR_PRINT_KIT', 'true');
        expect((await kit()).QR_PRINT_KIT).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 — placements
// ─────────────────────────────────────────────────────────────────────────────

describe('AC2: the owner picks where it goes, not a paper size', () => {
    it('offers table stand, counter, wall or door — in that order', async () => {
        const { PLACEMENT_ORDER, PLACEMENTS } = await kit();
        expect([...PLACEMENT_ORDER]).toEqual(['table', 'counter', 'wall']);
        expect(PLACEMENTS.table.label).toBe('Table stand');
        expect(PLACEMENTS.counter.label).toBe('Counter');
        expect(PLACEMENTS.wall.label).toBe('Wall or door');
    });

    it('maps them to A6, A5 and A4', async () => {
        const { PLACEMENTS } = await kit();
        expect(PLACEMENTS.table).toMatchObject({ paper: 'A6', trimMm: { w: 105, h: 148 } });
        expect(PLACEMENTS.counter).toMatchObject({ paper: 'A5', trimMm: { w: 148, h: 210 } });
        expect(PLACEMENTS.wall).toMatchObject({ paper: 'A4', trimMm: { w: 210, h: 297 } });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 / AC4 — layouts
// ─────────────────────────────────────────────────────────────────────────────

describe('AC3: print-shop file', () => {
    it('is the paper size plus 3 mm bleed on every side, one poster covering it', async () => {
        const { printLayout, BLEED_MM } = await kit();
        expect(BLEED_MM).toBe(3);
        const l = printLayout('table', 'shop');
        expect(l.pageMm).toEqual({ w: 111, h: 154 });
        expect(l.cards).toEqual([{ x: 0, y: 0, w: 111, h: 154 }]);
        expect(l.trimMm).toEqual({ w: 105, h: 148 });
        expect(l.cutLines).toEqual([]);
    });

    it('does the same for A4', async () => {
        const { printLayout } = await kit();
        expect(printLayout('wall', 'shop').pageMm).toEqual({ w: 216, h: 303 });
    });
});

describe('AC4: home-printer file', () => {
    const inside = (c: { x: number; y: number; w: number; h: number }, page: { w: number; h: number }, m: number) =>
        c.x >= m - 1e-9 && c.y >= m - 1e-9 && c.x + c.w <= page.w - m + 1e-9 && c.y + c.h <= page.h - m + 1e-9;

    it('puts four table stands on one A4 sheet', async () => {
        const { printLayout, HOME_MARGIN_MM } = await kit();
        const l = printLayout('table', 'home');
        expect(l.pageMm).toEqual({ w: 210, h: 297 });
        expect(l.orientation).toBe('portrait');
        expect(l.cards).toHaveLength(4);
        for (const c of l.cards) expect(inside(c, l.pageMm, HOME_MARGIN_MM)).toBe(true);
    });

    it('puts two counter cards side by side on a landscape A4', async () => {
        const { printLayout, HOME_MARGIN_MM } = await kit();
        const l = printLayout('counter', 'home');
        expect(l.pageMm).toEqual({ w: 297, h: 210 });
        expect(l.orientation).toBe('landscape');
        expect(l.cards).toHaveLength(2);
        for (const c of l.cards) expect(inside(c, l.pageMm, HOME_MARGIN_MM)).toBe(true);
    });

    it('puts one wall poster on an A4, shrunk just enough for the margin', async () => {
        const { printLayout, HOME_MARGIN_MM } = await kit();
        const l = printLayout('wall', 'home');
        expect(l.cards).toHaveLength(1);
        expect(inside(l.cards[0], l.pageMm, HOME_MARGIN_MM)).toBe(true);
        expect(l.trimMm.w).toBeGreaterThan(190);
    });

    it('keeps the paper\'s shape and never overlaps cards', async () => {
        const { printLayout, PLACEMENTS } = await kit();
        for (const p of ['table', 'counter', 'wall'] as const) {
            const l = printLayout(p, 'home');
            const ratio = PLACEMENTS[p].trimMm.h / PLACEMENTS[p].trimMm.w;
            for (const c of l.cards) expect(c.h / c.w).toBeCloseTo(ratio, 5);
            for (let i = 0; i < l.cards.length; i++) {
                for (let j = i + 1; j < l.cards.length; j++) {
                    const a = l.cards[i], b = l.cards[j];
                    const overlap = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
                    expect(overlap).toBe(false);
                }
            }
        }
    });

    it('draws cut lines', async () => {
        const { printLayout } = await kit();
        expect(printLayout('table', 'home').cutLines.length).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 — a real PDF
// ─────────────────────────────────────────────────────────────────────────────

describe('AC5: "Download PDF" makes a PDF', () => {
    const inspect = (buf: ArrayBuffer) => {
        const text = new TextDecoder('latin1').decode(buf);
        const box = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
        return {
            isPdf: text.startsWith('%PDF'),
            wPt: Number(box?.[1]), hPt: Number(box?.[2]),
            draws: (text.match(/\/I\d+ Do/g) ?? []).length,
        };
    };

    it('is the print-shop page size with one poster', async () => {
        const { printLayout } = await kit();
        const { buildPrintPdf } = await import('@/lib/qr/printPdf');
        const pdf = inspect(await buildPrintPdf(printLayout('table', 'shop'), PNG));
        expect(pdf.isPdf).toBe(true);
        expect(pdf.wPt).toBeCloseTo(111 * MM_TO_PT, 1);
        expect(pdf.hPt).toBeCloseTo(154 * MM_TO_PT, 1);
        expect(pdf.draws).toBe(1);
    });

    it('is an A4 sheet with four posters for home table stands', async () => {
        const { printLayout } = await kit();
        const { buildPrintPdf } = await import('@/lib/qr/printPdf');
        const pdf = inspect(await buildPrintPdf(printLayout('table', 'home'), PNG));
        expect(pdf.wPt).toBeCloseTo(210 * MM_TO_PT, 1);
        expect(pdf.hPt).toBeCloseTo(297 * MM_TO_PT, 1);
        expect(pdf.draws).toBe(4);
    });

    /**
     * Measured in the browser, 2026-09-25: storing the poster uncompressed made
     * the A4 print-shop file 26.7 MB — too big to WhatsApp to a print shop.
     * Lossless compression brings the real artwork to ~1.7 MB with every QR
     * edge intact.
     */
    it('stores the poster compressed, so the file can be sent on WhatsApp', async () => {
        const { printLayout } = await kit();
        const { buildPrintPdf } = await import('@/lib/qr/printPdf');
        const w = 600, h = 800;
        const pdf = await buildPrintPdf(printLayout('table', 'shop'), solidPng(w, h));
        expect(pdf.byteLength).toBeLessThan((w * h * 3) / 10);
    });

    it('names the file after the store, the paper and the method', async () => {
        const { pdfFileName } = await kit();
        expect(pdfFileName('cream-story', 'table', 'home')).toBe('cream-story-qr-a6-home-printer.pdf');
        expect(pdfFileName('cream-story', 'wall', 'shop')).toBe('cream-story-qr-a4-print-shop.pdf');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — scan distance
// ─────────────────────────────────────────────────────────────────────────────

describe('AC6: says how far away it scans from', () => {
    it('uses the 10:1 rule with a 20% margin, rounded down to 10 cm', async () => {
        const { scanDistanceCm } = await kit();
        expect(scanDistanceCm(62.5)).toBe(50);
        expect(scanDistanceCm(88)).toBe(70);
        expect(scanDistanceCm(125)).toBe(100);
    });

    it('writes a metre as a metre', async () => {
        const { formatDistance } = await kit();
        expect(formatDistance(50)).toBe('50 cm');
        expect(formatDistance(100)).toBe('1 m');
        expect(formatDistance(150)).toBe('1.5 m');
    });

    it('measures the QR on the printed card, not on the screen', async () => {
        const { printLayout, qrWidthMm } = await kit();
        // The artwork covers the bleed too, so the QR grows with it: 0.6 × 111.
        expect(qrWidthMm(printLayout('table', 'shop'), 0.6)).toBeCloseTo(66.6, 5);
        // Home sheets are shrunk to fit the printer margin.
        expect(qrWidthMm(printLayout('table', 'home'), 0.6)).toBeLessThan(63);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — sharing
// ─────────────────────────────────────────────────────────────────────────────

describe('AC7: the menu link can be shared', () => {
    it('shows the link without the protocol', async () => {
        const { menuLinkDisplay } = await kit();
        expect(menuLinkDisplay('https://vsite.in/shop/cream-story')).toBe('vsite.in/shop/cream-story');
        expect(menuLinkDisplay('http://localhost:3000/shop/cream-story/')).toBe('localhost:3000/shop/cream-story');
    });

    it('opens WhatsApp with the store name and the link in the message', async () => {
        const { whatsappShareUrl } = await kit();
        const u = new URL(whatsappShareUrl('https://vsite.in/shop/cream-story', 'Cream Story'));
        expect(u.origin).toBe('https://wa.me');
        const text = u.searchParams.get('text') ?? '';
        expect(text).toContain('Cream Story');
        expect(text).toContain('https://vsite.in/shop/cream-story');
    });

    it('the panel copies, shares on WhatsApp, opens the menu, explains Google Maps and offers a Status image', () => {
        const panel = shipped(PANEL);
        expect(panel).toMatch(/navigator\.clipboard/);
        expect(panel).toMatch(/whatsappShareUrl\(/);
        expect(panel).toMatch(/target="_blank"/);
        expect(panel).toMatch(/Google Maps/);
        expect(panel).toMatch(/renderStoryImage\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC8 — who sees it
// ─────────────────────────────────────────────────────────────────────────────

describe('AC8: menu-only stores get the kit when the flag is on', () => {
    it('the page chooses on the flag and the plan', () => {
        const page = shipped(PAGE);
        expect(page).toMatch(/QR_PRINT_KIT && qrMenuOnly/);
        expect(page).toMatch(/<MenuQrPanel\b/);
    });

    it('placements are real radio choices a keyboard can reach', () => {
        const panel = shipped(PANEL);
        expect(panel).toMatch(/role="radiogroup"/);
        expect(panel).toMatch(/role="radio"/);
        expect(panel).toMatch(/aria-checked=/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC9 / AC10 — honesty and failures, flag or not
// ─────────────────────────────────────────────────────────────────────────────

describe('AC9: no button says PDF unless it makes one', () => {
    it('the current page no longer calls its PNG a PDF', () => {
        const page = shipped(PAGE);
        expect(page).not.toMatch(/Download PDF/);
        expect(page).not.toMatch(/picture_as_pdf/);
    });

    it('the kit\'s "Download PDF" builds a PDF', () => {
        const panel = shipped(PANEL);
        expect(panel).toMatch(/Download PDF/);
        expect(panel).toMatch(/buildPrintPdf\(/);
    });
});

describe('AC10: a failed download says so and frees the buttons', () => {
    it('the current page resets its busy state in finally and tells the owner', () => {
        const page = shipped(PAGE);
        const finallyResets = page.match(/finally\s*\{\s*setDownloading\(null\)/g) ?? [];
        expect(finallyResets.length).toBeGreaterThanOrEqual(7);
        expect(page).toMatch(/toast\.error\(/);
    });

    it('the kit does the same', () => {
        const panel = shipped(PANEL);
        expect(panel).toMatch(/finally\s*\{\s*setBusy\(null\)/);
        expect(panel).toMatch(/toast\.error\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC11 — phones
// ─────────────────────────────────────────────────────────────────────────────

describe('AC11: one Download PDF button, in the Print card, that scrolls with the page', () => {
    /**
     * Owner, 2026-09-25: the floating download bar covered the page on a phone
     * ("remove the floating button"). The button lives in one place — the
     * Print card, under the choices it prints — and the owner scrolls to it.
     */
    it('has no floating or sticky download bar', () => {
        const panel = shipped(PANEL);
        expect(panel).not.toMatch(/qrk-bar/);
        expect(panel).not.toMatch(/bottom:\s*\d+px;\s*z-index/);
    });

    it('renders the Download PDF button exactly once, inside the Print card, at every width', () => {
        const panel = shipped(PANEL);
        expect(panel.match(/\{pdfButton\}/g) ?? []).toHaveLength(1);
        const print = panel.indexOf('Print it');
        const share = panel.indexOf('Share your menu link');
        const btn = panel.indexOf('{pdfButton}');
        expect(btn).toBeGreaterThan(print);
        expect(btn).toBeLessThan(share);
        // Nothing hides it on narrow screens.
        expect(panel).not.toMatch(/qrk-inline-action \{ display: none/);
    });
});
