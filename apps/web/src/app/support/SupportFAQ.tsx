'use client';

import { useState } from 'react';
import { FAQ_GROUPS } from './faqData';

export default function SupportFAQ() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="py-14 sm:py-20 px-4 bg-background-light">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">FAQ</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold font-display text-slate-900">
            Frequently Asked Questions
          </h2>
        </div>

        {FAQ_GROUPS.map((group) => (
          <div key={group.id} id={group.id} className="scroll-mt-24 mb-8">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-1">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setOpenId(openId === item.id ? null : item.id)}
                    aria-expanded={openId === item.id}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 sm:py-5 text-left"
                  >
                    <span className="font-bold text-slate-900 text-base leading-snug">{item.q}</span>
                    <span
                      className="material-symbols-outlined text-primary text-xl shrink-0 transition-transform duration-200"
                      style={{ transform: openId === item.id ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      expand_more
                    </span>
                  </button>
                  {openId === item.id && (
                    <div className="px-5 pb-5 text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
