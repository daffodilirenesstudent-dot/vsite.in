'use client';

// Global error boundary — catches failures inside the root layout itself
// (the regular `error.tsx` cannot help when the layout chain crashed). Must
// render its own <html> and <body> since the layout never mounted, and must
// stay dependency-free (no fonts, no contexts, no MUI / Tailwind utilities)
// so it works even when the bundle is partially broken.

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // TODO when Sentry lands: Sentry.captureException(error)
        // eslint-disable-next-line no-console
        console.error('[global error]', error);
    }, [error]);

    const errorId = error.digest ?? '';

    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', background: '#FAFAFA' }}>
                <main
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px 16px',
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: 460,
                            background: '#FFFFFF',
                            border: '1px solid #E4E4E7',
                            borderRadius: 20,
                            padding: '32px 28px 28px',
                            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.05)',
                            textAlign: 'center',
                        }}
                    >
                        {/* Wordmark only — no Image/Link to avoid pulling chunks that may
                            be the source of the failure. */}
                        <div style={{ marginBottom: 24 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: '#0D0439', letterSpacing: '-0.01em' }}>vsite</span>
                        </div>

                        <div
                            style={{
                                width: 72,
                                height: 72,
                                margin: '0 auto 18px',
                                borderRadius: '50%',
                                background: '#FEE2E2',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 36,
                                color: '#DC2626',
                            }}
                            aria-hidden
                        >
                            ⚠
                        </div>

                        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', margin: 0, letterSpacing: '-0.01em' }}>
                            The app failed to load
                        </h1>
                        <p style={{ fontSize: 14, color: '#52525C', lineHeight: 1.55, margin: '8px 0 24px' }}>
                            We hit an unexpected error before the page could render. Try reloading. If it keeps happening, share the error ID with our team.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                            <button
                                type="button"
                                onClick={() => reset()}
                                style={{
                                    background: '#5137EF',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: 10,
                                    padding: '12px 20px',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Try again
                            </button>
                            <button
                                type="button"
                                onClick={() => { window.location.href = '/'; }}
                                style={{
                                    background: '#FFFFFF',
                                    color: '#0A0A0A',
                                    border: '1px solid #E4E4E7',
                                    borderRadius: 10,
                                    padding: '12px 20px',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                Reload from homepage
                            </button>
                        </div>

                        {errorId && (
                            <div
                                style={{
                                    background: '#FAFAFA',
                                    border: '1px solid #E4E4E7',
                                    borderRadius: 10,
                                    padding: '10px 12px',
                                    textAlign: 'left',
                                    marginBottom: 14,
                                }}
                            >
                                <p style={{ fontSize: 10, fontWeight: 600, color: '#71717A', letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>
                                    Error ID
                                </p>
                                <code
                                    style={{
                                        display: 'block',
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: 12,
                                        color: '#0A0A0A',
                                        marginTop: 2,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {errorId}
                                </code>
                            </div>
                        )}

                        <p style={{ fontSize: 12, color: '#99A1AF', margin: 0 }}>
                            Need a hand?{' '}
                            <a
                                href={`mailto:support@vsite.com?subject=Error%20${encodeURIComponent(errorId || 'on Vsite')}`}
                                style={{ color: '#5137EF', fontWeight: 500, textDecoration: 'none' }}
                            >
                                Email support
                            </a>
                        </p>
                    </div>
                </main>
            </body>
        </html>
    );
}
