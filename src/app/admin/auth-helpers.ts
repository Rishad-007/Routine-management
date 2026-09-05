import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolves the current admin session and a service-role Supabase client.
 * Verifies the session's admin id still exists in the `admins` table so
 * that self-referential FKs (e.g. admins.created_by) never point at a
 * deleted/recreated row. Stale sessions are sent back to login.
 */
export async function authed() {
  const session = await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("admins")
    .select("id")
    .eq("id", session.id)
    .single();
  if (!data) {
    redirect("/login");
  }
  return { session, admin };
}