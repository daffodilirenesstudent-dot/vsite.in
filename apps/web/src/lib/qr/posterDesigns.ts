/**
 * Food posters for the QR page. Pure and client-safe.
 *
 * A QR code looks the same whatever it opens; the design around it says what
 * it is for. In India the QR a diner sees most is a UPI payment standee, so the
 * menu QR is framed with food: a diner knows it opens the menu before reading a
 * word. Four designs, approved by the owner on 2026-09-25 — two for
 * restaurants, two for cafés — plus the store's current poster.
 *
 * English only: no Tamil on posters (owner's decision, 2026-09-25).
 */
import { DESIGN_DATA } from '@/lib/qr/posterDesignData';

/** Build-time flag, inside the print kit. OFF unless exactly "true". */
export const FOOD_POSTERS: boolean = process.env.NEXT_PUBLIC_FOOD_POSTERS === 'true';

/** Every design is drawn in this space and scaled to the print card. */
export const DESIGN_W = 559;
export const DESIGN_H = 794;

export type PosterFamily = 'restaurant' | 'cafe';
export type TextRole = 'store' | 'headline' | 'headline-top' | 'headline-bottom' | 'credit';
export type FontRole = 'poppins' | 'newsreader';
/** A colour, or 'accent' for the colour the owner picked. */
export type Paint = string;

export type DesignElement =
    | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: Paint; radius?: number }
    | {
        kind: 'image'; src: string; x: number; y: number; w: number; h: number;
        rotate?: number; shadow?: { dy: number; blur: number; color: string };
    }
    | {
        kind: 'text'; role: TextRole; cy: number; size: number; weight: number; font: FontRole; color: Paint;
        italic?: boolean; letterSpacing?: number; maxWidth?: number; bursts?: boolean;
        pill?: { padX: number; padY: number; shadow: boolean };
    }
    | {
        kind: 'qr'; x: number; y: number; size: number; pad: number; border: number; borderColor: Paint;
        radius: number; corners: boolean;
    };

export interface PosterDesign {
    id: string;
    family: PosterFamily;
    label: string;
    background: string;
    /** Default colour — the first of the options. */
    accent: string;
    accentOptions: string[];
    elements: DesignElement[];
}

const RESTAURANT_COLOURS = ['#E8590C', '#C81D25', '#1F7A4D', '#5137EF'];

export const POSTER_DESIGNS: readonly PosterDesign[] = [
    { id: 'feast-ring', family: 'restaurant', label: 'Feast ring', accent: RESTAURANT_COLOURS[0], accentOptions: RESTAURANT_COLOURS, ...DESIGN_DATA['feast-ring'] },
    { id: 'table-edge', family: 'restaurant', label: 'Table edge', accent: RESTAURANT_COLOURS[0], accentOptions: RESTAURANT_COLOURS, ...DESIGN_DATA['table-edge'] },
    { id: 'cafe-floating', family: 'cafe', label: 'Floating', accent: '#1F7A5A', accentOptions: ['#1F7A5A', '#C2603F', '#3B2317', '#5137EF'], ...DESIGN_DATA['cafe-floating'] },
    { id: 'cafe-counter', family: 'cafe', label: 'Counter', accent: '#1F5C4A', accentOptions: ['#1F5C4A', '#8C3B2E', '#2E4A7A', '#3B2317'], ...DESIGN_DATA['cafe-counter'] },
];

/** The store's current artwork (the owner-supplied template), kept as a choice. */
export const CLASSIC_DESIGN_ID = 'classic';

export function designById(id: string): PosterDesign | null {
    return POSTER_DESIGNS.find(d => d.id === id) ?? null;
}

/**
 * Meals places get the restaurant set; everything that sells drinks, snacks
 * and fast food gets the café set. 58 of 60 stores have no type yet, so unset
 * falls back to restaurant — the owner can switch with one tap.
 */
export function posterFamily(businessType: string | null | undefined): PosterFamily {
    return businessType === 'cafe' || businessType === 'takeaway' || businessType === 'tea_shop' ? 'cafe' : 'restaurant';
}

export const HEADLINE = 'Scan and see menu';

export function headlineText(role: TextRole, storeName = ''): string {
    switch (role) {
        case 'store': return storeName;
        case 'headline': return HEADLINE;
        case 'headline-top': return 'Scan and see';
        case 'headline-bottom': return 'menu';
        case 'credit': return 'Menu by vsite';
    }
}

/** How far the viewfinder brackets reach outside the QR card (gap + stroke). */
export const BRACKET_REACH = 17;

export function qrCardOf(design: PosterDesign): Extract<DesignElement, { kind: 'qr' }> {
    const q = design.elements.find(e => e.kind === 'qr');
    if (!q || q.kind !== 'qr') throw new Error(`${design.id} has no QR`);
    return q;
}

/** The QR's printed share of the poster width — what the scan-distance rule needs. */
export function designQrFraction(design: PosterDesign): number {
    const q = qrCardOf(design);
    return (q.size - 2 * q.pad - 2 * q.border) / DESIGN_W;
}

/**
 * Scale the design to cover a card of w×h px, centred. Print cards are close to
 * the design's shape, so at most a few millimetres of edge art is trimmed —
 * inside a print shop's 3 mm bleed.
 */
export function designCover(w: number, h: number): { scale: number; dx: number; dy: number } {
    const scale = Math.max(w / DESIGN_W, h / DESIGN_H);
    return { scale, dx: (w - DESIGN_W * scale) / 2, dy: (h - DESIGN_H * scale) / 2 };
}

/** The largest size from `size` down to `min` at which `measure(size)` fits `maxWidth`. */
export function fitFontSize(measure: (size: number) => number, maxWidth: number, size: number, min: number): number {
    let s = size;
    while (s > min && measure(s) > maxWidth) s = Math.max(min, s - 0.5);
    return s;
}

/** Per-store, per-device memory of the chosen design and colour. */
export function designStorageKey(siteId: string): string {
    return `vsite_poster_design_${siteId}`;
}
