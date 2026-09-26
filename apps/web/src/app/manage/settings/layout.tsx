import type { Metadata } from 'next';

// The page is a client component, so its tab title lives here.
export const metadata: Metadata = { title: 'Store settings' };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
