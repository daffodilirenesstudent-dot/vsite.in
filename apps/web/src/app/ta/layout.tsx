import type { ReactNode } from 'react';
import { Noto_Sans_Tamil } from 'next/font/google';

/**
 * Tamil typeface for the /ta routes, and only for them.
 *
 * The root layout loads Latin-only faces, so Tamil text falls back to whatever
 * the reader's phone has. Loading the face here, rather than in the root
 * layout, means English pages, the blog and the dashboard pay nothing for it
 * (the same reasoning as app/shop/layout.tsx).
 *
 * `<html lang>` belongs to the root layout, which this route may not touch, so
 * the Tamil language is declared on a wrapper element instead. The wrapper sets
 * font-family itself using ONLY the variable defined in this file: one
 * undefined var() voids a whole font-family (see AGENTS.md), and the root
 * layout's Outfit variables are not guaranteed to resolve down here.
 */
const notoTamil = Noto_Sans_Tamil({
    subsets: ['tamil', 'latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-ta-noto',
    display: 'swap',
});

// Headings use Tailwind's font-display (Outfit, Latin only); override inside the wrapper
// so Tamil headings do not fall back to a system face.
const TA_CSS =
    '.ta-root, .ta-root * { font-family: var(--font-ta-noto), system-ui, sans-serif; }';

export default function TamilLayout({ children }: { children: ReactNode }) {
    return (
        <div lang="ta" className={`${notoTamil.variable} ta-root`}>
            <style dangerouslySetInnerHTML={{ __html: TA_CSS }} />
            {children}
        </div>
    );
}
