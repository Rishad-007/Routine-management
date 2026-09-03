import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!/^https?:\/\//.test(url)) {
    throw new Error(
      "Invalid or missing NEXT_PUBLIC_SUPABASE_URL. " +
        "Set it (plus NEXT_PUBLIC_SUPABASE_ANON_KEY) in the deployment environment."
    );
  }

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — no writes allowed.
            // This is fine for reads; mutations use the service-role client.
          }
        },
      },
    },
  );
}
