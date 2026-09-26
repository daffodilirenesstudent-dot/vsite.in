import type { Metadata } from 'next';

// The page is a client component, so its tab title lives here.
export const metadata: Metadata = { title: 'Products' };

export default function ProductInventoryLayout({ children }: { children: React.ReactNode }) {
    return children;
}
