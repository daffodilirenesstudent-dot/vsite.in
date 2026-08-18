import type { Metadata } from 'next';
import ManageLayoutClient from '@/components/ManageLayoutClient';

// Opt every /manage/* route out of Next's full route cache. Without this,
// statically prerendered pages are served with `s-maxage=31536000,
// stale-while-revalidate`, which invites any CDN in front of the origin to
// hold a copy of a signed-in page for a year — the header that let Cloudflare
// cache the dashboard's RSC payload and replay it as the HTML document.
// These pages are per-account and behind the auth gate; they must never be
// prerendered into a shared cache.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Dashboard | Vsite',
    description: 'Manage your Vsite digital menu and shop settings.',
};

export default function ManageLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ManageLayoutClient>
            {children}
        </ManageLayoutClient>
    );
}
