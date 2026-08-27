'use client';

import { useState } from 'react';
import { useOnboarding } from '@/components/OnboardingContext';

interface SummaryPhaseProps {
  onLaunch: () => void;
  launching: boolean;
}

export default function SummaryPhase({ onLaunch, launching }: SummaryPhaseProps) {
  const { items, businessName } = useOnboarding();
  const [showAll, setShowAll] = useState(false);

  const bestsellerCount = items.filter(i => i.star_rating === 4).length;
  const profitableCount = items.filter(i => i.profit_tier === 4).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900 leading-tight">
          You&apos;re ready to launch
        </h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Review your menu and go live. You can edit everything later from your dashboard.
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat icon="restaurant_menu" label="Items" value={items.length} />
        <Stat icon="trending_up"     label="Bestsellers" value={bestsellerCount} />
        <Stat icon="paid"            label="Top earners" value={profitableCount} />
      </div>

      {/* Business name pill */}
      {businessName && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-primary border border-slate-200">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>storefront</span>
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Store name</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{businessName}</p>
          </div>
        </div>
      )}

      {/* Item list (collapsible) */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <span className="material-symbols-outlined text-slate-200 mb-3" style={{ fontSize: 44 }}>menu_book</span>
            <p className="text-sm text-slate-400">No items yet — add them from the dashboard after launch.</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowAll(s => !s)}
              className="mb-2 flex w-full items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <span>{showAll ? 'Hide menu items' : `Review menu items (${items.length})`}</span>
              <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 18 }}>
                {showAll ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {showAll && (
              <ul className="space-y-1.5">
                {items.map((item, idx) => {
                  const isBestseller = item.star_rating === 4;
                  const isProfitable = item.profit_tier === 4;
                  return (
                    <li
                      key={idx}
                      className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2"
                    >
                      <FoodTypeDot type={item.food_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isBestseller && (
                          <span className="inline-flex items-center justify-center rounded-md bg-primary/10 p-1" title="Bestseller">
                            <span className="material-symbols-outlined text-primary" style={{ fontSize: 12 }}>trending_up</span>
                          </span>
                        )}
                        {isProfitable && (
                          <span className="inline-flex items-center justify-center rounded-md bg-emerald-50 p-1" title="Top earner">
                            <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 12 }}>paid</span>
                          </span>
                        )}
                        {item.price > 0 && (
                          <span className="ml-1 text-xs font-semibold text-slate-700 tabular-nums">₹{item.price}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Launch CTA */}
      <div className="pt-4 border-t border-slate-100 mt-4">
        <button
          onClick={onLaunch}
          disabled={launching}
          className="w-full rounded-[10px] bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-2">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
            Launch My Menu
          </span>
        </button>
        <p className="text-center text-[10px] text-slate-400 mt-2">
          You can edit prices, photos, and details from the dashboard after launch.
        </p>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white px-2 py-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 mb-1">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
      </span>
      <p className="text-base font-bold text-slate-800 tabular-nums leading-none">{value}</p>
      <p className="text-[10px] font-medium text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function FoodTypeDot({ type }: { type: 'veg' | 'non_veg' | 'egg' | 'unknown' }) {
  if (type === 'unknown') {
    return <span className="shrink-0 block h-3 w-3 rounded-sm border border-slate-200 bg-slate-50" aria-hidden="true" />;
  }
  const ring =
    type === 'veg'     ? 'border-emerald-500' :
    type === 'non_veg' ? 'border-red-500' :
                         'border-amber-500';
  const dot =
    type === 'veg'     ? 'bg-emerald-500' :
    type === 'non_veg' ? 'bg-red-500' :
                         'bg-amber-500';
  return (
    <span className={`shrink-0 flex h-3 w-3 items-center justify-center rounded-sm border ${ring} bg-white`} aria-label={type}>
      <span className={`block h-1.5 w-1.5 rounded-full ${dot}`} />
    </span>
  );
}
