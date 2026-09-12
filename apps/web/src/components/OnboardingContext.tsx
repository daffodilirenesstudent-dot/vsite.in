'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import {
  DEFAULT_MENU_THEME, isMenuThemeId, isHexColor, type MenuThemeId,
} from '@/lib/menu/menuThemes';

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
  /**
   * Menu design, chosen on the summary step. Site-level, not per-item, so it
   * sits here rather than on WizardItem. Persisted with the rest of the wizard
   * state, which means an owner who drops off on a bad network and comes back
   * still has the design he picked.
   */
  menuTheme: MenuThemeId;
  brandColor: string | null;
}

interface OnboardingContextValue extends OnboardingState {
  setBusinessName: (name: string) => void;
  setStep: (step: WizardStep) => void;
  setExtractedItems: (items: ExtractedItem[]) => void;
  updateItemField: (index: number, field: 'star_rating' | 'profit_chip' | 'profit_tier' | 'prep_complexity_tier', value: number) => void;
  setMenuTheme: (id: MenuThemeId) => void;
  setBrandColor: (hex: string) => void;
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const STORAGE_KEY = 'vsite:onboarding:v1';
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Classic is pre-selected so that doing nothing is a complete, valid path.
const INITIAL_STATE: OnboardingState = {
  businessName: '', step: 'setup', items: [],
  menuTheme: DEFAULT_MENU_THEME, brandColor: null,
};

function makeWizardItems(items: ExtractedItem[]): WizardItem[] {
  return items.map(item => ({
    ...item,
    star_rating: 2,
    profit_tier: 2,
    profit_chip: 1,
    prep_complexity_tier: 2,
  }));
}

function loadFromStorage(): OnboardingState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; state: OnboardingState };
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // Merged over INITIAL_STATE, not returned raw: a session saved before the
    // design picker shipped has no menuTheme at all, and spreading it straight
    // into state would leave the picker rendering `undefined` for anyone
    // mid-onboarding across the deploy.
    return {
      ...INITIAL_STATE,
      ...parsed.state,
      menuTheme: isMenuThemeId(parsed.state?.menuTheme) ? parsed.state.menuTheme : DEFAULT_MENU_THEME,
      brandColor: isHexColor(parsed.state?.brandColor) ? parsed.state.brandColor : null,
    };
  } catch {
    return null;
  }
}

function saveToStorage(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  try {
    // Skip persisting the empty initial state — pollutes storage with noise.
    if (!state.businessName && state.items.length === 0 && state.step === 'setup') {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), state }));
  } catch {
    // QuotaExceededError or storage disabled — silently ignore.
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(INITIAL_STATE);

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) setState(saved);
  }, []);

  // Persist on every meaningful change.
  useEffect(() => { saveToStorage(state); }, [state]);

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

  const setMenuTheme = useCallback((id: MenuThemeId) => {
    setState(prev => ({ ...prev, menuTheme: isMenuThemeId(id) ? id : DEFAULT_MENU_THEME }));
  }, []);

  // Guarded here as well as at the API: a colour rehydrated from localStorage
  // is as untrusted as one off the wire — the tab it came from is not ours.
  const setBrandColor = useCallback((hex: string) => {
    setState(prev => ({ ...prev, brandColor: isHexColor(hex) ? hex : prev.brandColor }));
  }, []);

  const resetOnboarding = useCallback(() => {
    setState(INITIAL_STATE);
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <OnboardingContext.Provider
      value={{ ...state, setBusinessName, setStep, setExtractedItems, updateItemField, setMenuTheme, setBrandColor, resetOnboarding }}
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
