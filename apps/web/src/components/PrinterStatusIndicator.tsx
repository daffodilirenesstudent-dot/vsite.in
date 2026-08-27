'use client';

// PrinterStatusIndicator — header chip showing the Print Bridge connection and
// per-role printer health. Click opens a popover with one row per printer
// (KOT + Counter), each with a coloured dot, role name, printer name, and a
// short state line. Mirrors the pattern used by Stripe Terminal / Square /
// Petpooja: a single always-visible icon in the global chrome.

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePrinterStatus, type PrinterRole, type PrinterRoleStatus } from './PrinterStatusContext';

// Aggregate dot colour
const DOT_COLOR = {
    online:   '#16A34A',  // green
    degraded: '#F59E0B',  // amber
    offline:  '#DC2626',  // red
    unknown:  '#A1A1AA',  // grey
} as const;

// Pretty labels + descriptions per role state.
function describe(h: PrinterRoleStatus | null): { color: string; label: string; detail: string } {
    if (!h)                            return { color: '#A1A1AA', label: 'Not configured', detail: 'No printer assigned to this role' };
    switch (h.state) {
        case 'ready':         return { color: '#16A34A', label: 'Ready',          detail: h.printerName ?? '' };
        case 'disconnected':  return { color: '#DC2626', label: 'Disconnected',   detail: 'Printer is unplugged or powered off' };
        case 'incompatible':  return { color: '#DC2626', label: 'Incompatible',   detail: 'Selected device is not a thermal printer' };
        case 'overflow':      return { color: '#F59E0B', label: 'Queue overflow', detail: `${h.queueDepth ?? 0} jobs waiting — printer can't keep up` };
        case 'not_assigned':  return { color: '#A1A1AA', label: 'Not assigned',   detail: 'Pick a printer in Settings → Printer Bridge' };
        case 'unknown':
        default:              return { color: '#A1A1AA', label: 'Unknown',        detail: '' };
    }
}

const ROLE_TITLE: Record<PrinterRole, string> = { kot: 'KOT Printer', bill: 'Counter / Bill Printer' };

export default function PrinterStatusIndicator() {
    const { bridgeReachable, roleHealth, aggregate } = usePrinterStatus();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Close on outside click + Escape
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const dotColor = DOT_COLOR[aggregate];

    // One short headline at the top of the popover
    const headline: { title: string; subtitle: string; tone: 'green' | 'amber' | 'red' | 'grey' } = (() => {
        if (aggregate === 'unknown')  return { title: 'Checking print bridge…',   subtitle: 'Polling local printer service',                                  tone: 'grey'  };
        if (aggregate === 'offline')  return { title: 'Print Bridge offline',     subtitle: 'KOTs & bills are NOT printing. Start bys-print-bridge.exe.',     tone: 'red'   };
        if (aggregate === 'degraded') return { title: 'One or more printers down', subtitle: 'Bridge is connected but a printer needs attention.',             tone: 'amber' };
        return                              { title: 'All printers online',       subtitle: 'KOTs and bills are printing normally.',                          tone: 'green' };
    })();

    const headlineColor = { green: '#16A34A', amber: '#B45309', red: '#B91C1C', grey: '#52525C' }[headline.tone];
    const headlineBg    = { green: '#F0FDF4', amber: '#FFFBEB', red: '#FEF2F2', grey: '#FAFAFA' }[headline.tone];

    return (
        <div className="relative" ref={wrapRef}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`Printer status: ${aggregate}`}
                title="Printer status"
                className="flex items-center justify-center hover:bg-neutral-50 transition-colors relative"
                style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid transparent', background: open ? '#F4F4F5' : 'transparent', cursor: 'pointer' }}
            >
                <span className="material-symbols-outlined text-[#52525C]" style={{ fontSize: 20 }}>print</span>
                {/* status dot, bottom-right of the icon */}
                <span
                    aria-hidden
                    style={{
                        position: 'absolute', right: 6, bottom: 6,
                        width: 9, height: 9, borderRadius: '50%',
                        background: dotColor,
                        border: '2px solid #FFFFFF',
                        boxShadow: aggregate === 'offline' ? '0 0 0 0 rgba(220,38,38,0.45)' : 'none',
                        animation: aggregate === 'offline' ? 'printer-pulse 1.6s ease-out infinite' : 'none',
                    }}
                />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Printer status detail"
                    className="absolute right-0 top-full mt-1.5 bg-white"
                    style={{
                        border: '1px solid #E4E4E7', borderRadius: 12,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.10)',
                        width: 320, zIndex: 100, overflow: 'hidden',
                    }}
                >
                    {/* Headline */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #F4F4F5', background: headlineBg }}>
                        <div className="flex items-center gap-2">
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                            <p style={{ fontSize: 13, fontWeight: 600, color: headlineColor, margin: 0 }}>{headline.title}</p>
                        </div>
                        <p style={{ fontSize: 12, color: '#52525C', margin: '4px 0 0', lineHeight: 1.4 }}>{headline.subtitle}</p>
                    </div>

                    {/* Per-role rows */}
                    <div style={{ padding: '6px 0' }}>
                        {(Object.keys(ROLE_TITLE) as PrinterRole[]).map(role => {
                            const h = roleHealth[role];
                            // If the bridge is unreachable, mute all rows to red/unknown.
                            const effective = bridgeReachable === false ? { ...(h ?? { state: 'unknown' as const, printerName: null }), state: 'disconnected' as const } : h;
                            const d = describe(effective ?? null);
                            return (
                                <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                                    {/* role icon box */}
                                    <div style={{
                                        width: 36, height: 36, borderRadius: 8, background: '#F4F4F5',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <span className="material-symbols-outlined text-[#52525C]" style={{ fontSize: 18 }}>
                                            {role === 'kot' ? 'restaurant' : 'receipt_long'}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="flex items-center gap-1.5">
                                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0A0A0A' }}>{ROLE_TITLE[role]}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: 11.5, color: d.color, fontWeight: 500 }}>{d.label}</span>
                                            {effective?.printerName && d.label === 'Ready' && (
                                                <span className="truncate" style={{ fontSize: 11, color: '#71717A' }}>· {effective.printerName}</span>
                                            )}
                                        </div>
                                        {d.detail && d.label !== 'Ready' && (
                                            <p className="truncate" style={{ fontSize: 11, color: '#71717A', margin: '2px 0 0' }}>{d.detail}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer action */}
                    <div style={{ borderTop: '1px solid #F4F4F5', padding: '8px 8px' }}>
                        <Link
                            href="/manage/settings?tab=printer"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between hover:bg-neutral-50 transition-colors"
                            style={{ padding: '8px 12px', borderRadius: 8, textDecoration: 'none', color: '#0A0A0A' }}
                        >
                            <span style={{ fontSize: 12.5, fontWeight: 500 }}>Open printer settings</span>
                            <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 16 }}>chevron_right</span>
                        </Link>
                    </div>

                    <style>{`@keyframes printer-pulse {
                        0%   { box-shadow: 0 0 0 0   rgba(220,38,38,0.55); }
                        70%  { box-shadow: 0 0 0 6px rgba(220,38,38,0);    }
                        100% { box-shadow: 0 0 0 0   rgba(220,38,38,0);    }
                    }`}</style>
                </div>
            )}
        </div>
    );
}
