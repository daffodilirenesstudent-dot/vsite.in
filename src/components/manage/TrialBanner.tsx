'use client';

import Link from 'next/link';
import { usePlan } from '@/components/PlanContext';

export default function TrialBanner() {
    const { planLoading, isSubscribed, isTrialActive, isTrialExpired, trialDaysLeft } = usePlan();

    if (planLoading) return null;

    // Paid subscription active — no banner regardless of trial status
    if (isSubscribed) return null;

    if (isTrialExpired) {
        return (
            <div className="flex items-center justify-between gap-4 bg-red-600 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <span className="material-symbols-outlined text-base shrink-0">warning</span>
                    Your free trial has ended. Your menu is now offline.
                </div>
                <Link
                    href="/manage/subscription"
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                >
                    Activate Plan →
                </Link>
            </div>
        );
    }

    if (isTrialActive) {
        // Last 5 days — amber urgency banner
        if (trialDaysLeft <= 5) {
            const dayLabel = trialDaysLeft === 0
                ? 'Your free trial ends today.'
                : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left in your free trial.`;

            return (
                <div className="flex items-center justify-between gap-4 bg-amber-500 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <span className="material-symbols-outlined text-base shrink-0">schedule</span>
                        {dayLabel} Activate a plan to keep your menu live.
                    </div>
                    <Link
                        href="/manage/subscription"
                        className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                        Activate Plan →
                    </Link>
                </div>
            );
        }

        // Days 6–14 — subtle green info banner
        return (
            <div className="flex items-center justify-between gap-4 bg-emerald-50 border-b border-emerald-100 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <span className="material-symbols-outlined text-base shrink-0 text-emerald-500" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                    You&apos;re on a 14-day free trial — {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} remaining.
                </div>
                <Link
                    href="/manage/subscription"
                    className="shrink-0 text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                >
                    View plans →
                </Link>
            </div>
        );
    }

    return null;
}
