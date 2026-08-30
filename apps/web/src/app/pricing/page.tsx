import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, Gift, Info } from 'lucide-react';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import Reveal from '@/components/home/Reveal';
import { SMART_QR_MENU_LIVE_SINCE } from '@/content/roadmap';
import { NO_REFUND_SHORT } from '@/content/policy';
import PricingFAQ from './PricingFAQ';

const BASE_URL = 'https://vsite.in';

export const metadata: Metadata = {
  title: "vsite Pricing — India's Fastest-Growing Digital Menu Software | From ₹299/month",
  description:
    "India's fastest-growing digital menu software. Smart QR Menu at ₹299/mo with a 7-day free trial. No setup fee. No hidden fees. No commission.",
  alternates: { canonical: `${BASE_URL}/pricing` },
  openGraph: {
    url: `${BASE_URL}/pricing`,
    title: "vsite Pricing — India's Fastest-Growing Digital Menu Software | From ₹299/month",
    description: "India's fastest-growing digital menu software. Honest pricing for restaurants. 7-day free trial. No hidden fees. No commission.",
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

/**
 * What the ₹299 replaces, in the owner's own ledger.
 *
 * The page's whole argument is a comparison, so it states the comparison
 * rather than asking the reader to hold two numbers in their head. Figures
 * are a monthly estimate for a single-outlet mess or café printing a
 * two-colour A4 menu — deliberately conservative.
 */
const printingCosts = [
  { label: 'Reprinting menus when a price moves', amount: '₹1,200' },
  { label: 'Lamination and replacing torn cards', amount: '₹400' },
  { label: 'Running to the press and back', amount: 'half a day' },
];

// Kept for unfreeze — see @/lib/productFlags.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const qrOrderFeatures = [
  'No payment step — pay at counter when done',
  'Kitchen gets instant order notifications',
  'Orders accumulate per table until bill requested',
  'One-tap "Request Bill" button for customers',
  'Table-specific QR codes only',
];

// Kept for unfreeze — see @/lib/productFlags.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const payEatFeatures = [
  'Customers place orders directly from phone',
  'Accept UPI, GPay, PhonePe & cash',
  'Instant order to kitchen (live)',
  'Automatic billing (no manual work)',
  'Smart queue (handles rush smoothly)',
  'Sell more with faster table turnover',
];

// Kept for unfreeze — see @/lib/productFlags.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const comparisonRows = [
  { feature: 'Digital QR Menu',              qr: true,  order: true,  pay: true  },
  { feature: 'AI food photos & descriptions', qr: true,  order: true,  pay: true  },
  { feature: 'Real-time menu updates',        qr: true,  order: true,  pay: true  },
  { feature: 'NFC card + QR stickers',        qr: true,  order: true,  pay: true  },
  { feature: 'Tamil language support',        qr: true,  order: true,  pay: true  },
  { feature: 'No per-order commission',       qr: true,  order: true,  pay: true  },
  { feature: '7-day free trial',             qr: true,  order: true,  pay: true  },
  { feature: 'Customer ordering from phone',  qr: false, order: true,  pay: true  },
  { feature: 'Live kitchen notifications',    qr: false, order: true,  pay: true  },
  { feature: 'UPI / GPay / PhonePe payments', qr: false, order: false, pay: true  },
  { feature: 'Automatic billing',             qr: false, order: false, pay: true  },
];

