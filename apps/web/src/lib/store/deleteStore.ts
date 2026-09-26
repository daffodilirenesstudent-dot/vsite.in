import { supabase } from '@/lib/platform/db/supabase';

/**
 * Delete a store for good — the one implementation, used by the settings
 * Danger zone and the phone Store details screen. Moved unchanged from
 * settings/page.tsx.
 *
 * The row is archived to deleted_sites first, then the site is deleted, which
 * cascades to its products, banners and categories. Callers must have had the
 * owner type the store name back (canConfirmDelete) before calling.
 *
 * Resolves to how many stores the owner has left; throws on failure.
 */
export async function deleteStore(siteId: string, userId: string): Promise<{ remaining: number }> {
    // Archive to deleted_sites before deleting. Columns are named, not
    // `*`: the browser may only read the columns granted in migration
    // 056, and a wildcard fails outright once any column is revoked.
    const { data: siteData } = await supabase
        .from('sites')
        .select('id, created_at, user_id, name, slug, type, owner_name, contact_number, timing, established_year, location, state, pincode, address, email, whatsapp_number, tagline, social_links, is_live')
        .eq('id', siteId)
        .single();

    if (siteData) {
        await supabase.from('deleted_sites').insert({
            id: siteData.id,
            original_created_at: siteData.created_at,
            user_id: siteData.user_id,
            name: siteData.name,
            slug: siteData.slug,
            type: siteData.type,
            owner_name: siteData.owner_name,
            contact_number: siteData.contact_number,
            timing: siteData.timing,
            established_year: siteData.established_year,
            location: siteData.location,
            state: siteData.state,
            pincode: siteData.pincode,
            address: siteData.address,
            email: siteData.email,
            whatsapp_number: siteData.whatsapp_number,
            tagline: siteData.tagline,
            social_links: siteData.social_links,
            is_live: siteData.is_live,
        });
    }

    // Delete the site — cascades to products, banners, categories, orders, transactions
    const { error } = await supabase.from('sites').delete().eq('id', siteId);
    if (error) throw error;

    // Re-fetch directly — a caller's site list is stale until it refreshes.
    const { data: remaining } = await supabase
        .from('sites')
        .select('id')
        .eq('user_id', userId)
        .neq('id', siteId);
    return { remaining: remaining?.length ?? 0 };
}
