import { ChevronDown } from 'lucide-react';
import Reveal from '@/components/home/Reveal';
import { FAQ_GROUPS } from './faqData';

/**
 * The help centre, grouped.
 *
 * Native <details>/<summary> replaces the `useState` accordion: keyboard
 * accessible for free, works with JS off, and — the reason that matters for a
 * support page — the answers stay in the DOM, so Google can index them and a
 * browser's own find-in-page can reach them without the reader opening every
 * row first. The component no longer needs a client boundary.
 */

export default function SupportFAQ() {
  return (
    <section className="bg-paper-2 px-5 py-section lg:py-section-lg">
      <div className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
            Answers
          </p>
          <h2 className="mt-5 font-display text-h2 font-bold text-ink">
            The questions we get most.
          </h2>
        </Reveal>

        <div className="mt-12 space-y-12">
          {FAQ_GROUPS.map((group) => (
            <div key={group.id} id={group.id} className="scroll-mt-28">
              <h3 className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                {group.label}
              </h3>
              <div className="mt-3 flex flex-col">
                {group.items.map((item, i) => (
                  <details
                    key={item.id}
                    className={`group border-t border-[#D9D3C8] ${
                      i === group.items.length - 1 ? 'border-b' : ''
                    }`}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[17px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <ChevronDown
                        className="h-5 w-5 shrink-0 text-ink-45 transition-transform duration-300 ease-out-expo group-open:rotate-180"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </summary>
                    <p className="pb-5 pr-9 text-base leading-relaxed text-ink-70">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
