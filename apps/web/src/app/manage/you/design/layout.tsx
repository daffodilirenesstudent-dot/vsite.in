import { Newsreader, Familjen_Grotesk } from 'next/font/google';

/**
 * The menu's display faces, for this one screen. They normally load only on
 * the customer menu (/shop layout), so the dashboard pays nothing for them —
 * which left the lettering picker drawing all three options in the same
 * fallback face. Choosing type means seeing it, so the Menu design screen
 * loads the two it lacks (Poppins, Classic's face, is already in the root
 * layout), Latin only, under the variable names menuThemes.ts reads.
 */
const newsreader = Newsreader({
    subsets: ['latin'],
    weight: ['500', '600', '700'],
    variable: '--font-newsreader',
    display: 'swap',
});

const familjen = Familjen_Grotesk({
    subsets: ['latin'],
    weight: ['500', '600', '700'],
    variable: '--font-familjen',
    display: 'swap',
});

/**
 * Each stack in FONT_PAIRS also names a Tamil face that exists only on the
 * customer menu. One undefined var() invalidates a whole font-family
 * declaration — every option then silently inherits the dashboard's font — so
 * they are pointed at the system face here. The preview's Tamil falls back to
 * the phone's own; the Latin faces, which are what the owner compares, are real.
 */
const tamilFallbacks = {
    '--font-noto-tamil': 'sans-serif',
    '--font-mukta-malar': 'sans-serif',
    '--font-anek-tamil': 'sans-serif',
} as React.CSSProperties;

export default function MenuDesignLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={`${newsreader.variable} ${familjen.variable}`} style={{ display: 'contents', ...tamilFallbacks }}>
            {children}
        </div>
    );
}
