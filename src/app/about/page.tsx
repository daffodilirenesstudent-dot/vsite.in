import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';

export const metadata: Metadata = {
  title: "About vsite — India's Fastest-Growing Digital Menu Software",
  description:
    "vsite is India's fastest-growing digital menu software — AI-powered QR menus built for South Indian restaurants. Learn about our mission and story.",
  alternates: {
    canonical: 'https://vsite.in/about',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'vsite',
  url: 'https://vsite.in',
  email: 'official@vsite.in',
  description:
    "India's fastest-growing digital menu software — AI-powered QR menus and ordering for restaurants across South India.",
  foundingLocation: { '@type': 'Place', name: 'Tamil Nadu, India' },
  areaServed: [
    { '@type': 'City', name: 'Chennai' },
    { '@type': 'City', name: 'Coimbatore' },
    { '@type': 'City', name: 'Madurai' },
    { '@type': 'City', name: 'Salem' },
    { '@type': 'City', name: 'Trichy' },
  ],
  knowsLanguage: ['en', 'ta'],
};

const stats = [
  { value: '400,000+', label: 'Restaurants in Tamil Nadu' },
  { value: '3 min', label: 'Average setup time' },
  { value: '₹299', label: 'Starting monthly price' },
  { value: '14 days', label: 'Free to try' },
];

const values = [
  {
    icon: 'savings',
    title: 'Honest Pricing',
    description:
      'No commissions. No hidden fees. No per-order cuts. You keep 100% of what your customers pay.',
  },
  {
    icon: 'bolt',
    title: 'Built for Speed',
    description:
      '3 minutes from photo to live digital menu. We respect your time. Complex setup is our problem, not yours.',
  },
  {
    icon: 'translate',
    title: 'Made for Tamil Nadu',
    description:
      'English and Tamil. Designed for tiffin centres, cafés, hotels, and food trucks. Built with local context in mind.',
  },
];

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main>
        {/* Hero */}
        <section className="bg-background-light pt-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
            <span className="inline-block rounded-full bg-primary/10 text-primary text-xs font-bold px-3 py-1 mb-4">
              Made in Tamil Nadu 🇮🇳
            </span>
            <p className="text-xs font-bold uppercase tracking-widest text-primary/60 mb-6">
              India&apos;s Fastest-Growing Digital Menu Software
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-slate-900 leading-tight mb-6">
              We Build for the Restaurant Owner, Not the Enterprise
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              vsite started with one observation — every restaurant owner in
              Tamil Nadu was still printing paper menus that cost money, went
              outdated, and couldn&apos;t accept digital orders. We built the tool
              we wish existed: AI-powered, live in 3 minutes, priced for a
              small business owner, made for South India. Today, vsite is
              India&apos;s fastest-growing digital menu software — trusted by
              restaurants across Tamil Nadu.
            </p>
          </div>
        </section>

        {/* Stats bar */}
        <section className="bg-white border-y border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <p className="text-3xl font-extrabold font-display text-primary mb-1">
                    {stat.value}
                  </p>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Story */}
        <section className="bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
            <h2 className="text-3xl font-extrabold font-display text-slate-900 mb-8">
              Our Story
            </h2>
            <div className="space-y-6 text-slate-600 text-base leading-relaxed">
              <p>
                The idea for vsite came from watching restaurant owners — tiffin
                centres, family cafés, small hotels — spend money every month
                printing new menus the moment a price changed or a dish sold
                out. A paper menu can&apos;t tell a customer which items are
                available today. It can&apos;t accept a payment. It can&apos;t be
                updated at 11pm when tomorrow&apos;s special is confirmed.
              </p>
              <p>
                We believed restaurants in Tamil Nadu deserved the same digital
                tools that restaurant chains in Mumbai and Delhi had — without
                the enterprise price tag, without the Zomato commission, and
                without needing a tech team to set it up. So we built vsite.
                Upload a photo of your existing menu. Our AI reads it, generates
                professional food photos, writes item descriptions, and creates
                your complete digital storefront — in under 3 minutes.
              </p>
              <p>
                Today vsite powers restaurants across Tamil Nadu — from tiffin
                centres in Coimbatore to cafés in Chennai. We are a small team
                with a clear mission: make professional digital menus accessible
                to every restaurant owner in South India, at a price that makes
                sense.
              </p>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="bg-background-light">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
            <h2 className="text-3xl font-extrabold font-display text-slate-900 mb-10 text-center">
              What We Stand For
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {values.map((v) => (
                <article
                  key={v.title}
                  className="bg-white rounded-2xl border border-slate-200 p-6"
                >
                  <span className="material-symbols-outlined text-3xl text-primary mb-4 block">
                    {v.icon}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    {v.title}
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {v.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold font-display mb-4">
              Ready to Go Digital?
            </h2>
            <p className="text-white/80 text-lg mb-8">
              14-day free trial. No credit card. No commitment. Just your
              restaurant, online.
            </p>
            <Link
              href="/signup"
              className="inline-block bg-white text-primary hover:bg-slate-50 font-bold px-8 py-3 rounded-full transition-colors"
            >
              Start Free Trial →
            </Link>
          </div>
        </section>
      </main>
      <FooterCTA />
    </>
  );
}
