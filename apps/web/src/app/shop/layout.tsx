import type { ReactNode } from 'react';
import {
    Newsreader,
    Familjen_Grotesk,
    Noto_Sans_Tamil,
    Mukta_Malar,
    Anek_Tamil,
} from 'next/font/google';

/**
 * Fonts for the public menu — and only for the public menu.
 *
 * Two things are being fixed here.
 *
 * FIRST, TAMIL. The root layout loads Outfit, Poppins and Manrope with
 * `subsets: ['latin']`, so no face it ships covers Tamil at all. Every Tamil
 * dish name on every menu currently renders in whatever the reader's Android
 * happens to fall back to — uncontrolled metrics, uncontrolled weight, on a
 * product sold into Tamil Nadu. Each pairing below carries a real Tamil face.
 *
 * SECOND, WHERE THE COST LANDS. These live in a `/shop` layout rather than the
 * root one so the marketing pages, the blog and the dashboard pay nothing for
 * them. The menu is the perf-critical surface — cheap Androids, slow networks —
 * and it is the only place that needs them.
 *
 * `display: 'swap'` throughout: text must be readable while a face is still in
 * flight. A menu that renders invisibly for 300ms is worse than one that
 * reflows.
 *
 * The variables are consumed through `menuThemes.ts` -> `themeCssVars()`, not
 * referenced directly by components.
 */

const newsreader = Newsreader({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    variable: '--font-newsreader',
    display: 'swap',
});

const familjen = Familjen_Grotesk({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-familjen',
    display: 'swap',
});

const notoTamil = Noto_Sans_Tamil({
    subsets: ['tamil'],
    weight: ['400', '500', '600'],
    variable: '--font-noto-tamil',
    display: 'swap',
});

const muktaMalar = Mukta_Malar({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    variable: '--font-mukta-malar',
    display: 'swap',
});

const anekTamil = Anek_Tamil({
    subsets: ['tamil'],
    weight: ['400', '500', '600'],
    variable: '--font-anek-tamil',
    display: 'swap',
});

export default function ShopLayout({ children }: { children: ReactNode }) {
    return (
        <div
            className={[
                newsreader.variable,
                familjen.variable,
                notoTamil.variable,
                muktaMalar.variable,
                anekTamil.variable,
            ].join(' ')}
        >
            {children}
        </div>
    );
}
