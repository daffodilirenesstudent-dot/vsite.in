import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Shop } from '@/lib/platform/db/supabase';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import ShopPageClient from './ShopPageClient';
import type { MenuProduct, ShopBanner } from './ShopPageClient';
import { TRIAL_DURATION_MS, normalizePlan } from '@/lib/platform/productFlags';
import { buildMenuDescription } from '@/lib/store/businessTypes';

// ISR: Cache pages for 10 seconds so toggle/live changes reflect quickly.
export const revalidate = 10;

const BASE_URL = 'https://vsite.in';

interface PageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ table?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const { data: site } = await supabaseServer
        .from('sites')
        .select('name, slug, business_type, location')
        .eq('slug', slug)
        .single();

    if (!site) return {};

    const title = `${site.name} — Digital Menu`;
    // Built, not written. sites.description was an owner-authored blurb that
    // was empty on most rows, so most menus shipped the generic fallback
    // anyway. Deriving it from type + location gives every menu its own
    // sentence without asking anyone to write one — and it cannot go stale.
    const description = buildMenuDescription({
        name: site.name,
        type: (site as Record<string, unknown>).business_type as string | null,
        location: (site as Record<string, unknown>).location as string | null,
    });
    const url = `${BASE_URL}/shop/${site.slug}`;

    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title,
            description,
            url,
            type: 'website',
            // No per-store OG image: the logo it used to point at is gone,
            // and the site-wide default in the root layout is a better card
            // than an empty images array.
            images: [],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [],
        },
    };
}

