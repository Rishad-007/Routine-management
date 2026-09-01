"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { simulateTeacherAssignment } from "@/lib/conflicts";
import type { RoutineRow } from "@/lib/types";

export interface PeriodAdjustment {
  period: number;
  sectionId: string;
  originalTeacherId: string | null;
  newTeacherId: string | null;
  reason: string | null;
  level: "ok" | "yellow" | "red";
  reasons: string[];
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

/**
 * Save all adjustments across multiple sections for a given date.
 * Server-side re-validates each red adjustment; if !force and any red exists,
 * returns warnings without saving.
 */
export async function saveAllAdjustments(
  adjustDate: string,
  changes: PeriodAdjustment[],
  force: boolean
) {
  const { admin } = await authed();
  if (!adjustDate) return { error: "Date is required." };

  // Fetch all routines for conflict validation.
  const { data: allRoutines, error: rErr } = await admin
    .from("routines")
    .select("id, section_id, day, period_number, teacher_id, subject_id, room_id, is_adjusted, original_teacher_id");
  if (rErr) return { error: rErr.message };

  const routines = (allRoutines ?? []) as RoutineRow[];

  // Server-side validation of each adjustment.
  const warnings: { period: number; sectionId: string; level: "yellow" | "red"; reasons: string[] }[] = [];

  for (const c of changes) {
    if (!c.newTeacherId) continue;
    const sim = simulateTeacherAssignment(
      routines,
      c.newTeacherId,
      0, // day will be computed from adjustDate
      c.period,
      c.sectionId
    );
    if (sim.level === "yellow") {
      warnings.push({ period: c.period, sectionId: c.sectionId, level: "yellow", reasons: sim.reasons });
    } else if (sim.level === "red") {
      warnings.push({ period: c.period, sectionId: c.sectionId, level: "red", reasons: sim.reasons });
    }
  }

  if (warnings.length > 0 && !force) {
    return { warnings };
  }

  // Group changes by section for delete-then-insert.
  const bySection = new Map<string, PeriodAdjustment[]>();
  for (const c of changes) {
    if (!bySection.has(c.sectionId)) bySection.set(c.sectionId, []);
    bySection.get(c.sectionId)!.push(c);
  }

  let savedCount = 0;
  for (const [sectionId, sectionChanges] of bySection) {
    const { error: delErr } = await admin
      .from("adjustments")
      .delete()
      .eq("adjust_date", adjustDate)
      .eq("section_id", sectionId);
    if (delErr) return { error: delErr.message };

    const insertRows = sectionChanges
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
      savedCount += insertRows.length;
    }
  }

  revalidatePath("/admin/adjust");
  return { success: true, savedCount };
}
