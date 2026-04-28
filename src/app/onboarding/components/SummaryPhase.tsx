'use client';

import { useOnboarding } from '@/components/OnboardingContext';
import { previewQuadrant, type QuadrantLabel } from '@/lib/menuEngineering';

const QUADRANT_STYLE: Record<QuadrantLabel, { label: string; color: string; icon: string; bg: string }> = {
  Star:       { label: 'Star',       color: 'text-amber-600',   icon: 'star',           bg: 'bg-amber-50  border-amber-200'  },
  Plowhorse:  { label: 'Plowhorse',  color: 'text-blue-600',    icon: 'agriculture',    bg: 'bg-blue-50   border-blue-200'   },
  Puzzle:     { label: 'Puzzle',     color: 'text-purple-600',  icon: 'extension',      bg: 'bg-purple-50 border-purple-200' },
  Dog:        { label: 'Dog',        color: 'text-slate-500',   icon: 'pets',           bg: 'bg-slate-50  border-slate-200'  },
};

const STAR_ICONS = ['', '★', '★★', '★★★', '★★★★'];
const COMPLEXITY_LABELS = ['', 'Heat & Serve', 'Simple Cook', 'Made Fresh', 'From Scratch'];

interface SummaryPhaseProps {
  onLaunch: () => void;
  launching: boolean;
}

export default function SummaryPhase({ onLaunch, launching }: SummaryPhaseProps) {
  const { items } = useOnboarding();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rocket_launch</span>
          </span>
          <h2 className="text-base font-bold text-slate-800">Your Menu Summary</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Review your menu — then launch to go live. You can edit everything from the dashboard.
        </p>
      </div>

      {/* Stats row */}
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {(['Star', 'Plowhorse', 'Puzzle', 'Dog'] as QuadrantLabel[]).map(q => {
            const count = items.filter(i => previewQuadrant(i.star_rating, i.profit_tier) === q).length;
            const style = QUADRANT_STYLE[q];
            return (
              <div key={q} className={`rounded-xl border p-2.5 text-center ${style.bg}`}>
                <p className={`text-base font-bold ${style.color}`}>{count}</p>
                <p className={`text-[10px] font-medium ${style.color} mt-0.5`}>{style.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Item cards */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-2.5 pb-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined text-slate-200 mb-3" style={{ fontSize: 48 }}>menu_book</span>
            <p className="text-sm text-slate-400">No items yet — you can add them from the dashboard.</p>
          </div>
        ) : (
          items.map((item, idx) => {
            const quadrant = previewQuadrant(item.star_rating, item.profit_tier);
            const style = QUADRANT_STYLE[quadrant];
            return (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm"
              >
                {/* Quadrant badge */}
                <div className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border ${style.bg}`}>
                  <span className={`material-symbols-outlined ${style.color}`} style={{ fontSize: 18 }}>
                    {style.icon}
                  </span>
                </div>

                {/* Item info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                    {item.price > 0 && (
                      <span className="shrink-0 text-xs font-semibold text-slate-600">₹{item.price}</span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {/* Quadrant label */}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.bg} ${style.color}`}>
                      {style.label}
                    </span>
                    {/* Star rating */}
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                      {STAR_ICONS[item.star_rating]} Pop
                    </span>
                    {/* Profit tier */}
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                      Tier {item.profit_tier} Profit
                    </span>
                    {/* Complexity */}
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {COMPLEXITY_LABELS[item.prep_complexity_tier]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
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
        <p className="text-center text-[10px] text-slate-300 mt-2">
          You can edit prices, photos, and details from the dashboard after launch.
        </p>
      </div>
    </div>
  );
}
