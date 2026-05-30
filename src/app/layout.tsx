import type { Metadata } from "next";
import { Outfit, Poppins, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const BASE_URL = "https://vsite.in";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  applicationName: "Vsite",
  title: {
    default: "Vsite: Digital Menu Software for Restaurants & F&B in India",
    template: "%s | Vsite",
  },
  description:
    "Vsite simplifies restaurant menu management with AI-powered QR menus, real-time updates, and UPI ordering. Built for India's F&B SMBs — restaurants, cafés, bakeries, cloud kitchens. ₹299/month, no commission. Free 14-day trial.",
  keywords: [
    "digital menu for restaurant India",
    "QR menu for restaurant",
    "restaurant digital menu software",
    "AI menu builder restaurant",
    "QR code menu Tamil Nadu",
    "online menu creator restaurant",
  ],
  authors: [{ name: "Vsite", url: BASE_URL }],
  creator: "Vsite",
  publisher: "Vsite",
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: BASE_URL,
    siteName: "Vsite",
    title: "Vsite: Digital Menu Software for Restaurants & F&B in India",
    description:
      "Vsite simplifies menu management for India's F&B SMBs with AI-powered QR menus, real-time updates, and UPI ordering. ₹299/month, no commission, Tamil support.",
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Vsite — Digital Menu Software for Indian Restaurants",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vsite: Digital Menu Software for Restaurants & F&B in India",
    description:
      "AI-powered QR menus, real-time updates, UPI ordering. ₹299/month, no commission.",
    images: [`${BASE_URL}/og-image.png`],
    creator: "@vsitein",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
    other: [
      { rel: "manifest", url: "/site.webmanifest" },
    ],
  },
  verification: {
    google: "512uaJRwPeBJIayuc09rSmf2cMpLgJnZnm99IoxXZeU",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Vsite",
    alternateName: "vsite.in",
    legalName: "Vsite",
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description:
      "AI-powered digital menu and QR ordering platform for India's food and beverage SMBs — restaurants, cafés, bakeries, cloud kitchens, and more.",
    areaServed: {
      "@type": "State",
      name: "Tamil Nadu",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "official@vsite.in",
      availableLanguage: ["English", "Tamil"],
    },
    sameAs: [
      "https://www.linkedin.com/company/vsitein",
      "https://www.instagram.com/vsitein",
    ],
  };

  // WebSite schema — Google uses `name` here as the canonical site name
  // shown next to the favicon in search results. `alternateName` covers
  // the domain-form so Google never falls back to "vsite.in".
  // See https://developers.google.com/search/docs/appearance/site-names
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Vsite",
    alternateName: ["vsite", "vsite.in"],
    url: BASE_URL,
    publisher: {
      "@type": "Organization",
      name: "Vsite",
      url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/logo.png` },
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/shop/{search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en">
      <head>
        {/* Warm up critical third-party connections during the HTML parse —
            eliminates DNS + TCP + TLS cost when the first call to each origin
            actually fires. Critical on 4G where each handshake is 200–600 ms. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://wdnruubljlwrduxnvuhr.supabase.co" />
        <link rel="dns-prefetch" href="https://wdnruubljlwrduxnvuhr.supabase.co" />
        <link rel="dns-prefetch" href="https://identitytoolkit.googleapis.com" />
        <link rel="dns-prefetch" href="https://securetoken.googleapis.com" />
        <link rel="dns-prefetch" href="https://www.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.razorpay.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body className={`${outfit.variable} ${poppins.variable} ${manrope.variable} antialiased font-sans`}>
        {children}
        <ToastProvider />
        {/* Google Analytics — lazyOnload so it never competes with critical
            JS on 4G. Analytics tags can wait; the user clicking through can't. */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-G34V48QMN9"
          strategy="lazyOnload"
        />
        <Script
          id="google-analytics"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-G34V48QMN9');
            `,
          }}
        />
        {/* Microsoft Clarity — session recording + heatmaps. Lazy-loaded so it
            doesn't compete with critical JS on 4G. */}
        <Script
          id="microsoft-clarity"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "wx6iwpy979");
            `,
          }}
        />
        {/* Load Material Symbols after page is interactive — removes render-blocking stylesheet from critical path */}
        <Script
          id="material-symbols"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
                document.head.appendChild(link);
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
