import { AuthProvider } from '@/components/AuthContext';
import { OnboardingProvider } from '@/components/OnboardingContext';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OnboardingProvider>{children}</OnboardingProvider>
    </AuthProvider>
  );
}
