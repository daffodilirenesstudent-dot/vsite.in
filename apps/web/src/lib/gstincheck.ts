// Server-only client for gstincheck.co.in.
//
// The API key is a paid secret — it must never reach the browser. This module
// uses only Node built-ins so it is automatically excluded from client bundles
// (and `import 'server-only'` would error at build time if it ever leaked).
//
// API response shape is loosely-typed at the source ("flag" is a boolean
// returned as JSON true, but historically has been observed as the string
// "true" on certain plan tiers). We normalize defensively.
//
// Reference: https://gstincheck.co.in/api-doc

import 'server-only';

export type GstinVerificationStatus = 'verified' | 'inactive' | 'unavailable';

export interface GstinVerification {
    status:     GstinVerificationStatus;
    legalName?: string;
    tradeName?: string;
    address?:   string;
    state?:     string;
    pincode?:   string;
    activeSts?: string;   // raw `sts` field from the API (Active / Cancelled / Suspended / …)
    reason?:    string;   // human-readable reason for status != verified
    raw?:       unknown;  // full payload, stored to gst_verification_cache for audit
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;
const REQUEST_TIMEOUT_MS = 5_000;

export function isValidGstinFormat(g: string): boolean {
    return GSTIN_REGEX.test(g);
}

/**
 * Hit gstincheck.co.in. Never throws — returns a normalized result with status
 * 'unavailable' on any network / parse failure so the caller can decide whether
 * to show a retryable error or fall through.
 */
export async function verifyGstin(gstin: string): Promise<GstinVerification> {
    const key  = process.env.GSTINCHECK_API_KEY;
    const base = process.env.GSTINCHECK_BASE_URL ?? 'https://sheet.gstincheck.co.in/check';

    if (!key) {
        console.error('[gstincheck] GSTINCHECK_API_KEY is not set');
        return { status: 'unavailable', reason: 'config_missing' };
    }
    if (!isValidGstinFormat(gstin)) {
        return { status: 'inactive', reason: 'invalid_format' };
    }

    const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(key)}/${encodeURIComponent(gstin)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    } catch (err) {
        clearTimeout(timer);
        console.error('[gstincheck] network error:', err);
        return { status: 'unavailable', reason: 'network_error' };
    }
    clearTimeout(timer);

    if (!res.ok) {
        console.error('[gstincheck] non-2xx response:', res.status);
        return { status: 'unavailable', reason: `http_${res.status}` };
    }

    let payload: unknown;
    try {
        payload = await res.json();
    } catch {
        return { status: 'unavailable', reason: 'invalid_json' };
    }

    const p = payload as Record<string, unknown>;
    // `flag` is the upstream "did we find this GSTIN" boolean. Both true and
    // "true" have been observed depending on plan tier.
    const flag = p.flag === true || p.flag === 'true';
    if (!flag) {
        return {
            status: 'inactive',
            reason: typeof p.message === 'string' ? p.message : 'not_found',
            raw:    payload,
        };
    }

    const data = (p.data as Record<string, unknown>) ?? {};
    const sts  = typeof data.sts === 'string' ? data.sts : '';
    const legalName = typeof data.lgnm     === 'string' ? data.lgnm     : undefined;
    const tradeName = typeof data.tradeNam === 'string' ? data.tradeNam : undefined;

    // Address sits under pradr — sometimes nested as pradr.addr, sometimes flat.
    let address: string | undefined;
    let state:   string | undefined;
    let pincode: string | undefined;
    const pradr = data.pradr as Record<string, unknown> | undefined;
    if (pradr) {
        if (typeof pradr.adr === 'string') address = pradr.adr;
        const addr = pradr.addr as Record<string, unknown> | undefined;
        if (addr) {
            if (typeof addr.stcd === 'string') state   = addr.stcd;
            if (typeof addr.pncd === 'string') pincode = addr.pncd;
            if (!address) {
                // Build a best-effort joined address from the structured parts.
                const parts = ['bno', 'flno', 'bnm', 'st', 'loc', 'dst', 'stcd', 'pncd']
                    .map(k => addr[k])
                    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
                if (parts.length) address = parts.join(', ');
            }
        }
    }

    if (sts.toLowerCase() === 'active') {
        return {
            status: 'verified',
            legalName,
            tradeName,
            address,
            state,
            pincode,
            activeSts: sts,
            raw: payload,
        };
    }

    return {
        status:    'inactive',
        legalName,
        tradeName,
        address,
        state,
        pincode,
        activeSts: sts || undefined,
        reason:    sts || 'inactive',
        raw:       payload,
    };
}
