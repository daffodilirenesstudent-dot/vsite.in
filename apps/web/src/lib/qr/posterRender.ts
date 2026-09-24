/**
 * Drawing the QR poster onto a canvas. Browser-only.
 *
 * The poster is the owner's artwork with a white box where the QR goes. The
 * box is found by scanning the artwork's pixels, so a new template needs no
 * coordinates typed in.
 */

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = reject;
        img.src = url;
    });
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export function detectWhiteBox(template: HTMLImageElement): { x: number; y: number; w: number; h: number } {
    const W = template.naturalWidth, H = template.naturalHeight;
    const sc = Math.min(1, 400 / W);
    const sw = Math.round(W * sc), sh = Math.round(H * sc);
    const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(template, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    const isWhite = (x: number, y: number) => { const i = (y * sw + x) * 4; return d[i] > 220 && d[i + 1] > 220 && d[i + 2] > 220 && d[i + 3] > 200; };
    const sy = Math.round(sh * 0.55);
    let L = -1, R = -1;
    for (let x = 0; x < sw; x++) if (isWhite(x, sy)) { if (L < 0) L = x; R = x; }
    const sx = L > 0 ? Math.round((L + R) / 2) : Math.round(sw / 2);
    const minY = Math.round(sh * 0.30);
    let T = -1, B = -1;
    for (let y = minY; y < sh; y++) if (isWhite(sx, y)) { if (T < 0) T = y; B = y; }
    if (L < 0 || T < 0) return { x: W * 0.127, y: H * 0.385, w: W * 0.746, h: H * 0.494 };
    return { x: Math.round(L / sc), y: Math.round(T / sc), w: Math.round((R - L) / sc), h: Math.round((B - T) / sc) };
}

/** Where the QR sits inside the artwork, in the artwork's own pixels. */
export function qrSquareIn(template: HTMLImageElement): { x: number; y: number; size: number } {
    const box = detectWhiteBox(template);
    const pad = Math.min(box.w, box.h) * 0.07;
    const size = Math.min(box.w, box.h) - pad * 2;
    return { x: box.x + (box.w - size) / 2, y: box.y + (box.h - size) / 2, size };
}

/** The QR's share of the poster's width — what the scan-distance rule needs. */
export function qrFractionOf(template: HTMLImageElement): number {
    return qrSquareIn(template).size / template.naturalWidth;
}

/**
 * The poster at an exact pixel size. The artwork is scaled to cover the card
 * (so it also fills a print shop's bleed), and the QR is generated at the size
 * it will print rather than scaled up, so it stays sharp at A4.
 */
export async function renderPosterCard({ template, qrBlobFor, widthPx, heightPx }: {
    template: HTMLImageElement;
    qrBlobFor: (sizePx: number) => Promise<Blob | null>;
    widthPx: number;
    heightPx: number;
}): Promise<HTMLCanvasElement> {
    const W = template.naturalWidth, H = template.naturalHeight;
    const s = Math.max(widthPx / W, heightPx / H);
    const dx = (widthPx - W * s) / 2;
    const dy = (heightPx - H * s) / 2;

    const c = document.createElement('canvas');
    c.width = widthPx; c.height = heightPx;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(template, dx, dy, W * s, H * s);

    const sq = qrSquareIn(template);
    const qrPx = Math.round(sq.size * s);
    const qrBlob = await qrBlobFor(qrPx);
    if (!qrBlob) throw new Error('QR could not be generated');
    const qrImg = await blobToImage(qrBlob);
    ctx.drawImage(qrImg, Math.round(dx + sq.x * s), Math.round(dy + sq.y * s), qrPx, qrPx);
    return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        c.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas export failed'))), type, quality);
    });
}

/**
 * A soft blur of `src` at w×h without `ctx.filter` (older Safari ignores it):
 * shrink to a thumbnail, then grow back in doubling steps. One big jump from
 * the thumbnail leaves visible blocks; each 2× step smooths the last.
 */
function softBlur(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
    let cw = Math.max(1, Math.round(w / 40)), ch = Math.max(1, Math.round(h / 40));
    let cur = document.createElement('canvas');
    cur.width = cw; cur.height = ch;
    cur.getContext('2d')!.drawImage(src, 0, 0, cw, ch);
    while (cw < w || ch < h) {
        cw = Math.min(w, cw * 2); ch = Math.min(h, ch * 2);
        const next = document.createElement('canvas');
        next.width = cw; next.height = ch;
        const nctx = next.getContext('2d')!;
        nctx.imageSmoothingEnabled = true;
        nctx.imageSmoothingQuality = 'high';
        nctx.drawImage(cur, 0, 0, cw, ch);
        cur = next;
    }
    return cur;
}

/**
 * 1080×1920 for WhatsApp Status and Instagram Stories: the poster, centred,
 * on a soft blur of itself.
 */
export async function renderStoryImage(poster: HTMLCanvasElement): Promise<Blob> {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;

    ctx.drawImage(softBlur(poster, W, H), 0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(0, 0, W, H);

    const pw = 880;
    const ph = Math.round(pw * (poster.height / poster.width));
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    const r = 36;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 16;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, r);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, r);
    ctx.clip();
    ctx.drawImage(poster, px, py, pw, ph);
    ctx.restore();

    return canvasToBlob(c);
}
