import { supabase } from '@/lib/platform/db/supabase';
import { compressImage } from '@/utils/compressImage';
import { uploadMenuImage } from '@/lib/menu/menuImages';
import { makeMenuThumbnail, prepareMenuPhoto } from '@/lib/menu/imageCompress';
import { MENU_PHOTO_COMPRESS, PHOTO_MAX_INPUT_BYTES, isPhotoFile, photoErrorMessage } from '@/lib/menu/menuPhoto';
import type { Banner } from './banners';

/**
 * Banner queries for the phone screen — the same `banners` table, bucket,
 * path and compression the desktop banner page uses, so a banner added on
 * either shows up on both.
 */

const BUCKET = 'product-images';

export async function loadBanners(siteId: string): Promise<Banner[]> {
    const { data, error } = await supabase
        .from('banners')
        .select('id, name, description, image_url, sort_order, is_active, created_at')
        .eq('site_id', siteId)
        .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Banner[];
}

export async function setBannerActive(id: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase.from('banners').update({ is_active: isActive }).eq('id', id);
    return !error;
}

/** One update per moved row: upsert with partial columns trips the NOT NULLs. */
export async function saveBannerOrder(changes: Array<{ id: string; sort_order: number }>): Promise<boolean> {
    const results = await Promise.allSettled(
        changes.map(c => supabase.from('banners').update({ sort_order: c.sort_order }).eq('id', c.id)),
    );
    return results.every(r => r.status === 'fulfilled' && !r.value.error);
}

export async function deleteBanner(id: string): Promise<boolean> {
    const { error } = await supabase.from('banners').delete().eq('id', id);
    return !error;
}

/** Why a picked file cannot be used, or null when it can. */
export function bannerFileProblem(file: File): string | null {
    if (MENU_PHOTO_COMPRESS) {
        if (!isPhotoFile(file)) return 'Please choose a photo.';
        if (file.size > PHOTO_MAX_INPUT_BYTES) return 'That photo is too large. Max 25 MB.';
        return null;
    }
    if (!file.type.startsWith('image/')) return 'Please choose a photo.';
    if (file.size > 5 * 1024 * 1024) return 'That photo is too large. Max 5 MB.';
    return null;
}

/** Compress, upload and return the public URL; throws a message fit to show. */
export async function uploadBannerImage(file: File, siteSlug: string): Promise<string> {
    try {
        const compressed = MENU_PHOTO_COMPRESS
            ? await prepareMenuPhoto(file)
            : await compressImage(file, { maxWidth: 1200, quality: 0.85 });
        const ext = compressed.name.split('.').pop() ?? 'jpg';
        const path = `${siteSlug}/banners/banner-${Date.now()}.${ext}`;
        const { error } = await uploadMenuImage({
            bucket: supabase.storage.from(BUCKET),
            path,
            file: compressed,
            makeThumb: makeMenuThumbnail,
        });
        if (error) throw error;
        return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (err) {
        throw new Error(MENU_PHOTO_COMPRESS ? photoErrorMessage(err) : 'Could not upload the photo. Please try again.');
    }
}

export interface BannerDraft {
    name: string;
    description: string;
    imageUrl: string | null;
    isActive: boolean;
}

export async function createBanner(siteId: string, draft: BannerDraft, sortOrder: number): Promise<Banner | null> {
    const { data, error } = await supabase
        .from('banners')
        .insert({
            site_id: siteId,
            name: draft.name.trim(),
            description: draft.description.trim() || null,
            image_url: draft.imageUrl,
            sort_order: sortOrder,
            is_active: draft.isActive,
        })
        .select('id, name, description, image_url, sort_order, is_active, created_at')
        .single();
    return error ? null : (data as Banner);
}

export async function updateBanner(id: string, draft: BannerDraft): Promise<boolean> {
    const { error } = await supabase
        .from('banners')
        .update({
            name: draft.name.trim(),
            description: draft.description.trim() || null,
            image_url: draft.imageUrl,
            is_active: draft.isActive,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    return !error;
}
