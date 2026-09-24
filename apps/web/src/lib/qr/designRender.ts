/**
 * Draws a food poster (posterDesigns.ts) onto a canvas at any card size.
 * Browser-only.
 *
 * Everything but the QR is drawn in the 559×794 design space under one
 * cover-fit transform, so the same design fills an A6 table stand, an A4 wall
 * poster or a print shop's bleed. The QR is drawn last in device pixels,
 * generated at exactly the size it prints, so its edges stay sharp.
 */
import {
    DESIGN_W, designCover, fitFontSize, headlineText, qrCardOf,
    type DesignElement, type FontRole, type PosterDesign,
} from '@/lib/qr/posterDesigns';
import { blobToImage, loadImage } from '@/lib/qr/posterRender';

/** CSS font-family strings for each font role (next/font's hashed families). */
export type PosterFonts = Record<FontRole, string>;

/** Reads the families the QR route's layout provides as CSS variables. */
export function posterFontsFrom(el: Element): PosterFonts {
    const cs = getComputedStyle(el);
    const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
        poppins: pick('--poster-poppins', 'Poppins, system-ui, sans-serif'),
        newsreader: pick('--poster-newsreader', 'Newsreader, Georgia, serif'),
    };
}

const artCache = new Map<string, Promise<HTMLImageElement>>();
function art(src: string): Promise<HTMLImageElement> {
    let p = artCache.get(src);
    if (!p) {
        p = loadImage(src);
        artCache.set(src, p);
        p.catch(() => artCache.delete(src));
    }
    return p;
}

type TextEl = Extract<DesignElement, { kind: 'text' }>;
type QrEl = Extract<DesignElement, { kind: 'qr' }>;

function fontString(e: TextEl, size: number, fonts: PosterFonts): string {
    return `${e.italic ? 'italic ' : ''}${e.weight} ${size}px ${fonts[e.font]}`;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
    // Chrome/Edge 99+, Safari 17+; elsewhere the headline is simply a touch wider.
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function drawBursts(ctx: CanvasRenderingContext2D, cx: number, cy: number, halfWidth: number, color: string) {
    const gap = 12;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
        const x = cx + side * (halfWidth + gap);
        const strokes: Array<[number, number, number, number]> = [
            [x, cy - 18, x + side * 14, cy - 30],
            [x + side * 4, cy, x + side * 22, cy],
            [x, cy + 18, x + side * 14, cy + 30],
        ];
        for (const [x1, y1, x2, y2] of strokes) {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
    }
    ctx.restore();
}

/** Viewfinder brackets just outside the card, like a camera frame. */
function drawBrackets(ctx: CanvasRenderingContext2D, q: QrEl, color: string) {
    const L = 40, t = 5, r = 18;
    const off = 17 - q.border;           // brackets sit 17 px outside the card's inner edge
    const x0 = q.x - off, y0 = q.y - off;
    const x1 = q.x + q.size + off, y1 = q.y + q.size + off;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = t;
    ctx.lineCap = 'butt';
    const h = t / 2;
    const corners: Array<[number, number, number, number]> = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(cx + sx * h, cy + sy * L);
        ctx.lineTo(cx + sx * h, cy + sy * r);
        ctx.arcTo(cx + sx * h, cy + sy * h, cx + sx * r, cy + sy * h, r - h);
        ctx.lineTo(cx + sx * L, cy + sy * h);
        ctx.stroke();
    }
    ctx.restore();
}

