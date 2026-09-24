'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createPhotoSuggester,
    fetchLibraryPhoto,
    preloadPhoto,
    type PhotoSource,
    type SuggestState,
} from '@/lib/menu/photoSuggest';

/**
 * React wrapper around `createPhotoSuggester`. Follows the dish name while the
 * drawer is open and hands a found photo to `onFound` — unless the owner has
 * since put in their own photo or removed a suggestion, checked at the moment
 * the answer lands, not when the search started.
 */
export function usePhotoSuggestion({
    enabled,
    name,
    source,
    onFound,
    onNone,
}: {
    enabled: boolean;
    name: string;
    source: PhotoSource;
    onFound: (url: string) => void;
    onNone: () => void;
}) {
    const [state, setState] = useState<SuggestState>({ status: 'idle' });
    const [dismissed, setDismissed] = useState(false);

    const latest = useRef({ source, dismissed, onFound, onNone });
    latest.current = { source, dismissed, onFound, onNone };

    const suggester = useMemo(
        () => createPhotoSuggester(
            {
                lookup: (query, signal) => fetchLibraryPhoto(query, { signal }),
                preload: preloadPhoto,
                now: () => performance.now(),
            },
            next => {
                setState(next);
                const { source: nowSource, dismissed: nowDismissed } = latest.current;
                if (nowSource === 'own' || nowDismissed) return;
                if (next.status === 'found') latest.current.onFound(next.url);
                if (next.status === 'none') latest.current.onNone();
            },
        ),
        [],
    );

    useEffect(() => () => suggester.cancel(), [suggester]);

    useEffect(() => {
        if (!enabled || source === 'own' || dismissed) {
            suggester.cancel();
            return;
        }
        suggester.request(name);
    }, [enabled, name, source, dismissed, suggester]);

    /** The owner removed the suggestion: stop suggesting for this drawer. */
    const dismiss = useCallback(() => {
        suggester.cancel();
        setDismissed(true);
    }, [suggester]);

    /** A fresh drawer: forget the last name and any dismissal. */
    const reset = useCallback(() => {
        suggester.reset();
        setDismissed(false);
    }, [suggester]);

    /** The owner asked for a library photo explicitly. */
    const find = useCallback((dishName: string) => suggester.find(dishName), [suggester]);

    const resolveForSave = useCallback((dishName: string) => suggester.resolveForSave(dishName), [suggester]);

    return { state, dismissed, dismiss, reset, find, resolveForSave, lastQuery: suggester.lastQuery };
}
