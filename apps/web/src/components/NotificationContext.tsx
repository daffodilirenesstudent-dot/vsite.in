'use client';

/**
 * NotificationContext
 * Tracks app-wide notification dots shown in the sidebar / mobile nav.
 *
 * Dots:
 *  - Product Inventory  → # of products missing an image_url
 *  - Store Settings     → required fields incomplete (name, phone, description, timing, logo)
 *  - Banner Management  → always shown until user has at least 1 banner
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSite } from './SiteContext';

interface NotificationState {
    missingImageCount: number;   // products with no image
    settingsIncomplete: boolean; // store details not fully filled
    bannerDot: boolean;          // no banners yet
    refresh: () => void;         // call after user takes action to re-check
}

const Ctx = createContext<NotificationState>({
    missingImageCount: 0,
    settingsIncomplete: false,
    bannerDot: false,
    refresh: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const { activeSite } = useSite();
    const [missingImageCount, setMissingImageCount] = useState(0);
    const [settingsIncomplete, setSettingsIncomplete] = useState(false);
    const [bannerDot, setBannerDot] = useState(false);

    // Tracks the latest invocation so a slow earlier check can't overwrite
    // notification state after the user has switched sites.
    const checkSeq = React.useRef(0);

    const check = useCallback(async () => {
        if (!activeSite?.id) return;
        const seq = ++checkSeq.current;
        const siteId = activeSite.id;

        try {
            // 1. Products missing image — quote the empty string so PostgREST
            //    parses it as a literal '' rather than a SQL NULL marker.
            const { count: missingCount, error: e1 } = await supabase
                .from('products')
                .select('id', { count: 'exact', head: true })
                .eq('site_id', siteId)
                .or('image_url.is.null,image_url.eq.""');
            if (seq !== checkSeq.current) return;
            if (!e1) setMissingImageCount(missingCount ?? 0);

            // 2. Settings completeness — check required site fields
            const { data: site, error: e2 } = await supabase
                .from('sites')
                .select('name, contact_number, description, timing, image_url')
                .eq('id', siteId)
                .single();
            if (seq !== checkSeq.current) return;
            if (!e2 && site) {
                const incomplete =
                    !site.name?.trim() ||
                    !site.contact_number?.trim() ||
                    !site.description?.trim() ||
                    !site.timing?.trim() ||
                    !site.image_url;
                setSettingsIncomplete(incomplete);
            }

            // 3. Banner dot — any banners for this site?
            const { count: bannerCount, error: e3 } = await supabase
                .from('banners')
                .select('id', { count: 'exact', head: true })
                .eq('site_id', siteId);
            if (seq !== checkSeq.current) return;
            if (!e3) setBannerDot((bannerCount ?? 0) === 0);
        } catch {
            // Network failure — silently keep previous state
        }
    }, [activeSite?.id]);

    useEffect(() => {
        check();
    }, [check]);

    return (
        <Ctx.Provider value={{ missingImageCount, settingsIncomplete, bannerDot, refresh: check }}>
            {children}
        </Ctx.Provider>
    );
}

export function useNotifications() {
    return useContext(Ctx);
}