export async function renderDesignPoster({ design, accent, storeName, qrBlobFor, widthPx, heightPx, fonts }: {
    design: PosterDesign;
    accent: string;
    storeName: string;
    qrBlobFor: (sizePx: number) => Promise<Blob | null>;
    widthPx: number;
    heightPx: number;
    fonts: PosterFonts;
}): Promise<HTMLCanvasElement> {
    const { scale, dx, dy } = designCover(widthPx, heightPx);
    const paint = (p: string) => (p === 'accent' ? accent : p);
    const q = qrCardOf(design);
    const qrInnerDesign = q.size - 2 * q.pad - 2 * q.border;
    const qrPx = Math.round(qrInnerDesign * scale);

    const texts = design.elements.filter((e): e is TextEl => e.kind === 'text');
    const [images, qrImg] = await Promise.all([
        Promise.all(design.elements.map(e => (e.kind === 'image' ? art(e.src) : Promise.resolve(null)))),
        qrBlobFor(qrPx).then(b => {
            if (!b) throw new Error('QR could not be generated');
            return blobToImage(b);
        }),
        Promise.all(texts.map(e => document.fonts.load(fontString(e, e.size, fonts)))),
    ]);

    const c = document.createElement('canvas');
    c.width = widthPx; c.height = heightPx;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = design.background;
    ctx.fillRect(0, 0, widthPx, heightPx);

    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(scale, scale);
    // Shadows are NOT scaled by the transform — they are always device pixels.
    const shadow = (color: string, blur: number, offY: number) => {
        ctx.shadowColor = color; ctx.shadowBlur = blur * scale; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = offY * scale;
    };

    design.elements.forEach((e, i) => {
        if (e.kind === 'rect') {
            ctx.fillStyle = paint(e.fill);
            ctx.beginPath();
            ctx.roundRect(e.x, e.y, e.w, e.h, e.radius ?? 0);
            ctx.fill();
        } else if (e.kind === 'image') {
            const img = images[i];
            if (!img) return;
            ctx.save();
            if (e.shadow) shadow(e.shadow.color, e.shadow.blur, e.shadow.dy);
            if (e.rotate) {
                ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
                ctx.rotate((e.rotate * Math.PI) / 180);
                ctx.drawImage(img, -e.w / 2, -e.h / 2, e.w, e.h);
            } else {
                ctx.drawImage(img, e.x, e.y, e.w, e.h);
            }
            ctx.restore();
        } else if (e.kind === 'text') {
            const text = headlineText(e.role, storeName).trim();
            if (!text) return;
            const cx = DESIGN_W / 2;
            ctx.save();
            const size = e.maxWidth
                ? fitFontSize(s => { ctx.font = fontString(e, s, fonts); setLetterSpacing(ctx, (e.letterSpacing ?? 0) * s); return ctx.measureText(text).width; }, e.maxWidth, e.size, Math.round(e.size * 0.55))
                : e.size;
            ctx.font = fontString(e, size, fonts);
            setLetterSpacing(ctx, (e.letterSpacing ?? 0) * size);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const width = ctx.measureText(text).width;
            if (e.pill) {
                const h = size * 1.5 + 2 * e.pill.padY;
                ctx.save();
                if (e.pill.shadow) shadow('rgba(60, 30, 10, 0.14)', 14, 4);
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.roundRect(cx - width / 2 - e.pill.padX, e.cy - h / 2, width + 2 * e.pill.padX, h, h / 2);
                ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = paint(e.color);
            ctx.fillText(text, cx, e.cy);
            if (e.bursts) drawBursts(ctx, cx, e.cy, width / 2, paint(e.color));
            ctx.restore();
        } else if (e.kind === 'qr') {
            ctx.save();
            shadow('rgba(60, 30, 10, 0.12)', 28, 10);
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.roundRect(q.x, q.y, q.size, q.size, q.radius);
            ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.strokeStyle = paint(q.borderColor);
            ctx.lineWidth = q.border;
            ctx.beginPath();
            ctx.roundRect(q.x + q.border / 2, q.y + q.border / 2, q.size - q.border, q.size - q.border, Math.max(0, q.radius - q.border / 2));
            ctx.stroke();
            ctx.restore();
            if (q.corners) drawBrackets(ctx, q, paint(q.borderColor));
        }
    });
    ctx.restore();

    // The code itself, in device pixels on whole-pixel positions: never resampled.
    const qx = Math.round(dx + (q.x + q.border + q.pad) * scale);
    const qy = Math.round(dy + (q.y + q.border + q.pad) * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qrImg, qx, qy, qrPx, qrPx);
    return c;
}
