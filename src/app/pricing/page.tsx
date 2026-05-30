import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import PricingFAQ from './PricingFAQ';

const BASE_URL = 'https://vsite.in';

export const metadata: Metadata = {
  title: "vsite Pricing — India's Fastest-Growing Digital Menu Software | From ₹299/month",
  description:
    "India's fastest-growing digital menu software. Smart QR Menu at ₹299/mo. QR Ordering (no payment) at ₹499/mo. QR Ordering + Payment at ₹699/mo. 14-day free trial. No hidden fees. No commission.",
  alternates: { canonical: `${BASE_URL}/pricing` },
  openGraph: {
    url: `${BASE_URL}/pricing`,
    title: "vsite Pricing — India's Fastest-Growing Digital Menu Software | From ₹299/month",
    description: "India's fastest-growing digital menu software. Honest pricing for restaurants. 14-day free trial. No hidden fees. No commission.",
  },
};

const schema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'vsite',
  description: "India's fastest-growing digital menu software for restaurants, cafés, bakeries, and cloud kitchens. AI-powered QR menus live in 3 minutes.",
  applicationCategory: 'BusinessApplication',
  offers: [
    {
      '@type': 'Offer',
      name: 'Smart QR Menu',
      price: '299',
      priceCurrency: 'INR',
      description: 'Digital QR menu for restaurants. View-only. India\'s fastest-growing digital menu software — ₹299/month.',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '299',
        priceCurrency: 'INR',
        unitText: 'MONTH',
      },
    },
    {
      '@type': 'Offer',
      name: 'QR Ordering without Payment',
      price: '499',
      priceCurrency: 'INR',
      description: 'QR ordering without payment gateway. Customers order from phone, pay at counter.',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '499',
        priceCurrency: 'INR',
        unitText: 'MONTH',
      },
    },
    {
      '@type': 'Offer',
      name: 'QR Ordering + Payment',
      price: '699',
      priceCurrency: 'INR',
      description: 'Full digital ordering and UPI payment for restaurants.',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '699',
        priceCurrency: 'INR',
        unitText: 'MONTH',
      },
    },
  ],
};

const qrFeatures = [
  'Clean digital menu (no printing needed)',
  'AI-generated food images & descriptions',
  'Edit menu anytime (add/remove/update)',
  'Highlight offers & sold-out items live',
  'Works for dine-in & takeaway',
  'NFC card + QR stickers included',
];

const qrOrderFeatures = [
  'Customers order directly from their phone',
  'No payment step — pay at counter when done',
  'Kitchen gets instant order notifications',
  'Orders accumulate per table until bill requested',
  'One-tap "Request Bill" button for customers',
  'Table-specific QR codes only',
];

const payEatFeatures = [
  'Customers place orders directly from phone',
  'Accept UPI, GPay, PhonePe & cash',
  'Instant order to kitchen (live)',
  'Automatic billing (no manual work)',
  'Smart queue (handles rush smoothly)',
  'Sell more with faster table turnover',
];

