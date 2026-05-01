import type { Metadata } from 'next';
import ManageLayoutClient from '@/components/ManageLayoutClient';

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
