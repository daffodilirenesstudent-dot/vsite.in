'use client';

import { Suspense, useEffect, useState } from 'react';
import { Shop, supabase } from '@/lib/supabase';
import { TEMPLATE_MAP, DEFAULT_TEMPLATE, type TemplateName } from '@/components/templates/index';
import type { MenuProduct, ShopBanner } from '@/components/templates/QRMenuTemplate';

export type { MenuProduct, ShopBanner };

// Helper: merges a realtime row payload into a list keyed by `id`.
// Handles INSERT, UPDATE, and DELETE in one place so the subscription
// callbacks below stay tiny.
function applyRowChange<T extends { id?: string }>(
  list: T[],
  payload: { eventType: string; new?: T; old?: { id?: string } },
): T[] {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id;
    return id ? list.filter(r => r.id !== id) : list;
  }
  const next = payload.new;
  if (!next?.id) return list;
  const idx = list.findIndex(r => r.id === next.id);
  if (idx === -1) return [...list, next];
  const copy = list.slice();
  copy[idx] = { ...copy[idx], ...next };
  return copy;
}

// Banners that are flagged inactive should disappear from the customer view.
function shouldExcludeBanner(b: ShopBanner & { is_active?: boolean }): boolean {
  return b.is_active === false;
}

// Products flagged not-live should disappear too.
function shouldExcludeProduct(p: MenuProduct & { is_live?: boolean }): boolean {
  return p.is_live === false;
}

export default function ShopPageClient({
  shop: initialShop,
  menuProducts: initialProducts,
  banners: initialBanners,
  tier,
  tableNumber,
  gstRatePct = 0,
  whatsappOrderTaking = false,
  currencyCode = 'INR',
}: {
  shop: Shop;
  menuProducts: MenuProduct[];
  banners: ShopBanner[];
  tier: 'view' | 'order' | 'order_no_pay';
  tableNumber?: number;
  /** Preview-only — server is authoritative. 0 = no GST collected. */
  gstRatePct?: number;
  whatsappOrderTaking?: boolean;
  currencyCode?: 'INR' | 'AED';
}) {
  // Hydrated from server — kept in state so realtime updates can mutate the
  // customer's view without a full page reload (the bedrock UX requirement
  // for live ordering: customers must see out-of-stock and store-closed
  // changes within seconds, not on next refresh).
  const [shop, setShop] = useState<Shop>(initialShop);
  const [products, setProducts] = useState<MenuProduct[]>(initialProducts);
  const [banners, setBanners] = useState<ShopBanner[]>(initialBanners);

  // ── Realtime: single channel for sites + products + banners ────────────
  // Three .on() listeners on one channel = 1 WebSocket subscription instead
  // of 3, cutting Supabase Realtime connections by 2/3 per customer session.
  useEffect(() => {
    const siteId = initialShop.id;
    const channel = supabase
      .channel(`shop:${siteId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'sites', filter: `id=eq.${siteId}` },
        (payload: { new?: Shop }) => {
          const next = payload.new;
          if (!next) return;
          if (next.is_live === false) {
            if (typeof window !== 'undefined') window.location.reload();
            return;
          }
          setShop(prev => ({ ...prev, ...next }));
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'products', filter: `site_id=eq.${siteId}` },
        (payload: { eventType: string; new?: MenuProduct & { is_live?: boolean }; old?: { id?: string } }) => {
          setProducts(prev => {
            const merged = applyRowChange(
              prev as Array<MenuProduct & { id?: string }>,
              payload as never,
            ) as Array<MenuProduct & { is_live?: boolean }>;
            return merged.filter(p => !shouldExcludeProduct(p));
          });
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'banners', filter: `site_id=eq.${siteId}` },
        (payload: { eventType: string; new?: ShopBanner & { is_active?: boolean }; old?: { id?: string } }) => {
          setBanners(prev => {
            const merged = applyRowChange(
              prev as Array<ShopBanner & { id?: string }>,
              payload as never,
            ) as Array<ShopBanner & { is_active?: boolean }>;
            return merged.filter(b => !shouldExcludeBanner(b));
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initialShop.id]);

  // Fire-and-forget menu-scan tracking. Persists a per-browser visitor_id in
  // localStorage so the owner's dashboard can compute "distinct visitors today"
  // rather than just raw pageloads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const STORAGE_KEY = 'vsite_visitor_id';
      let visitorId = window.localStorage.getItem(STORAGE_KEY);
      if (!visitorId) {
        visitorId = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        window.localStorage.setItem(STORAGE_KEY, visitorId);
      }
      fetch('/api/track-menu-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: initialShop.id,
          visitor_id: visitorId,
          table_number: tableNumber != null ? String(tableNumber) : undefined,
        }),
        keepalive: true,
      }).catch(() => { /* fire-and-forget */ });
    } catch { /* localStorage / crypto unavailable — skip silently */ }
  }, [initialShop.id, tableNumber]);

  const templateKey: TemplateName = DEFAULT_TEMPLATE;
  const Template = TEMPLATE_MAP[templateKey];

  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: '#fafafa',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 32, height: 32,
          border: '3px solid #e6e6e6',
          borderTopColor: '#ef59a1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <Template
        shopName={shop.name}
        shopTagline={shop.tagline ?? undefined}
        logoUrl={shop.image_url}
        menuProducts={products}
        banners={banners}
        tier={tier}
        shopId={shop.id}
        shopSlug={shop.slug}
        tableNumber={tableNumber}
        gstRatePct={gstRatePct}
        whatsappOrderTaking={whatsappOrderTaking}
        currencyCode={currencyCode}
      />
    </Suspense>
  );
}
