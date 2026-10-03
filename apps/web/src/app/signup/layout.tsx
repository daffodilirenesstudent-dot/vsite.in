import type { Metadata } from 'next';
import { AuthProvider } from '@/components/AuthContext';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