async function getShop(slug: string): Promise<{ shop: Shop; menuProducts: MenuProduct[]; banners: ShopBanner[]; canGoLive: boolean; tier: 'view' | 'order' | 'order_no_pay'; qrMode: string; tableCount: number; gstRatePct: number; whatsappOrderTaking: boolean; currencyCode: 'INR' | 'AED' } | null> {
    // 1. Fetch Site
    const { data: site, error: siteError } = await supabaseServer
        .from('sites')
        .select('id, slug, name, established_year, address, location, state, pincode, timing, contact_number, email, whatsapp_number, tagline, social_links, type, is_live, created_at, user_id, qr_mode, table_count, gst_status, gst_rate_pct, whatsapp_order_taking, whatsapp_order_number, currency_code, menu_theme, menu_font, primary_color')
        .eq('slug', slug)
        .single();

    if (siteError || !site) {
        return null;
    }

    // 2. Check store trial/subscription status via per-store table.
    // Trial baseline is sites.created_at (the canonical "store age"), NOT
    // site_subscriptions.created_at — which can drift if the sub row is
    // re-created or backfilled. maybeSingle so a missing sub row is not
    // logged as a Postgrest error for trial-only stores.
    let canGoLive = false;
    let tier: 'view' | 'order' | 'order_no_pay' = 'view';
    {
        const { data: sub } = await supabaseServer
            .from('site_subscriptions')
            .select('store_expires_at, store_plan')
            .eq('site_id', site.id)
            .maybeSingle();

        const now = Date.now();
        const subEndsMs = sub?.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;
        const trialEndsMs = new Date(site.created_at).getTime() + TRIAL_DURATION_MS;
        canGoLive = subEndsMs > now || trialEndsMs > now;
        // normalizePlan collapses the frozen ordering products into qr_menu,
        // so this resolves to 'view' for every store while ORDERING_FROZEN.
        // That single assignment is what removes the cart, checkout, payment
        // and Request-Bill UI from the public menu — QRMenuTemplate already
        // renders read-only for the 'view' tier.
        const storePlan: string = normalizePlan(sub?.store_plan);
        if (storePlan === 'pay_eat' || storePlan === 'pro') {
          tier = 'order';
        } else if (storePlan === 'qr_order') {
          tier = 'order_no_pay';
        } else {
          tier = 'view';
        }
    }

    // 4. Fetch products + banners in parallel
    const [{ data: products, error: prodError }, { data: bannersData }] = await Promise.all([
        supabaseServer
            .from('products')
            .select('id, name, selling_price, description, image_url, is_live, category, food_type, metadata, display_order, ks_quadrant, star_rating')
            .eq('site_id', site.id)
            // is_live=false is "sold out today", not "deleted". It used to be
            // filtered out here, which left a diner unable to tell a finished
            // dish from one that was never on the menu — so they asked staff,
            // which is the question the menu exists to answer. The template
            // renders these greyed and sinks them below the available items.
            .order('display_order', { ascending: true }),
        supabaseServer
            .from('banners')
            .select('id, name, image_url, description')
            .eq('site_id', site.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
    ]);

    if (prodError) {
        console.error('Error fetching products:', prodError);
    }

    // 5. Map to Shop Interface (kept minimal — display is handled by template)
    const shopData: Shop = {
        id: site.id,
        slug: site.slug,
        name: site.name,
        products: [],
        timings: site.timing,
        location: site.location,
        contact: {
            phone: site.contact_number,
            email: site.email,
            whatsapp: site.whatsapp_number,
        },
        audio_url: null,
        transcription: null,
        raw_json: null,
        created_at: site.created_at,
        updated_at: site.created_at,
        tagline: site.tagline,
        social_links: site.social_links,
        type: site.type,
        is_live: site.is_live,
        menu_theme: (site as Record<string, unknown>).menu_theme as string | null,
        menu_font: (site as Record<string, unknown>).menu_font as string | null,
        primary_color: (site as Record<string, unknown>).primary_color as string | null,
    };

    // GST preview rate — only show tax on the cart when the store has completed
    // GST onboarding as 'registered'. The server still recomputes authoritatively.
    const siteRow = site as Record<string, unknown>;
    const gstRatePct = (siteRow.gst_status === 'registered' && siteRow.gst_rate_pct != null)
      ? Number(siteRow.gst_rate_pct)
      : 0;
    const whatsappOrderTaking = siteRow.whatsapp_order_taking === true && !!siteRow.whatsapp_order_number;
    const currencyCode: 'INR' | 'AED' = siteRow.currency_code === 'AED' ? 'AED' : 'INR';

    return { shop: shopData, menuProducts: (products || []) as MenuProduct[], banners: (bannersData || []) as ShopBanner[], canGoLive, tier, qrMode: (site.qr_mode ?? 'common') as string, tableCount: (site.table_count ?? 50) as number, gstRatePct, whatsappOrderTaking, currencyCode };
}

export default async function ShopPage({ params, searchParams }: PageProps) {
    const { slug } = await params;
    const { table } = await searchParams;
    const tableNumber = table ? parseInt(table, 10) : undefined;
    const validTableNumber = tableNumber && Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 50
      ? tableNumber : undefined;
    const result = await getShop(slug);

    if (!result) {
        notFound();
    }

    const { shop, menuProducts, banners, canGoLive, tier, qrMode, tableCount, gstRatePct, whatsappOrderTaking, currencyCode } = result;

    // Check if shop is live (also gates on trial/subscription)
    if (shop.is_live === false || !canGoLive) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 font-sans">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="material-symbols-outlined text-4xl text-gray-400">storefront</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Shop Currently Unavailable</h1>
                    <p className="text-gray-600 mb-8">
                        The shop you are looking for is currently offline or under maintenance. Please check back later.
                    </p>
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center gap-3 text-left">
                        <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                            <span className="material-symbols-outlined">store</span>
                        </div>
                        <div>
                            <p className="font-semibold text-gray-900 text-sm">{shop.name}</p>
                            <p className="text-xs text-gray-500">Will be back soon</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // In table QR mode, reject scans for tables that no longer exist.
    // (e.g. owner had 8 tables, reduced to 7 — old Table 8 QR is now invalid.)
    if (qrMode === 'table' && validTableNumber && validTableNumber > tableCount) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 font-sans">
                <div className="text-center max-w-sm">
                    <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="material-symbols-outlined text-4xl text-orange-400">qr_code_2_add</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">QR Code Not Available</h1>
                    <p className="text-gray-500 mb-6 text-sm leading-relaxed">
                        This QR code is no longer active. Please scan the QR code on your table or ask a staff member for assistance.
                    </p>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 text-left">
                        <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-orange-500 text-lg">table_restaurant</span>
                        </div>
                        <div>
                            <p className="font-semibold text-gray-900 text-sm">{shop.name}</p>
                            <p className="text-xs text-gray-400">Table {validTableNumber} · No longer active</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // pay_eat = common QR only — ignore any ?table= param that may appear in the URL
    const effectiveTableNumber = tier === 'order' ? undefined : validTableNumber;

    return <ShopPageClient shop={shop} menuProducts={menuProducts} banners={banners} tier={tier} tableNumber={effectiveTableNumber} gstRatePct={gstRatePct} whatsappOrderTaking={whatsappOrderTaking} currencyCode={currencyCode} />;
}
