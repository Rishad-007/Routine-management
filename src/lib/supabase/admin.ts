import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS.
 * SERVER ONLY — guarded by the `server-only` package.
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^https?:\/\//.test(url)) {
    throw new Error(
      "Invalid or missing NEXT_PUBLIC_SUPABASE_URL. " +
        "Set it (plus SUPABASE_SERVICE_ROLE_KEY) in the deployment environment, e.g. Vercel > Project > Settings > Environment Variables."
    );
  }
  return createSupabaseClient(
    url,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
