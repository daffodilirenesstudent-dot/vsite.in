// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */

// Content-Security-Policy:
// - script-src: 'unsafe-inline' is required because Next.js inlines hydration
//   data and the JSON-LD blocks are <script type="application/ld+json">.
//   We allow Razorpay (checkout SDK + cdn for fraud-detection bundle), Google
//   Tag Manager (GA), Google reCAPTCHA (Firebase phone auth), and the Material
//   Symbols stylesheet loader script.
// - connect-src: every external API the browser actually calls — Supabase
//   (REST + realtime websocket), Firebase Auth, Google's identity APIs.
// - frame-src: Razorpay's checkout iframe + reCAPTCHA challenge iframe.
// - frame-ancestors 'none': anti-clickjacking — vsite is never embedded.
// - upgrade-insecure-requests: any http:// asset references get rewritten.
const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://checkout.razorpay.com https://cdn.razorpay.com https://www.google.com https://www.gstatic.com https://*.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com",
    "connect-src 'self' blob: data: http://127.0.0.1:7878 https://*.supabase.co wss://*.supabase.co https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://api.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com https://www.google-analytics.com https://*.google-analytics.com https://o4511393511636992.ingest.us.sentry.io",
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
  automaticVercelMonitors: true,
});
