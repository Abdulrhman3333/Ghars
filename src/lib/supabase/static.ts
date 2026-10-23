import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * A cookieless, session-less Supabase client for STATIC reference data (Quran snapshot,
 * error taxonomy). Usable from unstable_cache, where request-scoped clients are not allowed.
 * Reads run as `anon` — permitted by dedicated RLS policies (migration 0014).
 */
export function createStaticClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
