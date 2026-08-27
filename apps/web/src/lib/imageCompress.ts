// src/lib/imageCompress.ts
// Browser-side image compression — runs before upload.
//
// Why: Vercel's serverless body cap is ~4.5MB. A single iPhone photo is often
// 4–8MB. Without compression, even 1 photo can fail the upload entirely, and
// 10 photos definitely will. Resizing to 1600px on the long edge + 0.82 JPEG
// quality typically yields 200–500KB per photo with no visible loss for menu
// scanning.

const MAX_DIMENSION = 1600;     // px on the long edge
const JPEG_QUALITY = 0.82;
const SIZE_THRESHOLD = 800_000; // 800KB — files smaller than this skip compression

/**
 * Compresses an image File and returns a new JPEG File. If the input is
 * already small enough (<800KB) and is a JPEG, it is returned unchanged
 * so we don't waste cycles re-encoding.
 */
export async function compressImage(file: File): Promise<File> {
    if (typeof window === 'undefined') return file;
    if (file.size < SIZE_THRESHOLD && /^image\/jpe?g$/i.test(file.type)) return file;

    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);

    const { width, height } = scaleToFit(img.width, img.height, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'menu';
    const compressed = new File([blob], `${baseName}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
    });

    // If compression somehow produced a larger file (rare, very small inputs),
    // keep the original.
    return compressed.size < file.size ? compressed : file;
}

function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = src;
    });
}

function scaleToFit(w: number, h: number, max: number): { width: number; height: number } {
    if (w <= max && h <= max) return { width: w, height: h };
    const ratio = w > h ? max / w : max / h;
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}
