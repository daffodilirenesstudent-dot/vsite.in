// 404 — page not found.
//
// Triggered by Next's App Router whenever a route segment can't be matched, or
// when a server component calls notFound(). Brand-aligned (Vsite purple,
// rounded-card pattern) so users don't feel like they've hit a system page
// from a different product. Three exits: dashboard, public homepage, support.

import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
    title: 'Page not found · Vsite',
    description: "The page you're looking for doesn't exist or has been moved.",
};

export default function NotFound() {
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
                    maxWidth: 460,
                    background: '#FFFFFF',
                    border: '1px solid #E4E4E7',
                    borderRadius: 20,
                    padding: '32px 28px 28px',
                    boxShadow: '0 12px 32px rgba(81, 55, 239, 0.05)',
                    textAlign: 'center',
                }}
            >
                {/* Brand mark */}
                <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 28 }}>
                    <Image src="/android-chrome-192x192.png" alt="" width={28} height={28} style={{ borderRadius: 7 }} />
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#0D0439', letterSpacing: '-0.01em' }}>vsite</span>
                </Link>

                {/* Big 404 numeral with subtle purple wash */}
                <div
                    style={{
                        position: 'relative',
                        width: 120,
                        height: 120,
                        margin: '0 auto 20px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at center, #EEEBFD 0%, #FFFFFF 70%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <span
                        style={{
                            fontSize: 52,
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #5137EF 0%, #7C6BF5 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            letterSpacing: '-0.04em',
                            lineHeight: 1,
                        }}
                    >
                        404
                    </span>
                </div>

                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', margin: 0, letterSpacing: '-0.01em' }}>
                    We can&apos;t find that page
                </h1>
                <p style={{ fontSize: 14, color: '#52525C', lineHeight: 1.55, margin: '8px 0 24px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
                    The link may be broken, the page may have been moved, or you may not have access to it.
                </p>

                {/* Primary CTA: dashboard. Secondary: home. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Link
                        href="/manage/dashboard"
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
                            textDecoration: 'none',
                            transition: 'background 0.15s',
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                            dashboard
                        </span>
                        Go to dashboard
                    </Link>
                    <Link
                        href="/"
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
                            home
                        </span>
                        Back to homepage
                    </Link>
                </div>

                {/* Support escape hatch */}
                <p style={{ fontSize: 12, color: '#99A1AF', marginTop: 22, marginBottom: 0 }}>
                    Still stuck?{' '}
                    <a
                        href="mailto:support@vsite.com"
                        style={{ color: '#5137EF', fontWeight: 500, textDecoration: 'none' }}
                    >
                        Email support
                    </a>
                </p>
            </div>
        </main>
    );
}
