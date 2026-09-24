import type QRCodeStylingClass from 'qr-code-styling';
import type { Options as QROptions } from 'qr-code-styling';

/**
 * The menu QR's look, shared by the QR page and the print kit so every
 * download is the same code. Error correction H (~30 % recoverable) is what
 * lets a centre badge sit on top without breaking the scan.
 */

export async function loadQRLib(): Promise<typeof QRCodeStylingClass> {
    const mod = await import('qr-code-styling');
    return mod.default;
}

export function qrOptions(data: string, size: number, imageUrl?: string, type: 'canvas' | 'svg' = 'canvas'): QROptions {
    return {
        width: size, height: size, type, data,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: { color: '#000000', type: 'extra-rounded' },
        cornersSquareOptions: { color: '#000000', type: 'extra-rounded' },
        cornersDotOptions: { color: '#000000', type: 'dot' },
        backgroundOptions: { color: '#ffffff' },
        ...(imageUrl ? {
            image: imageUrl,
            imageOptions: { margin: 6, imageSize: 0.28, crossOrigin: 'anonymous', saveAsBlob: true },
        } : {}),
    };
}

export async function getStyledQRBlob(data: string, imageDataUrl?: string, size = 1000): Promise<Blob | null> {
    const QRCodeStyling = await loadQRLib();
    const qr = new QRCodeStyling(qrOptions(data, size, imageDataUrl));
    const raw = await qr.getRawData('png');
    if (!raw) return null;
    if (typeof Blob !== 'undefined' && raw instanceof Blob) return raw;
    return null;
}

/** Vector QR for designers and sign makers: scales to any size without blur. */
export async function getStyledQRSvgBlob(data: string, size = 1000): Promise<Blob | null> {
    const QRCodeStyling = await loadQRLib();
    const qr = new QRCodeStyling(qrOptions(data, size, undefined, 'svg'));
    const raw = await qr.getRawData('svg');
    if (!raw) return null;
    if (typeof Blob !== 'undefined' && raw instanceof Blob) return raw;
    return null;
}

export function downloadBlob(blob: Blob, name: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
