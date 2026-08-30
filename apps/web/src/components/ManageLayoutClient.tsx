'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { AuthProvider, useAuth } from './AuthContext';
import { PlanProvider } from './PlanContext';
import { SiteProvider, useSite } from './SiteContext';
import { NotificationProvider } from './NotificationContext';
import { PrinterStatusProvider } from './PrinterStatusContext';
import DashboardHeader from './DashboardHeader';
import SubscriptionNotifications from './SubscriptionNotifications';
import BrandLoader from './BrandLoader';
import { supabase } from '@/lib/platform/db/supabase';
import { provisionUser } from '@/lib/auth/provisionUser';
import { decideOnboardingGate } from '@/lib/auth/onboardingGate';
import { onboardingPath } from '@/lib/auth/postAuthDestination';
import { firebaseAuth } from '@/lib/auth/firebase';

function AuthGate({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const { allSites, sitesLoading } = useSite();
    const router = useRouter();
    const [profileChecked, setProfileChecked] = React.useState(false);

    // Redirect unauthenticated users to login
    React.useEffect(() => {
        if (!loading && !user) {
            router.replace('/login');
        }
    }, [user, loading, router]);

    // Decide between dashboard and onboarding.
    //
    // This waits for the site list before deciding, which is the whole fix: the
    // previous version answered from `profiles.onboarding_completed` alone and
    // pushed owners of several live stores into onboarding as new users, with
    // no exit but creating another store. `decideOnboardingGate` makes site
    // ownership the deciding fact and the flag a repairable cache — see that
    // module for why the flag cannot be trusted.
    //
    // intent=first-store hides the "← Dashboard" back button on the onboarding
    // page, preventing a bounce back to a dashboard that has nothing in it yet.
    React.useEffect(() => {
        if (loading || !user || sitesLoading) return;

        let cancelled = false;
        setProfileChecked(false);

        supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('id', user.id)
            .maybeSingle()
            .then(({ data, error }) => {
                if (cancelled) return;

                const { action, repair } = decideOnboardingGate({
                    profile: data ?? null,
                    profileError: Boolean(error),
                    siteCount: allSites.length,
                });

                if (repair) {
                    // The account owns stores, so it is onboarded no matter what
                    // the row says. Heal it now or it lands here again tomorrow.
                    //
                    // provisionUser first because the row may not exist at all —
                    // it upserts with ignoreDuplicates, so it creates the missing
                    // row and leaves an existing one alone. The update then sets
                    // the flag. /api/onboarding/complete cannot do this job: it
                    // only UPDATEs, and a zero-row update reports success.
                    void (async () => {
                        try {
                            await provisionUser(supabase, {
                                uid: user.id,
                                phone: firebaseAuth.currentUser?.phoneNumber ?? null,
                            });
                            await supabase
                                .from('profiles')
                                .update({
                                    onboarding_completed: true,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq('id', user.id);
                        } catch {
                            // Best effort. The gate already let them in on the
                            // strength of owning sites; a failed repair only
                            // means we try again next sign-in.
                        }
                    })();
                }

                if (action === 'onboard') {
                    router.replace(onboardingPath('first-store'));
                    return;
                }
                setProfileChecked(true);
            });

        return () => { cancelled = true; };
    // user.id is the stable identifier — no need to re-run when full user object ref changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, loading, router, sitesLoading, allSites.length]);

    if (loading || (user && !profileChecked) || (profileChecked && sitesLoading)) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background-light">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
                    <p className="text-sm text-gray-500">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) return null;

    return <>{children}</>;
}

function ManageShell({ children }: { children: React.ReactNode }) {
    return (
        <>
            {/* Branded splash — fixed overlay above AuthGate so it covers the
                screen from first paint (including AuthGate's own auth spinner),
                then fades out to reveal whatever is ready underneath. */}
            <BrandLoader />
            <AuthGate>
                <div className="relative flex h-screen w-full overflow-hidden bg-white font-display text-neutral-900 antialiased">
                    <Sidebar />
                    <main className="flex-1 h-full overflow-y-auto pb-20 md:pb-0">
                        <DashboardHeader />
                        <div className="px-4 md:px-8 pt-4">
                            <SubscriptionNotifications />
                        </div>
                        {children}
                    </main>
                    <MobileNav />
                </div>
            </AuthGate>
        </>
    );
}

export default function ManageLayoutClient({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <SiteProvider>
                <PlanProvider>
                    <NotificationProvider>
                        <PrinterStatusProvider>
                            <ManageShell>{children}</ManageShell>
                        </PrinterStatusProvider>
                    </NotificationProvider>
                </PlanProvider>
            </SiteProvider>
        </AuthProvider>
    );
}
