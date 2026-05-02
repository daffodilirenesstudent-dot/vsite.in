'use client';

import React from 'react';

export default function OrdersPage() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minHeight: '60vh', gap: 16, textAlign: 'center', padding: '0 24px',
        }}>
            <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#71717A' }}>receipt_long</span>
            </div>
            <div>
                <p style={{ fontSize: 20, fontWeight: 700, color: '#0A0A0A', marginBottom: 6 }}>Orders — Coming Soon</p>
                <p style={{ fontSize: 14, color: '#71717A', maxWidth: 320 }}>
                    Real-time order management is part of the QR Ordering plan. It&apos;s on the way — stay tuned.
                </p>
            </div>
        </div>
    );
}
