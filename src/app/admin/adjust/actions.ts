"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { simulateTeacherAssignment } from "@/lib/conflicts";
import { getSchoolDayIndex } from "@/lib/periods";
import type { RoutineRow } from "@/lib/types";

export interface PeriodAdjustment {
  period: number;
  sectionId: string;
  isTag: boolean;
  originalTeacherId: string | null;
  newTeacherId: string | null;
  originalSubjectId: string | null;
  newSubjectId: string | null;
  originalRoomId: string | null;
  newRoomId: string | null;
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
    .filter((c) => c.newTeacherId || c.newSubjectId || c.newRoomId)
    .map((c) => ({
      adjust_date: adjustDate,
      section_id: sectionId,
      period_number: c.period,
      is_tag: c.isTag,
      original_teacher_id: c.originalTeacherId,
      new_teacher_id: c.newTeacherId,
      original_subject_id: c.originalSubjectId,
      new_subject_id: c.newSubjectId,
      original_room_id: c.originalRoomId,
      new_room_id: c.newRoomId,
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

  const dayIndex = getSchoolDayIndex(new Date(adjustDate + "T00:00:00"));
  if (dayIndex === null) return { error: "Cannot adjust on a weekend." };

  // Fetch all routines for conflict validation.
  const { data: allRoutines, error: rErr } = await admin
    .from("routines")
    .select("id, section_id, day, period_number, teacher_id, subject_id, room_id, is_tag, is_adjusted, original_teacher_id");
  if (rErr) return { error: rErr.message };

  const routines = (allRoutines ?? []) as RoutineRow[];

  // HARD BLOCK — a substitute can NEVER be double-booked at the same
  // day+period in another section, regardless of the force flag.
  for (const c of changes) {
    if (!c.newTeacherId) continue;
    const busy = routines.some(
      (r) =>
        r.day === dayIndex &&
        r.period_number === c.period &&
        r.teacher_id === c.newTeacherId &&
        r.section_id !== c.sectionId
    );
    if (busy) {
      return {
        error:
          "A substitute already teaches another class at this period. Free that teacher first.",
      };
    }
  }

  // Server-side validation of each adjustment.
  const warnings: { period: number; sectionId: string; level: "yellow" | "red"; reasons: string[] }[] = [];

  for (const c of changes) {
    if (!c.newTeacherId) continue;
    const sim = simulateTeacherAssignment(
      routines,
      c.newTeacherId,
      dayIndex,
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
      .filter((c) => c.newTeacherId || c.newSubjectId || c.newRoomId)
      .map((c) => ({
        adjust_date: adjustDate,
        section_id: sectionId,
        period_number: c.period,
        is_tag: c.isTag,
        original_teacher_id: c.originalTeacherId,
        new_teacher_id: c.newTeacherId,
        original_subject_id: c.originalSubjectId,
        new_subject_id: c.newSubjectId,
        original_room_id: c.originalRoomId,
        new_room_id: c.newRoomId,
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
  revalidatePath("/");
  revalidatePath("/routine");
  revalidatePath("/teacher");
  return { success: true, savedCount };
}
