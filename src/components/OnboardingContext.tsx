'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ── Extracted item shape from /api/onboarding/extract ────────────────────────

export interface ExtractedItem {
  name: string;
  price: number;
  description: string;
  category: string | null;
  item_type: 'single' | 'variant' | 'combo';
  food_type: 'veg' | 'non_veg' | 'egg' | 'unknown';
  variants?: Array<{ size: string; price: number }>;
}

// ExtractedItem enriched with wizard tiers
export interface WizardItem extends ExtractedItem {
  star_rating: number;          // 1–4, default 2
  profit_tier: number;          // 1–4, default 2 (derived from profit_chip)
  profit_chip: number;          // 0–4 chip index; stored separately so chips are unambiguous
  prep_complexity_tier: number; // 1–4, default 2
}

export type WizardStep = 'setup' | 'bestsellers' | 'profitable' | 'summary';

interface OnboardingState {
  businessName: string;
  step: WizardStep;
  items: WizardItem[];
}

interface OnboardingContextValue extends OnboardingState {
  setBusinessName: (name: string) => void;
  setStep: (step: WizardStep) => void;
  setExtractedItems: (items: ExtractedItem[]) => void;
  updateItemField: (index: number, field: 'star_rating' | 'profit_chip' | 'profit_tier' | 'prep_complexity_tier', value: number) => void;
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function makeWizardItems(items: ExtractedItem[]): WizardItem[] {
  return items.map(item => ({
    ...item,
    star_rating: 2,
    profit_tier: 2,
    profit_chip: 1,   // chip index 1 = "₹20–30" → tier 2 default
    prep_complexity_tier: 2,
  }));
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>({
    businessName: '',
    step: 'setup',
    items: [],
  });

  const setBusinessName = useCallback((name: string) => {
    setState(prev => ({ ...prev, businessName: name }));
  }, []);

  const setStep = useCallback((step: WizardStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const setExtractedItems = useCallback((items: ExtractedItem[]) => {
    setState(prev => ({ ...prev, items: makeWizardItems(items) }));
  }, []);

  const updateItemField = useCallback(
    (index: number, field: 'star_rating' | 'profit_chip' | 'profit_tier' | 'prep_complexity_tier', value: number) => {
      setState(prev => {
        const items = [...prev.items];
        items[index] = { ...items[index], [field]: value };
        return { ...prev, items };
      });
    },
    []
  );

  const resetOnboarding = useCallback(() => {
    setState({ businessName: '', step: 'setup', items: [] });
  }, []);

  return (
    <OnboardingContext.Provider
      value={{ ...state, setBusinessName, setStep, setExtractedItems, updateItemField, resetOnboarding }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
