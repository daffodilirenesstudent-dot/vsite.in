'use client';

// THROWAWAY preview route for visually checking the onboarding overlays
// without running a real signup (which would create a real store). Delete
// after screenshotting — it is not part of the app.

import { useState } from 'react';
import ScanningOverlay from '../onboarding/components/ScanningOverlay';
import LaunchLoadingScreen from '../onboarding/components/LaunchLoadingScreen';

export default function PreviewPage() {
    const [view, setView] = useState<'scan' | 'launching' | 'success'>('scan');

    return (
        <div style={{ minHeight: '100vh', background: '#fff' }}>
            <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999, display: 'flex', gap: 6 }}>
                {(['scan', 'launching', 'success'] as const).map(v => (
                    <button
                        key={v}
                        id={`preview-${v}`}
                        onClick={() => setView(v)}
                        style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 6, background: view === v ? '#5137EF' : '#fff', color: view === v ? '#fff' : '#000' }}
                    >
                        {v}
                    </button>
                ))}
            </div>

            {view === 'scan' && (
                <ScanningOverlay show itemCount={null} onCountUpDone={() => {}} />
            )}
            {view === 'launching' && (
                <LaunchLoadingScreen
                    show
                    done={false}
                    itemCount={8}
                    slug="cream-story"
                    shopName="Anbu Mess"
                    onRedirect={() => {}}
                />
            )}
            {view === 'success' && (
                <LaunchLoadingScreen
                    show
                    done
                    itemCount={8}
                    slug="cream-story"
                    shopName="Anbu Mess"
                    onRedirect={() => {}}
                />
            )}
        </div>
    );
}
