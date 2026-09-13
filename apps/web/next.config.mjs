// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */

// Content-Security-Policy:
// - script-src: 'unsafe-inline' is required because Next.js inlines hydration
//   data and the JSON-LD blocks are <script type="application/ld+json">.
//   We allow Razorpay (checkout SDK + cdn for fraud-detection bundle), Google
//   Tag Manager (GA), Google reCAPTCHA (Firebase phone auth), and the Material
//   Symbols stylesheet loader script.
//
//   'unsafe-eval' WAS here and has been removed (2026-09 assessment, Finding 13).
//   It was never explained, and with 'unsafe-inline' beside it the policy had no
//   XSS value at all — it was functioning purely as a resource allowlist.
//
//   ✅ VERIFIED 2026-09-12 against a PRODUCTION build: the full phone-OTP path
//   (reCAPTCHA init → OTP send → verify → token → session cookie → dashboard)
//   runs with zero CSP violations. reCAPTCHA does not need eval.
//
//   ⚠ RE-TEST ONLY AGAINST `npm run build && npm run start`. Do not restore
//   'unsafe-eval' to the PRODUCTION policy on the strength of a `npm run dev`
//   console error — that runtime does not exist in a production bundle.
//
//   ── Correction, 2026-09-13 ──────────────────────────────────────────────
//   The note above called the dev error a "false positive". It is a false
//   positive about production RISK, but it is not cosmetic: `next dev`
//   compiles with webpack devtool 'eval-source-map', so EVERY client module is
//   wrapped in eval(), not just Fast Refresh. With the token absent, nothing
//   on the client executes — the dev server serves server-rendered HTML that
//   never hydrates, which reads as a blank page, not a warning.
//
//   So the token is restored for DEVELOPMENT ONLY, below. The production
//   header is byte-identical to what the 2026-09 assessment signed off:
//   SCRIPT_SRC is the signed-off literal and the dev branch only appends to
//   it, so there is no second copy to drift. Asserted by
//   tests/security/configHardening.test.ts.
//
//   Razorpay Checkout has NOT been exercised under this policy (it needs a live
//   test-mode payment). It is believed fine — it is a plain iframe SDK — but if
//   checkout breaks, restore the single token here rather than widening anything
//   else, and record which bundle needed it.
//
//   Still outstanding, deliberately not changed in the same pass: script-src
//   allows https://*.googleapis.com, which is broader than anything known to be
//   loaded. Narrowing it is worth doing, but changing two things at once makes a
//   breakage hard to attribute — do it as its own change.
// - connect-src: every external API the browser actually calls — Supabase
//   (REST + realtime websocket), Firebase Auth, Google's identity APIs.
// - frame-src: Razorpay's checkout iframe + reCAPTCHA challenge iframe.
// - frame-ancestors 'none': anti-clickjacking — vsite is never embedded.
// - upgrade-insecure-requests: any http:// asset references get rewritten.
const isDev = process.env.NODE_ENV !== 'production';

/** The signed-off production policy. Never conditionally spelled. */
const SCRIPT_SRC = "script-src 'self' 'unsafe-inline' https://*.clarity.ms https://www.googletagmanager.com https://www.google-analytics.com https://checkout.razorpay.com https://cdn.razorpay.com https://www.google.com https://www.gstatic.com https://*.googleapis.com";

// Appended, never substituted — so the production string above stays the one
// source of truth and cannot drift from a second hand-maintained copy.
const scriptSrc = isDev ? `${SCRIPT_SRC} 'unsafe-eval'` : SCRIPT_SRC;

const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.clarity.ms https://*.supabase.co https://lh3.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com",
    "connect-src 'self' blob: data: https://*.clarity.ms http://127.0.0.1:7878 https://*.supabase.co wss://*.supabase.co https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://api.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com https://www.google-analytics.com https://*.google-analytics.com https://o4511393511636992.ingest.us.sentry.io",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.google.com https://www.gstatic.com",
    "form-action 'self'",
    "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com"), accelerometer=(self "https://checkout.razorpay.com"), gyroscope=(self "https://checkout.razorpay.com"), interest-cohort=()' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    // Allow `Cross-Origin-Resource-Policy` to default to same-origin —
    // explicitly setting it forces every CDN and image host to opt-in.
];

const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'wdnruubljlwrduxnvuhr.supabase.co',
                port: '',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },
    eslint: {
        ignoreDuringBuilds: false,
    },
    poweredByHeader: false, // strip X-Powered-By: Next.js — info disclosure noise
    async redirects() {
        return [
            // The QR-ordering products are frozen and this post's slug encodes
            // both the product and its price, so it cannot be fixed by a copy
            // edit. A 301 preserves the link equity on the live product page.
            // Remove this when the ordering plans come back.
            {
                source: '/blog/qr-ordering-without-payment-restaurant-india-499',
                destination: '/qr-menu',
                permanent: true,
            },
        ];
    },
    async headers() {
        return [
            {
                // Apply to all paths
                source: '/:path*',
                headers: securityHeaders,
            },
        ];
    },
};

export default withSentryConfig(nextConfig, {
  org: 'vsite',
  project: 'javascript-nextjs',
  // Suppresses source map upload logs during build
  silent: !process.env.CI,
  // Upload source maps so Sentry shows real TypeScript line numbers
  widenClientFileUpload: true,
  // Hides source maps from the browser bundle (they're uploaded to Sentry only)
  hideSourceMaps: true,
  // Automatically tree-shake Sentry logger statements
  disableLogger: true,
  // Automatically instrument Vercel cron monitors
  automaticVercelMonitors: false,
});
