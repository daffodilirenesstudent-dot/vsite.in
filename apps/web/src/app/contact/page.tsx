import type { Metadata } from 'next';
import { whatsappUrl } from '@/lib/platform/brand';
import Link from 'next/link';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';

export const metadata: Metadata = {
  title: 'Contact vsite — WhatsApp, Email & Phone',
  description:
    'Reach the vsite team via WhatsApp, email, or phone. We respond within 2 hours on business days.',
  alternates: {
    canonical: 'https://vsite.in/contact',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'vsite',
  url: 'https://vsite.in',
  email: 'official@vsite.in',
  description: 'AI-powered digital menu platform for Tamil Nadu restaurants.',
  areaServed: { '@type': 'State', name: 'Tamil Nadu' },
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'official@vsite.in',
      availableLanguage: ['English', 'Tamil'],
    },
  ],
};

const faqs = [
  {
    q: 'How long does setup take?',
    a: 'About 3 minutes. Upload a photo of your menu, and AI does the rest.',
  },
  {
    q: 'Do my customers need an app?',
    a: 'No. Your digital menu opens in any phone browser — no download needed.',
  },
  {
    q: 'What does the 7-day trial include?',
    a: 'Full access to every feature. No credit card required. No automatic charge.',
  },
  {
    q: 'Can I get help with setup?',
    a: 'Yes — message us on WhatsApp and we will walk you through setup live.',
  },
];

export default function ContactPage() {
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
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
            <span className="inline-block rounded-full bg-primary/10 text-primary text-xs font-bold px-3 py-1 mb-6">
              Get In Touch
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-slate-900 leading-tight mb-6">
              We&apos;re Here to Help
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Have a question, need help setting up, or want to talk to us
              before signing up? Reach us any way you prefer — we respond fast.
            </p>
          </div>
        </section>

        {/* Contact cards */}
        <section className="bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* WhatsApp */}
              <article className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-green-600">
                  chat
                </span>
                <h2 className="font-bold text-slate-900 text-base">WhatsApp</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Fastest response. Chat in English or Tamil.
                </p>
                <span className="rounded-full bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5">
                  Usually replies in &lt; 30 min
                </span>
                <a
                  href={whatsappUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2 rounded-full text-sm transition-colors"
                >
                  Open WhatsApp →
                </a>
              </article>

              {/* Email */}
              <article className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-primary">
                  mail
                </span>
                <h2 className="font-bold text-slate-900 text-base">Email</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  For detailed questions and support tickets.
                </p>
                <span className="rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                  Replies within 2 hours (business days)
                </span>
                <a
                  href="mailto:official@vsite.in"
                  className="mt-1 text-primary font-semibold text-sm hover:underline"
                >
                  official@vsite.in
                </a>
              </article>

              {/* Support Docs */}
              <article className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-slate-600">
                  help_outline
                </span>
                <h2 className="font-bold text-slate-900 text-base">
                  Support Docs
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Browse FAQs and step-by-step guides.
                </p>
                <div className="mt-auto pt-1">
                  <Link
                    href="/support"
                    className="text-primary font-semibold text-sm hover:underline"
                  >
                    Visit Support →
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ teaser */}
        <section className="bg-background-light">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
            <h2 className="text-3xl font-extrabold font-display text-slate-900 mb-3">
              Before You Reach Out
            </h2>
            <p className="text-slate-500 mb-8">
              These answer 80% of questions we receive.
            </p>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div
                  key={faq.q}
                  className="bg-white rounded-xl border border-slate-200 p-4"
                >
                  <p className="font-bold text-slate-900">{faq.q}</p>
                  <p className="text-slate-600 text-sm mt-1">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-primary text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
            <p className="text-xl font-bold font-display mb-6">
              Still have questions? We&apos;re just a message away.
            </p>
            <a
              href={whatsappUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-white text-primary hover:bg-slate-50 font-bold px-8 py-3 rounded-full transition-colors"
            >
              Message us on WhatsApp →
            </a>
          </div>
        </section>
      </main>
      <FooterCTA />
    </>
  );
}
