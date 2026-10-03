// Browser side of the plate generator: draws one design's food layer with the
// renderer's own drawImageElement, on a transparent canvas, at a given scale.
import { POSTER_DESIGNS, DESIGN_W, DESIGN_H } from '@/lib/qr/posterDesigns';
import { drawImageElement } from '@/lib/qr/designRender';
import { loadImage } from '@/lib/qr/posterRender';
import { plateHash } from '@/lib/qr/posterPlates';

declare global {
    interface Window {
        renderPlate: (id: string, scale: number, quality: number) => Promise<{ base64: string; width: number; height: number }>;
        plateHashFor: (id: string, art: Record<string, string>) => string;
    }
}

function design(id: string) {
    const d = POSTER_DESIGNS.find(x => x.id === id);
    if (!d) throw new Error(`no design ${id}`);
    return d;
}

window.renderPlate = async (id, scale, quality) => {
    const d = design(id);
    const c = document.createElement('canvas');
    c.width = Math.round(DESIGN_W * scale);
    c.height = Math.round(DESIGN_H * scale);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2D context');
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(scale, scale);
    for (const e of d.elements) {
        if (e.kind === 'image') drawImageElement(ctx, e, await loadImage(e.src), scale);
    }
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp') throw new Error(`browser did not encode WebP (${blob?.type})`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { base64: btoa(bin), width: c.width, height: c.height };
};

window.plateHashFor = (id, art) => plateHash(design(id), src => art[src]);
