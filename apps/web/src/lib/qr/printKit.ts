/**
 * QR print kit: the rules behind "where will this go?" on the QR page.
 * Pure and client-safe. See tests/acceptance/qr-print-kit.test.ts for the
 * research behind every number here.
 *
 * The owner picks a PLACE, not a paper size: a table stand, the counter, a
 * wall or door. Each place implies a paper size, and the paper size implies
 * how big the QR prints and so how far away a phone can read it.
 */

/** Build-time flag. OFF unless exactly "true" — flag off is today's QR page. */
export const QR_PRINT_KIT: boolean = process.env.NEXT_PUBLIC_QR_PRINT_KIT === 'true';

export type Placement = 'table' | 'counter' | 'wall';
export type PrintMethod = 'home' | 'shop';

interface Size { w: number; h: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Line { x1: number; y1: number; x2: number; y2: number }

export const PLACEMENTS: Record<Placement, { label: string; paper: 'A6' | 'A5' | 'A4'; trimMm: Size; hint: string }> = {
    table:   { label: 'Table stand',  paper: 'A6', trimMm: { w: 105, h: 148 }, hint: 'One on each table' },
    counter: { label: 'Counter',      paper: 'A5', trimMm: { w: 148, h: 210 }, hint: 'At the billing counter or the entrance' },
    wall:    { label: 'Wall or door', paper: 'A4', trimMm: { w: 210, h: 297 }, hint: 'On a wall, door or window' },
};

export const PLACEMENT_ORDER = ['table', 'counter', 'wall'] as const;

/** Print shops trim a little off every edge, so the artwork runs 3 mm past it. */
export const BLEED_MM = 3;
/** Home printers cannot print to the edge; keep everything this far in. */
export const HOME_MARGIN_MM = 6;

const A4: Size = { w: 210, h: 297 };

/** How many fit on one A4 sheet at home, and which way round the sheet goes. */
const HOME_SHEET: Record<Placement, { cols: number; rows: number; orientation: 'portrait' | 'landscape' }> = {
    table:   { cols: 2, rows: 2, orientation: 'portrait' },
    counter: { cols: 2, rows: 1, orientation: 'landscape' },
    wall:    { cols: 1, rows: 1, orientation: 'portrait' },
};

/**
 * The QR's share of the poster's width in the current artwork: the white box
 * measured by `detectWhiteBox`, less its padding (703 of 1181 px). The page
 * measures the real template and passes that instead once it has loaded.
 */
export const DEFAULT_QR_FRACTION = 0.595;

export interface PrintLayout {
    pageMm: Size;
    orientation: 'portrait' | 'landscape';
    /** Where each poster image goes on the page. For a print shop it includes the bleed. */
    cards: Rect[];
    /** The size each poster ends up after cutting. */
    trimMm: Size;
    bleedMm: number;
    cutLines: Line[];
}

export function printLayout(placement: Placement, method: PrintMethod): PrintLayout {
    const trim = PLACEMENTS[placement].trimMm;

    if (method === 'shop') {
        const page = { w: trim.w + 2 * BLEED_MM, h: trim.h + 2 * BLEED_MM };
        return {
            pageMm: page,
            orientation: page.w > page.h ? 'landscape' : 'portrait',
            cards: [{ x: 0, y: 0, w: page.w, h: page.h }],
            trimMm: { ...trim },
            bleedMm: BLEED_MM,
            cutLines: [],
        };
    }

    const sheet = HOME_SHEET[placement];
    const page = sheet.orientation === 'portrait' ? { ...A4 } : { w: A4.h, h: A4.w };
    const scale = Math.min(
        (page.w - 2 * HOME_MARGIN_MM) / (sheet.cols * trim.w),
        (page.h - 2 * HOME_MARGIN_MM) / (sheet.rows * trim.h),
        1,
    );
    const w = trim.w * scale;
    const h = trim.h * scale;
    const x0 = (page.w - sheet.cols * w) / 2;
    const y0 = (page.h - sheet.rows * h) / 2;

    const cards: Rect[] = [];
    for (let r = 0; r < sheet.rows; r++) {
        for (let c = 0; c < sheet.cols; c++) cards.push({ x: x0 + c * w, y: y0 + r * h, w, h });
    }

    const x1 = x0 + sheet.cols * w;
    const y1 = y0 + sheet.rows * h;
    const cutLines: Line[] = [];
    for (let c = 0; c <= sheet.cols; c++) cutLines.push({ x1: x0 + c * w, y1: y0, x2: x0 + c * w, y2: y1 });
    for (let r = 0; r <= sheet.rows; r++) cutLines.push({ x1: x0, y1: y0 + r * h, x2: x1, y2: y0 + r * h });

    return { pageMm: page, orientation: sheet.orientation, cards, trimMm: { w, h }, bleedMm: 0, cutLines };
}

/** Printed width of the QR. The artwork fills each card (bleed included), so the QR scales with the card. */
export function qrWidthMm(layout: PrintLayout, qrFraction: number = DEFAULT_QR_FRACTION): number {
    return layout.cards[0].w * qrFraction;
}

/**
 * How far away a phone reads it: the 10:1 rule (a QR scans from about ten
 * times its width), less 20 % for real rooms, rounded down to 10 cm.
 */
export function scanDistanceCm(qrWidth: number): number {
    return Math.floor((qrWidth * 0.8) / 10 + 1e-9) * 10;
}

export function formatDistance(cm: number): string {
    return cm < 100 ? `${cm} cm` : `${Number((cm / 100).toFixed(1))} m`;
}

export function mmToPx(mm: number, dpi = 300): number {
    return Math.round((mm / 25.4) * dpi);
}

export function pdfFileName(slug: string, placement: Placement, method: PrintMethod): string {
    const paper = PLACEMENTS[placement].paper.toLowerCase();
    return `${slug}-qr-${paper}-${method === 'home' ? 'home-printer' : 'print-shop'}.pdf`;
}

/** The link as an owner would say it out loud: no protocol, no trailing slash. */
export function menuLinkDisplay(url: string): string {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function whatsappShareUrl(url: string, storeName: string): string {
    return `https://wa.me/?text=${encodeURIComponent(`See the ${storeName} menu: ${url}`)}`;
}
