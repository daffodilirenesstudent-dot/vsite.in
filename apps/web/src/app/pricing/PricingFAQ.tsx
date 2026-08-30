import { ChevronDown } from 'lucide-react';
import Reveal from '@/components/home/Reveal';

/**
 * Pricing objections, ordered by how much each one costs to leave unanswered.
 *
 * Native <details>/<summary> for the same reasons as the homepage FAQ:
 * keyboard accessible, works without JS, and the answers stay in the DOM for
 * Google. This dropped the component's `useState` and its 'use client'
 * boundary along with it.
 */

const FAQS = [
  {
    q: 'Is there a setup fee?',
    a: '₹299 a month is the whole bill. Store creation, AI menu scanning, food photo matching, the NFC card, the QR stickers and onboarding are all inside it.',
  },
  {
    q: 'Do you take a cut of my sales?',
    a: 'No. Your customers pay you exactly as they do today — cash, card, or your own UPI QR. Nothing is routed through vsite, so there is no commission and no settlement delay.',
  },
  {
    q: 'What happens after the 7 free days?',
    a: 'We ask you to pay ₹299. If you do not, the menu pauses — nothing is deleted, and it comes straight back whenever you return. We never take a card before day 8.',
  },
  {
    q: 'Is there more than one plan?',
    a: 'No. One product, one price: the Smart QR Menu at ₹299 a month, everything included. Nothing to compare, no upgrade waiting for you.',
  },
  {
    q: 'I have several branches. Is there a better rate?',
    a: 'Yes — three branches or more gets a discount. Message us on WhatsApp and we will price it for your outlets.',
  },
];

export default function PricingFAQ() {
  return (
    <section className="bg-paper px-5 py-section lg:py-section-lg">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 lg:flex-row lg:gap-16">
        <Reveal className="lg:w-80 lg:shrink-0">
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
            Before you pay
          </p>
          <h2 className="mt-5 font-display text-h2 font-bold text-ink">
            What the ₹299 does and does not cover.
          </h2>
        </Reveal>

        <Reveal className="flex flex-1 flex-col" stagger={70}>
          {FAQS.map((f, i) => (
            <details
              key={f.q}
              data-reveal="up"
              open={i === 0}
              className={`group border-t border-[#D9D3C8] ${i === FAQS.length - 1 ? 'border-b' : ''}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 text-left text-[17px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-ink-45 transition-transform duration-300 ease-out-expo group-open:rotate-180"
                  strokeWidth={2}
                  aria-hidden
                />
              </summary>
              <p className="pb-6 pr-9 text-base leading-relaxed text-ink-70">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
