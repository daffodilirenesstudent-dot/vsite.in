'use client';

// PrinterStatusContext — single source of truth for the Print Bridge connection
// and per-role printer health. Polls http://127.0.0.1:7878/status every 30s and
// exposes the result so any consumer (header indicator, orders page, settings)
// reads the same state without each one running its own poll.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type PrinterRole = 'kot' | 'bill';
export type PrinterRoleState = 'ready' | 'disconnected' | 'incompatible' | 'overflow' | 'not_assigned' | 'unknown';

export interface PrinterRoleStatus {
    state:       PrinterRoleState;
    printerName: string | null;
    lastError?:  string | null;
    queueDepth?: number;
}

export type Aggregate = 'unknown' | 'offline' | 'degraded' | 'online';

interface Ctx {
    /** null until the first poll resolves */
    bridgeReachable: boolean | null;
    roleHealth:      Record<PrinterRole, PrinterRoleStatus | null>;
    /** auth token from the bridge for POST /print. Empty string until known. */
    bridgeToken:     string;
    /** convenience aggregate for the header dot */
    aggregate:       Aggregate;
    /** force an immediate re-poll (used by Settings after reconfig) */
    refresh:         () => void;
}

const PrinterStatusCtx = createContext<Ctx | null>(null);

const BRIDGE_URL = 'http://127.0.0.1:7878/status';
const POLL_MS    = 30_000;

function computeAggregate(reachable: boolean | null, roles: Record<PrinterRole, PrinterRoleStatus | null>): Aggregate {
    if (reachable === null) return 'unknown';
    if (reachable === false) return 'offline';
    const bad = Object.values(roles).some(h =>
        h && (h.state === 'disconnected' || h.state === 'incompatible' || h.state === 'overflow'),
    );
    return bad ? 'degraded' : 'online';
}

export function PrinterStatusProvider({ children }: { children: React.ReactNode }) {
    const [bridgeReachable, setBridgeReachable] = useState<boolean | null>(null);
    const [roleHealth, setRoleHealth] = useState<Record<PrinterRole, PrinterRoleStatus | null>>({ kot: null, bill: null });
    const tokenRef = useRef<string>('');
    const tickRef  = useRef(0);

    useEffect(() => {
        let cancelled = false;

        const fetchStatus = async () => {
            try {
                const res = await fetch(BRIDGE_URL, { signal: AbortSignal.timeout(2500) });
                if (!res.ok) { if (!cancelled) setBridgeReachable(false); return; }
                const json = await res.json();
                if (cancelled) return;

                setBridgeReachable(true);
                const tok = json?.config?.token;
                if (typeof tok === 'string' && tok.length >= 16) tokenRef.current = tok;

                const rs = json?.roleStatus ?? {};
                setRoleHealth({
                    kot:  rs.kot  ? { state: rs.kot.state,  printerName: rs.kot.printerName  ?? null, lastError: rs.kot.lastError  ?? null, queueDepth: rs.kot.queueDepth  ?? 0 } : null,
                    bill: rs.bill ? { state: rs.bill.state, printerName: rs.bill.printerName ?? null, lastError: rs.bill.lastError ?? null, queueDepth: rs.bill.queueDepth ?? 0 } : null,
                });
            } catch {
                if (!cancelled) setBridgeReachable(false);
            }
        };

        fetchStatus();
        const id = setInterval(fetchStatus, POLL_MS);
        return () => { cancelled = true; clearInterval(id); };
        // tickRef bump triggers re-mount of effect via dependency
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tickRef.current]);

    const aggregate = computeAggregate(bridgeReachable, roleHealth);

    return (
        <PrinterStatusCtx.Provider value={{
            bridgeReachable,
            roleHealth,
            bridgeToken: tokenRef.current,
            aggregate,
            refresh: () => { tickRef.current += 1; },
        }}>
            {children}
        </PrinterStatusCtx.Provider>
    );
}

export function usePrinterStatus(): Ctx {
    const ctx = useContext(PrinterStatusCtx);
    if (!ctx) {
        // Safe fallback so pages outside /manage don't crash if they import this.
        return {
            bridgeReachable: null,
            roleHealth:      { kot: null, bill: null },
            bridgeToken:     '',
            aggregate:       'unknown',
            refresh:         () => {},
        };
    }
    return ctx;
}
