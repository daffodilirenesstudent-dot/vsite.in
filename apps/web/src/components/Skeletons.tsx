'use client';

import React from 'react';

/**
 * Skeleton placeholder for a shop/menu card.
 *
 * The card used to carry `animate-pulse`, which fades the WHOLE block in and
 * out — at a glance that reads as the page flickering rather than loading. The
 * shared `.vs-skeleton` sweeps a highlight across each placeholder instead, in
 * the same direction as the spinner's bar stagger, so a screen showing both
 * reads as one system. See components/loading/.
 */
export function ShopCardSkeleton() {
    return (
        <div aria-hidden="true" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-5 flex items-center gap-4">
                <div className="vs-skeleton w-14 h-14 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="vs-skeleton h-4 w-2/3 rounded" />
                    <div className="vs-skeleton h-3 w-1/3 rounded" />
                </div>
                <div className="vs-skeleton w-12 h-6 rounded-full" />
            </div>

            {/* Body */}
            <div className="px-5 pb-4 space-y-3">
                <div className="vs-skeleton h-3 w-full rounded" />
                <div className="vs-skeleton h-3 w-5/6 rounded" />
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-2">
                <div className="vs-skeleton h-9 flex-1 rounded-lg" />
                <div className="vs-skeleton h-9 flex-1 rounded-lg" />
                <div className="vs-skeleton h-9 w-9 rounded-lg" />
            </div>
        </div>
    );
}

/**
 * Full page skeleton for shop/menu listing pages.
 */
export function PageSkeleton({ count = 2 }: { count?: number }) {
    return (
        <div className="flex flex-col gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <ShopCardSkeleton key={i} />
            ))}
        </div>
    );
}
