import type { Metadata } from 'next';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import SupportFAQ from './SupportFAQ';
import { FAQ_GROUPS } from './faqData';

const BASE_URL = 'https://vsite.in';

export const metadata: Metadata = {
  title: 'vsite Support — Help Centre & FAQ',
  description:
    'Find answers, tutorials, and contact our support team. Get help setting up your digital menu, orders, and NFC card.',
  alternates: { canonical: `${BASE_URL}/support` },
  openGraph: {
    url: `${BASE_URL}/support`,
    title: 'vsite Support — Help Centre & FAQ',
    description: 'Find answers, tutorials, and contact the vsite support team.',
  },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_GROUPS.flatMap((g) =>
    g.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    }))
  ),
};

const quickTopics = [
  { href: '#setup',   icon: 'rocket_launch',   label: 'Getting Started'  },
  { href: '#menu',    icon: 'restaurant_menu',  label: 'Menu Management'  },
  { href: '#orders',  icon: 'shopping_bag',     label: 'Orders & Payments'},
  { href: '#account', icon: 'settings',         label: 'Account & Billing'},
];

export default function SupportPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-14 px-4 bg-background-light text-center">
        <div className="mx-auto max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Help Centre</span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold font-display text-slate-900 leading-tight">
            How Can We Help?
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-500">
            Find answers instantly below. If you don&apos;t find what you need, we&apos;re one WhatsApp message away.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://wa.me/919360706659"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-4 py-2 hover:bg-green-100 transition-colors"
            >
              <span className="material-symbols-outlined text-base">chat</span>
              Chat on WhatsApp
            </a>
            <a
              href="mailto:official@vsite.in"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium px-4 py-2 hover:bg-primary/15 transition-colors"
            >
              <span className="material-symbols-outlined text-base">mail</span>
              Email Us
            </a>
          </div>
        </div>
      </section>

      {/* Quick topic cards */}
      <section className="py-10 px-4 bg-white border-b border-slate-100">
        <div className="mx-auto max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickTopics.map((topic) => (
            <a
              key={topic.href}
              href={topic.href}
              className="flex flex-col items-center gap-2 bg-background-light rounded-xl p-4 text-center border border-slate-200 hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <span className="material-symbols-outlined text-primary text-3xl">{topic.icon}</span>
              <span className="text-sm font-semibold text-slate-700">{topic.label}</span>
            </a>
          ))}
        </div>
      </section>

      {/* FAQ accordion */}
      <SupportFAQ />

      {/* Still need help */}
      <section className="py-14 px-4 bg-white">
        <div className="mx-auto max-w-2xl border border-slate-200 rounded-2xl p-8 text-center">
          <span className="material-symbols-outlined text-primary text-4xl">headset_mic</span>
          <h2 className="mt-4 text-2xl font-bold font-display text-slate-900">Still Need Help?</h2>
          <p className="mt-2 text-slate-500 text-sm leading-relaxed">
            Our support team responds on WhatsApp within 30 minutes during business hours (9am–7pm IST).
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://wa.me/919360706659"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-full font-bold hover:bg-green-600 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">chat</span>
              Chat on WhatsApp
            </a>
            <a
              href="mailto:official@vsite.in"
              className="inline-flex items-center gap-2 border-2 border-primary text-primary px-6 py-3 rounded-full font-bold hover:bg-primary hover:text-white transition-colors"
            >
              Email Us
            </a>
          </div>
        </div>
      </section>

      <FooterCTA />
    </>
  );
}
