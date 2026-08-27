// `import 'server-only'` makes Next.js refuse to bundle this module into a
// client component. If anyone accidentally imports `supabaseServer` from a
// browser component, the build fails immediately — preventing the
// service-role key from leaking into the public JS bundle.
import 'server-only';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Hard-fail in production: a missing service-role key would silently fall back
// to the anon-key client, bypassing every supabaseServer-protected operation
// (RPC, RLS-bypassing reads, billing writes). Better to crash on boot.
if (!supabaseServiceRoleKey && process.env.NODE_ENV === 'production') {
    throw new Error('[supabase-server] SUPABASE_SERVICE_ROLE_KEY is required in production');
}

// In local development without the service-role key set, fall back to the
// anon-key client so dev and tests still work. RLS will apply.
export const supabaseServer = supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : createClient(supabaseUrl, anonKey);
