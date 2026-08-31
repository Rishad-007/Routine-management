"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

export interface PeriodAdjustment {
  period: number;
  originalTeacherId: string | null;
  newTeacherId: string | null;
  reason: string | null;
}

async function authed() {
  const session = await requireAdmin();
  return { session, admin: createAdminClient() };
}

/**
 * Replace the date-scoped adjustments for (date, section).
 * Pass only the periods that have a substitution (newTeacherId set);
 * clearing a substitution = omitting it from the list.
 */
export async function saveDayAdjustments(
  adjustDate: string,
  sectionId: string,
  changes: PeriodAdjustment[]
) {
  const { admin } = await authed();
  if (!adjustDate || !sectionId) return { error: "Date and section are required." };

  const { error: delErr } = await admin
    .from("adjustments")
    .delete()
    .eq("adjust_date", adjustDate)
    .eq("section_id", sectionId);
  if (delErr) return { error: delErr.message };

  const insertRows = changes
    .filter((c) => c.newTeacherId)
    .map((c) => ({
      adjust_date: adjustDate,
      section_id: sectionId,
      period_number: c.period,
      original_teacher_id: c.originalTeacherId,
      new_teacher_id: c.newTeacherId,
      reason: c.reason ?? null,
      created_by: null,
    }));

  if (insertRows.length > 0) {
    const { error: insErr } = await admin.from("adjustments").insert(insertRows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/admin/adjust");
  return { success: true, savedCount: insertRows.length };
}
