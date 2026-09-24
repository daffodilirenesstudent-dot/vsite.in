import { Poppins, Newsreader } from 'next/font/google';

/**
 * Fonts the food posters draw with (lib/qr/designRender.ts), as CSS variables
 * the canvas renderer reads. Poppins 800 is not in the root layout (it stops
 * at 700), and Newsreader is loaded only on the customer menu — so this route
 * loads its own. `display: contents` keeps the wrapper out of the layout.
 */
const posterPoppins = Poppins({
    subsets: ['latin'],
    weight: ['600', '700', '800'],
    variable: '--poster-poppins',
    display: 'swap',
});

const posterNewsreader = Newsreader({
    subsets: ['latin'],
    weight: ['600', '700'],
    style: ['normal', 'italic'],
    variable: '--poster-newsreader',
    display: 'swap',
});

export default function QrLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={`${posterPoppins.variable} ${posterNewsreader.variable}`} style={{ display: 'contents' }}>
            {children}
        </div>
    );
}
