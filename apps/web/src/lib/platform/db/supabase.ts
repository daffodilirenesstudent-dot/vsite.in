// Browser-safe Supabase client. The service-role variant lives in
// `supabase-server.ts` (gated by `import 'server-only'`) so the secret can
// never accidentally land in the public bundle.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Lazily fetch the Firebase ID token for each Supabase request.
// Dynamic import avoids circular deps and SSR issues (Firebase SDK is client-only).
const getFirebaseToken = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  try {
    const { getApps, getApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    if (getApps().length === 0) return null;
    const currentUser = getAuth(getApp()).currentUser;
    return currentUser ? await currentUser.getIdToken() : null;
  } catch {
    return null;
  }
};

const createSupabaseClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    // Official Firebase Third-Party Auth approach:
    // Pass Firebase JWT directly — Supabase validates it via Firebase JWKS.
    // See: https://supabase.com/docs/guides/auth/third-party/firebase-auth
    accessToken: getFirebaseToken,
  });

declare global {
  // eslint-disable-next-line no-var
  var supabase: ReturnType<typeof createSupabaseClient> | undefined;
}

export const supabase = globalThis.supabase ?? createSupabaseClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.supabase = supabase;
}

// Database types
export interface Shop {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  products: Product[];
  timings: string | null;
  location: string | null;
  contact: Contact;
  audio_url: string | null;
  transcription: string | null;
  raw_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  tagline?: string | null;
  social_links?: Record<string, string> | null;
  type: 'Shop' | 'Menu';
  is_live?: boolean;
}

export interface Product {
  id?: string;
  name: string;
  price: number;
  description?: string;
  image_url?: string;
  is_live?: boolean;
}

export interface Contact {
  phone?: string;
  whatsapp?: string;
  email?: string;
}

// Extracted data from GPT-4o
export interface ExtractedShopData {
  shopName: string;
  description: string;
  products: Product[];
  timings: string | null;
  location: string | null;
  contact: Contact;
}
