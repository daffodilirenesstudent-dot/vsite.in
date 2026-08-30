import type { Metadata } from 'next';
import { CreditCard, Headset, Mail, MessageCircle, Rocket, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import Reveal from '@/components/home/Reveal';
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

/**
 * Quick topics, labelled to match the answers underneath them.
 *
 * "Orders & Payments" was the old label, but every answer in that group says
 * vsite does not handle ordering or payments — the label was promising the
 * opposite of its own contents.
 */
const quickTopics: { href: string; icon: LucideIcon; label: string }[] = [
  { href: '#setup',   icon: Rocket,            label: 'Getting started'      },
  { href: '#menu',    icon: UtensilsCrossed,   label: 'Managing your menu'   },
  { href: '#orders',  icon: MessageCircle,     label: 'Orders & commission'  },
  { href: '#account', icon: CreditCard,        label: 'Account & billing'    },
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
      <section className="border-b border-line bg-paper-2 px-5 pt-32 pb-section lg:pb-section-lg">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
            Help centre
          </p>
          <h1 className="mt-5 font-display text-h2 font-bold text-ink">
            What do you need?
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-body text-ink-70">
            Most answers are below. If yours isn’t, we’re one WhatsApp message away — and a
            person replies, not a bot.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="https://wa.me/919360706659"
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2.5 text-caption font-medium text-ink-70 transition-colors hover:border-[#1EA952]/40 hover:text-ink"
            >
              <MessageCircle className="h-4 w-4 text-[#1EA952]" strokeWidth={2.2} aria-hidden />
              Chat on WhatsApp
            </a>
            <a
              href="mailto:official@vsite.in"
              className="press inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2.5 text-caption font-medium text-ink-70 transition-colors hover:border-primary/40 hover:text-ink"
            >
              <Mail className="h-4 w-4 text-primary" strokeWidth={2.2} aria-hidden />
              Email us
            </a>
          </div>
        </div>
      </section>

      {/* Quick topic cards */}
      <section className="bg-paper px-5 py-section">
        <div className="mx-auto max-w-4xl">
          <Reveal stagger={70} className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {quickTopics.map((topic) => {
              const Icon = topic.icon;
              return (
                <a
                  key={topic.href}
                  href={topic.href}
                  data-reveal="up"
                  className="lift flex flex-col items-center gap-3 rounded-2xl border border-line bg-paper-2 p-5 text-center transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  <Icon className="h-6 w-6 text-primary" strokeWidth={2} aria-hidden />
                  <span className="text-caption font-semibold text-ink">{topic.label}</span>
                </a>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* FAQ accordion */}
      <SupportFAQ />

      {/* Still need help */}
      <section className="bg-paper px-5 py-section lg:py-section-lg">
        <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-paper-2 p-8 text-center sm:p-10">
          <Headset className="mx-auto h-8 w-8 text-primary" strokeWidth={1.8} aria-hidden />
          <h2 className="mt-5 font-display text-h3 font-bold text-ink">Still stuck?</h2>
          <p className="mx-auto mt-3 max-w-md text-caption leading-relaxed text-ink-70">
            We reply on WhatsApp within 2 hours on business days, 9am–7pm IST — in Tamil or
            English, whichever you prefer.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="https://wa.me/919360706659"
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center gap-2 rounded-full bg-[#1EA952] px-6 py-3.5 font-semibold text-white transition-colors hover:bg-[#178943] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-5 w-5" strokeWidth={2.2} aria-hidden />
              Chat on WhatsApp
            </a>
            <a
              href="mailto:official@vsite.in"
              className="press inline-flex items-center gap-2 rounded-full border border-line bg-paper px-6 py-3.5 font-semibold text-ink transition-colors hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Email us
            </a>
          </div>
        </div>
      </section>

      <FooterCTA />
    </>
  );
}