const comparisonRows = [
  { feature: 'Digital QR Menu',              qr: true,  order: true,  pay: true  },
  { feature: 'AI food photos & descriptions', qr: true,  order: true,  pay: true  },
  { feature: 'Real-time menu updates',        qr: true,  order: true,  pay: true  },
  { feature: 'NFC card + QR stickers',        qr: true,  order: true,  pay: true  },
  { feature: 'Tamil language support',        qr: true,  order: true,  pay: true  },
  { feature: 'No per-order commission',       qr: true,  order: true,  pay: true  },
  { feature: '14-day free trial',             qr: true,  order: true,  pay: true  },
  { feature: 'Customer ordering from phone',  qr: false, order: true,  pay: true  },
  { feature: 'Live kitchen notifications',    qr: false, order: true,  pay: true  },
  { feature: 'UPI / GPay / PhonePe payments', qr: false, order: false, pay: true  },
  { feature: 'Automatic billing',             qr: false, order: false, pay: true  },
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 px-4 bg-background-light text-center">
        <div className="mx-auto max-w-3xl">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            Simple, Honest Pricing
          </span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold font-display text-slate-900 leading-tight">
            Less Than What You Spend<br className="hidden sm:block" /> on Printing. Every Month.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-500 max-w-2xl mx-auto">
            One-time setup. One small monthly fee. No hidden charges. No per-order commission. Your revenue stays 100% yours.
          </p>
          <p className="mt-2 text-sm font-semibold text-primary/80">
            India&apos;s fastest-growing digital menu software — trusted by restaurants across Tamil Nadu.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-sm font-medium text-green-700">
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              14-day free trial
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-sm font-medium text-green-700">
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              No credit card needed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-sm font-medium text-green-700">
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Zero commission
            </span>
          </div>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="py-14 px-4 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-6">

            {/* Smart QR Menu */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 flex flex-col shadow-sm">
              <div className="mb-6">
                <span className="inline-block border border-green-500 text-green-600 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-4">
                  Smart QR Menu
                </span>
                <p className="text-slate-500 text-sm mb-5">View-only digital menu for your tables</p>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-4xl font-extrabold font-display text-slate-900">₹299</span>
                  <span className="text-slate-400 text-sm">/ month</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
                  <span className="material-symbols-outlined text-slate-400 text-base">info</span>
                  No setup fee · Billed every 30 days
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {qrFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="material-symbols-outlined text-green-500 text-base shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="flex items-center justify-center gap-2 border-2 border-green-500 text-green-600 px-6 py-3.5 rounded-full font-bold hover:bg-green-500 hover:text-white transition-all"
              >
                Start Free — 14 Days
                <span className="material-symbols-outlined text-xl">arrow_forward</span>
              </Link>
              <p className="text-center text-xs text-slate-400 mt-2">No credit card. No commitment.</p>
            </div>

            {/* QR Ordering — Without Payment */}
            <div className="bg-white rounded-3xl border border-orange-400 p-6 sm:p-8 flex flex-col shadow-sm">
              <div className="mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="inline-block border border-orange-500 text-orange-600 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    QR Ordering
                  </span>
                  <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border border-orange-200">
                    Without Payment
                  </span>
                </div>
                <p className="text-slate-500 text-sm mb-5">Order now, pay at counter — zero payment friction</p>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-4xl font-extrabold font-display text-slate-900">₹499</span>
                  <span className="text-slate-400 text-sm">/ month</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
                  <span className="material-symbols-outlined text-slate-400 text-base">info</span>
                  No setup fee · Billed every 30 days
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                <li className="flex items-start gap-2.5 text-sm text-orange-600 font-bold">
                  <span className="w-4 shrink-0" />
                  Everything in Smart QR Menu, plus —
                </li>
                {qrOrderFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="material-symbols-outlined text-orange-500 text-base shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="flex items-center justify-center gap-2 border-2 border-orange-500 text-orange-600 px-6 py-3.5 rounded-full font-bold hover:bg-orange-500 hover:text-white transition-all"
              >
                Start Free — 14 Days
                <span className="material-symbols-outlined text-xl">arrow_forward</span>
              </Link>
              <p className="text-center text-xs text-slate-400 mt-2">No credit card. No commitment.</p>
            </div>

            {/* QR Ordering + Payment */}
            <div className="bg-white rounded-3xl border-2 border-primary p-6 sm:p-8 flex flex-col shadow-xl shadow-primary/10 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 bg-primary text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg">
                  <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  Most Popular
                </span>
              </div>
              <div className="mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="inline-block border border-primary text-primary text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    QR Ordering + Payment
                  </span>
                </div>
                <p className="text-slate-500 text-sm mb-5">Full digital ordering + UPI payment for your restaurant</p>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-4xl font-extrabold font-display text-slate-900">₹699</span>
                  <span className="text-slate-400 text-sm">/ month</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-sm text-slate-600">
                  <span className="material-symbols-outlined text-primary text-base">info</span>
                  No setup fee · Billed every 30 days
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                <li className="flex items-start gap-2.5 text-sm text-primary font-bold">
                  <span className="w-4 shrink-0" />
                  Everything in Smart QR Menu, plus —
                </li>
                {payEatFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3.5 rounded-full font-bold hover:bg-primary-dark transition-all shadow-lg shadow-primary/25"
              >
                Start Free — 14 Days
                <span className="material-symbols-outlined text-xl">arrow_forward</span>
              </Link>
              <p className="text-center text-xs text-slate-400 mt-2">No credit card. No commitment.</p>
            </div>
          </div>

          {/* Trial banner */}
          <div className="mt-6 bg-white rounded-2xl border border-primary/20 px-6 sm:px-8 py-5 flex items-start sm:items-center gap-4 shadow-sm">
            <span className="material-symbols-outlined text-primary text-3xl shrink-0">redeem</span>
            <div>
              <p className="font-bold text-slate-900">All plans include a 14-day completely free trial.</p>
              <p className="text-slate-500 text-sm mt-0.5">No credit card. No payment details. No commitment. Use the full product free for 14 days — then decide.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-14 sm:py-20 px-4 bg-background-light">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Full Breakdown</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold font-display text-slate-900">
              Everything You Get
            </h2>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50">
              <div className="px-5 py-4 text-sm font-bold text-slate-700">Feature</div>
              <div className="px-4 py-4 text-center">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">QR Menu</span>
                <div className="text-sm font-extrabold text-slate-900 mt-0.5">₹299/mo</div>
              </div>
              <div className="px-4 py-4 text-center bg-orange-50">
                <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">QR Order</span>
                <div className="text-sm font-extrabold text-orange-700 mt-0.5">₹499/mo</div>
              </div>
              <div className="px-4 py-4 text-center bg-primary/5">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Pay & Eat</span>
                <div className="text-sm font-extrabold text-primary mt-0.5">₹699/mo</div>
              </div>
            </div>
            {comparisonRows.map((row, i) => (
              <div key={row.feature} className={`grid grid-cols-4 border-b border-slate-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <div className="px-5 py-3.5 text-sm font-medium text-slate-700">{row.feature}</div>
                <div className="px-4 py-3.5 flex items-center justify-center">
                  {row.qr
                    ? <span className="material-symbols-outlined text-green-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    : <span className="text-slate-300 text-lg font-medium">—</span>
                  }
                </div>
                <div className="px-4 py-3.5 flex items-center justify-center bg-orange-50/30">
                  {row.order
                    ? <span className="material-symbols-outlined text-orange-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    : <span className="text-slate-300 text-lg font-medium">—</span>
                  }
                </div>
                <div className="px-4 py-3.5 flex items-center justify-center bg-primary/5">
                  {row.pay
                    ? <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    : <span className="text-slate-300 text-lg font-medium">—</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <PricingFAQ />

      {/* Final CTA */}
      <section className="py-14 sm:py-20 px-4 bg-primary">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-primary-light text-xs font-bold uppercase tracking-widest mb-3">
            India&apos;s Fastest-Growing Digital Menu Software
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold font-display text-white">
            Ready to Go Digital?
          </h2>
          <p className="mt-4 text-primary-light text-base sm:text-lg max-w-xl mx-auto">
            Join restaurants across Tamil Nadu. Start your 14-day free trial — no credit card, no commitment.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-white text-primary px-8 py-3.5 rounded-full font-bold hover:bg-slate-50 transition-colors shadow-lg"
            >
              Start Free Trial
              <span className="material-symbols-outlined text-xl">arrow_forward</span>
            </Link>
            <a
              href="https://wa.me/919360706659"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-2 border-white/40 text-white px-8 py-3.5 rounded-full font-bold hover:border-white/70 transition-colors"
            >
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </section>

      <FooterCTA />
    </>
  );
}
