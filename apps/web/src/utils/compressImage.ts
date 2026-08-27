/**
 * Compresses an image file before upload.
 * Reduces file size by resizing and adjusting quality.
 * Returns a new File object with the compressed image.
 */
export async function compressImage(
    file: File,
    options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<File> {
    const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;

    // Skip non-image files
    if (!file.type.startsWith('image/')) return file;

    // Skip small files (under 500KB) — not worth compressing
    if (file.size < 500 * 1024) return file;

    return new Promise((resolve) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = () => {
            let { width, height } = img;

            // Calculate new dimensions while maintaining aspect ratio
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            canvas.width = width;
            canvas.height = height;
            ctx?.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        // Only use compressed version if it's actually smaller
                        resolve(compressedFile.size < file.size ? compressedFile : file);
                    } else {
                        resolve(file);
                    }
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => resolve(file); // Fallback to original on error
        img.src = URL.createObjectURL(file);
    });
}
