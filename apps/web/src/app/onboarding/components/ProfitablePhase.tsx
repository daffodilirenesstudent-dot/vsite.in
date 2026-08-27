'use client';

import { useOnboarding } from '@/components/OnboardingContext';

const MAX_SELECT = 3;
const SELECTED_VALUE = 4;
const DEFAULT_VALUE = 2;

interface ProfitablePhaseProps {
  onNext: () => void;
}

export default function ProfitablePhase({ onNext }: ProfitablePhaseProps) {
  const { items, updateItemField } = useOnboarding();

  const selectedCount = items.filter(i => i.profit_tier === SELECTED_VALUE).length;
  const limitReached = selectedCount >= MAX_SELECT;

  function toggle(idx: number) {
    const isSelected = items[idx].profit_tier === SELECTED_VALUE;
    if (isSelected) {
      updateItemField(idx, 'profit_tier', DEFAULT_VALUE);
      return;
    }
    if (limitReached) return;
    updateItemField(idx, 'profit_tier', SELECTED_VALUE);
  }

  function handleSkip() {
    items.forEach((item, idx) => {
      if (item.profit_tier !== DEFAULT_VALUE) {
        updateItemField(idx, 'profit_tier', DEFAULT_VALUE);
      }
    });
    onNext();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 leading-tight">
          Which items earn the most?
        </h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Pick up to {MAX_SELECT} items with the best profit margin. We&apos;ll prioritise them in your layout.
        </p>
      </div>

      {/* Selection counter */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-[11px] font-semibold ${
            selectedCount > 0 ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
          }`}>
            {selectedCount}
          </span>
          <span className="text-xs text-slate-500">
            of {MAX_SELECT} selected
          </span>
        </div>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={() => items.forEach((_, idx) => updateItemField(idx, 'profit_tier', DEFAULT_VALUE))}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-2">
        {items.length === 0 ? (
          <EmptyPlaceholder />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item, idx) => {
              const isSelected = item.profit_tier === SELECTED_VALUE;
              const isDisabled = !isSelected && limitReached;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggle(idx)}
                  disabled={isDisabled}
                  className={`group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all duration-150 active:scale-[0.98]
                    ${isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/15 shadow-sm'
                      : isDisabled
                        ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <FoodTypeDot type={item.food_type} />
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all
                        ${isSelected
                          ? 'border-primary bg-primary'
                          : 'border-slate-200 bg-white'
                        }`}
                    >
                      {isSelected && (
                        <span className="material-symbols-outlined text-white" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1" }}>
                          check
                        </span>
                      )}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2 min-h-[34px]">
                    {item.name}
                  </p>

                  {item.price > 0 && (
                    <p className="text-xs font-medium text-slate-500">
                      ₹{item.price}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleSkip}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={onNext}
          className="rounded-[10px] bg-primary px-8 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark active:scale-[0.98]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function FoodTypeDot({ type }: { type: 'veg' | 'non_veg' | 'egg' | 'unknown' }) {
  if (type === 'unknown') {
    return <span className="block h-3 w-3 rounded-sm border border-slate-200 bg-slate-50" aria-hidden="true" />;
  }
  const color =
    type === 'veg'      ? 'border-emerald-500 bg-emerald-500' :
    type === 'non_veg'  ? 'border-red-500 bg-red-500' :
                          'border-amber-500 bg-amber-500';
  return (
    <span
      className={`flex h-3 w-3 items-center justify-center rounded-sm border ${color.split(' ')[0]} bg-white`}
      aria-label={type}
    >
      <span className={`block h-1.5 w-1.5 rounded-full ${color.split(' ')[1]}`} />
    </span>
  );
}

function EmptyPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="material-symbols-outlined text-slate-200 mb-3" style={{ fontSize: 48 }}>payments</span>
      <p className="text-sm text-slate-400">No items extracted.</p>
    </div>
  );
}
