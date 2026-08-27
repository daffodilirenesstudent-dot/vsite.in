'use client';

import React from 'react';

/**
 * Skeleton loading placeholder for shop/menu cards.
 * Shows a shimmer animation while data is loading.
 */
export function ShopCardSkeleton() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
            {/* Header */}
            <div className="p-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 bg-gray-200 rounded" />
                    <div className="h-3 w-1/3 bg-gray-100 rounded" />
                </div>
                <div className="w-12 h-6 bg-gray-200 rounded-full" />
            </div>

            {/* Body */}
            <div className="px-5 pb-4 space-y-3">
                <div className="h-3 w-full bg-gray-100 rounded" />
                <div className="h-3 w-5/6 bg-gray-100 rounded" />
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-2">
                <div className="h-9 flex-1 bg-gray-100 rounded-lg" />
                <div className="h-9 flex-1 bg-gray-100 rounded-lg" />
                <div className="h-9 w-9 bg-gray-100 rounded-lg" />
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