const trialBadges = ['7-day free trial', 'No credit card needed', 'Zero commission'];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Navbar />

      {/* Hero */}
      <section className="border-b border-line bg-paper-2 px-5 pt-32 pb-section lg:pb-section-lg">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
            Simple, honest pricing
          </p>
          <h1 className="mt-5 font-display text-h2 font-bold text-ink">
            Less than what you spend<br className="hidden sm:block" /> on printing. Every month.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-body text-ink-70">
            One small monthly fee. No setup charge, no hidden extras, no per-order commission.
            Every rupee your customer pays stays yours.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {trialBadges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-caption font-medium text-ink-70"
              >
                <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The comparison the price is making.
          A price only means something next to what it replaces, so the ledger
          sits above the card rather than being implied by the headline. */}
      <section className="bg-paper px-5 py-section lg:py-section-lg">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
              What ₹299 replaces
            </p>
            <h2 className="mt-5 font-display text-h3 font-bold text-ink">
              A month of paper, roughly
            </h2>
          </Reveal>

          <Reveal stagger={80} className="mt-8 divide-y divide-line border-y border-line">
            {printingCosts.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-6 py-4">
                <span className="text-body text-ink-70">{row.label}</span>
                <span className="shrink-0 font-display text-h3 font-bold tabular-nums text-ink">
                  {row.amount}
                </span>
              </div>
            ))}
          </Reveal>

          <p className="mt-5 text-caption text-ink-45">
            Estimated for one outlet reprinting a two-colour A4 menu. Your press bill is
            probably higher.
          </p>
        </div>
      </section>

      {/* Pricing card */}
      <section className="bg-paper-2 px-5 py-section lg:py-section-lg">
        <div className="mx-auto max-w-md">

          {/* Smart QR Menu */}
          <Reveal>
            <div className="flex flex-col rounded-3xl border border-line bg-paper p-7 shadow-[0_1px_20px_rgba(18,16,14,0.05)] sm:p-8">
              <span className="inline-flex w-fit items-center rounded-full border border-line bg-paper-2 px-3 py-1 text-caption font-bold uppercase tracking-[0.08em] text-ink-70">
                Smart QR Menu
              </span>
              <p className="mt-4 text-caption text-ink-45">
                A view-only digital menu for your tables
              </p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-h2 font-bold text-ink">₹299</span>
                <span className="text-body text-ink-45">/ month</span>
              </div>

              <div className="mt-4 inline-flex items-start gap-2 rounded-xl border border-line bg-paper-2 px-3.5 py-2.5 text-caption text-ink-70">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-45" strokeWidth={2} aria-hidden />
                No setup fee · Billed every 30 days
              </div>

              <ul className="mb-8 mt-7 flex-1 space-y-3.5">
                {qrFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-body text-ink-70">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className="press group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-white shadow-md shadow-primary/25 transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Start free — 7 days
                <ArrowRight className="cta-arrow h-5 w-5" strokeWidth={2.2} aria-hidden />
              </Link>
              {/* Was "Cancel from your dashboard" — a control that does not
                  exist and does not need to. There is no mandate to cancel;
                  the period simply ends. See @/content/policy. */}
              <p className="mt-3 text-center text-caption text-ink-45">
                No card today · {NO_REFUND_SHORT}
              </p>
            </div>
          </Reveal>

          {/* What the ₹299 will also cover.
              Placed under the price rather than in the feature list: it is a
              statement about the plan, not a feature you can use yet. */}
          <Reveal delay={90}>
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-paper px-6 py-5">
              <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                Coming soon, at no extra cost
              </p>
              <p className="mt-2.5 text-caption leading-relaxed text-ink-70">
                Ordering from the table with UPI payment is not live yet. When it ships it
                is included in this ₹299 — no upgrade, no commission. The menu itself has
                been live since {SMART_QR_MENU_LIVE_SINCE}.
              </p>
            </div>
          </Reveal>

          {/* Trial note */}
          <Reveal delay={120}>
            <div className="mt-6 flex items-start gap-4 rounded-2xl border border-line bg-paper px-6 py-5">
              <Gift className="mt-0.5 h-6 w-6 shrink-0 text-primary" strokeWidth={2} aria-hidden />
              <div>
                <p className="font-semibold text-ink">
                  The first 7 days are free, in full.
                </p>
                <p className="mt-1 text-caption text-ink-70">
                  No card, no payment details, no commitment. Use the whole product for a week,
                  then decide.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <PricingFAQ />

      <FooterCTA />
    </>
  );
}
