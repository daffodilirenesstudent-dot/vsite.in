import type { Metadata } from 'next';

// The page is a client component, so its tab title lives here.
export const metadata: Metadata = { title: 'Banners' };

export default function BannerManagementLayout({ children }: { children: React.ReactNode }) {
    return children;
}
