'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

/**
 * Custom hook for pull-to-refresh functionality on mobile.
 * Returns `refreshing` state and a `handleRefresh` callback.
 * 
 * Usage:
 *   const { refreshing, handleRefresh } = usePullToRefresh(fetchData);
 *   <button onClick={handleRefresh} disabled={refreshing}>Refresh</button>
 */
export function usePullToRefresh(fetchFn: () => Promise<void>) {
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await fetchFn();
            toast.success('Refreshed!', { duration: 1500 });
        } catch {
            toast.error('Failed to refresh');
        } finally {
            setRefreshing(false);
        }
    }, [fetchFn, refreshing]);

    return { refreshing, handleRefresh };
}
