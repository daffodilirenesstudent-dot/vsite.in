'use client';

// 500 — unhandled exception in a route segment.
//
// Caught by Next's App Router error boundary. Brand-aligned, gives the user
// three exits (try again, go home, email support) plus a copyable error ID
// (the Next-provided `digest`) so support can correlate to server logs.
//
// `reset()` re-renders the failing tree without a full reload. We use it for
// transient errors (network blips). The "Reload" button does a hard refresh
// for cases where component state is wedged.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // TODO when Sentry lands: Sentry.captureException(error)
        console.error('[app error]', error);
    }, [error]);

    const errorId = error.digest ?? '';

    const copyId = async () => {
        if (!errorId) return;
        try {
            await navigator.clipboard.writeText(errorId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked — fall through silently
        }
    };

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(180deg, #FAFAFA 0%, #F4F4F5 100%)',
                padding: '24px 16px',
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 480,
                    background: '#FFFFFF',
                    border: '1px solid #E4E4E7',
                    borderRadius: 20,
                    padding: '32px 28px 28px',
                    boxShadow: '0 12px 32px rgba(220, 38, 38, 0.05)',
                    textAlign: 'center',
                }}
            >
                {/* Brand mark */}
                <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 24 }}>
                    <Image src="/android-chrome-192x192.png" alt="" width={28} height={28} style={{ borderRadius: 7 }} />
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#0D0439', letterSpacing: '-0.01em' }}>vsite</span>
                </Link>

                {/* Icon — amber, not red. We don't want to alarm; it's recoverable. */}
                <div
                    style={{
                        width: 72,
                        height: 72,
                        margin: '0 auto 18px',
                        borderRadius: '50%',
                        background: '#FEF3C7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#B45309' }} aria-hidden>
                        error
                    </span>
                </div>

                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', margin: 0, letterSpacing: '-0.01em' }}>
                    Something went wrong
                </h1>
                <p style={{ fontSize: 14, color: '#52525C', lineHeight: 1.55, margin: '8px 0 22px', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
                    A problem on our side stopped this page from loading. Your data is safe — try again, and if it keeps happening, share the error ID below with support.
                </p>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: errorId ? 20 : 8 }}>
                    <button
                        type="button"
                        onClick={() => reset()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
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
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                            refresh
                        </span>
                        Try again
                    </button>
                    <Link
                        href="/manage/dashboard"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            background: '#FFFFFF',
                            color: '#0A0A0A',
                            border: '1px solid #E4E4E7',
                            borderRadius: 10,
                            padding: '12px 20px',
                            fontSize: 14,
                            fontWeight: 500,
                            textDecoration: 'none',
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#52525C' }} aria-hidden>
                            dashboard
                        </span>
                        Go to dashboard
                    </Link>
                </div>

                {/* Error ID — only shown when Next supplied a digest (production). */}
                {errorId && (
                    <div
                        style={{
                            background: '#FAFAFA',
                            border: '1px solid #E4E4E7',
                            borderRadius: 10,
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                        }}
                    >
                        <div style={{ minWidth: 0, textAlign: 'left' }}>
                            <p style={{ fontSize: 10, fontWeight: 600, color: '#71717A', letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>
                                Error ID
                            </p>
                            <code
                                className="truncate"
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
                                title={errorId}
                            >
                                {errorId}
                            </code>
                        </div>
                        <button
                            type="button"
                            aria-label="Copy error ID"
                            onClick={copyId}
                            style={{
                                flexShrink: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#FFFFFF',
                                border: '1px solid #E4E4E7',
                                borderRadius: 8,
                                padding: '6px 10px',
                                fontSize: 12,
                                fontWeight: 500,
                                color: copied ? '#16A34A' : '#52525C',
                                cursor: 'pointer',
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                                {copied ? 'check' : 'content_copy'}
                            </span>
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                )}

                {/* Support escape hatch */}
                <p style={{ fontSize: 12, color: '#99A1AF', marginTop: 18, marginBottom: 0 }}>
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
    );
}
