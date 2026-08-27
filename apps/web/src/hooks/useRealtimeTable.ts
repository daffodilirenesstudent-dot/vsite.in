'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

// Supabase's RealtimePostgresChangesPayload constrains the row type to a string-keyed
// any-valued shape. Mirror that so callers can pass our concrete domain types directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RowShape = { [key: string]: any };

type Options<Row extends RowShape> = {
    /** Postgres table name to subscribe to (no schema prefix). */
    table: string;
    /** Postgres-row filter, e.g. `user_id=eq.<uid>` or `id=eq.<row-id>`. Optional. */
    filter?: string;
    /** Event type to listen for. Defaults to '*' (all). */
    event?: Event;
    /** Stable callback fired for every matching change. */
    onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
    /** When false, the subscription is skipped entirely (e.g. before user is loaded). */
    enabled?: boolean;
};

/**
 * Subscribes to Postgres changes via Supabase Realtime and invokes `onChange`
 * for every matching row event. Each call gets its own dedicated channel name
 * (timestamped) so multiple components can subscribe independently without
 * collisions.
 *
 * The hook unsubscribes on unmount and on filter/table changes — preventing
 * the classic memory-leak where a component re-mounts and stacks channels.
 *
 * Caller responsibility: pass a stable `onChange` (wrap in useCallback or use
 * a ref) so the subscription doesn't tear down on every render.
 */
export function useRealtimeTable<Row extends RowShape = RowShape>({
    table,
    filter,
    event = '*',
    onChange,
    enabled = true,
}: Options<Row>) {
    const callbackRef = useRef(onChange);
    // Keep latest callback in a ref so we don't have to re-subscribe when it changes.
    callbackRef.current = onChange;

    useEffect(() => {
        if (!enabled) return;

        const channelName = `rt:${table}:${filter ?? 'all'}:${Math.random().toString(36).slice(2, 8)}`;
        const channel = supabase
            .channel(channelName)
            .on(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'postgres_changes' as any,
                { event, schema: 'public', table, filter },
                (payload: RealtimePostgresChangesPayload<Row>) => callbackRef.current(payload),
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [table, filter, event, enabled]);
}
