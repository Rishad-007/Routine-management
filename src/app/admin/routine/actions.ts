"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import {
  allTeacherLoads,
  isTeacherBusy,
} from "@/lib/conflicts";
import type { RoutineRow } from "@/lib/types";

export interface MatrixEdit {
  day: number;
  period: number;
  subjectId: string | null;
  teacherId: string | null;
  roomId: string | null;
}

export interface ConflictWarning {
  type: "busy" | "overload";
  level: "yellow" | "red";
  teacherName: string;
  detail: string;
}

async function authed() {
  const session = await requireAdmin();
  return { session, admin: createAdminClient() };
}

/**
 * Replace a section's full-week routine with the provided matrix.
 * Detects conflicts first; if conflicts exist and !force, returns them
 * without saving (the client then offers a "save anyway" / force option).
 */
export async function saveSectionRoutine(
  sectionId: string,
  edits: MatrixEdit[],
  force: boolean
) {
  const { admin } = await authed();
  if (!sectionId) return { error: "Missing section." };

  const teacherNames = new Map<string, string>();
  const { data: teachers, error: tErr } = await admin.from("teachers").select("id, short_name");
  if (tErr) return { error: tErr.message };
  for (const t of teachers ?? []) teacherNames.set(t.id, t.short_name);

  // Existing routines for all sections (for conflict checks).
  const { data: allRoutines, error: rErr } = await admin
    .from("routines")
    .select("id, section_id, day, period_number, teacher_id, subject_id, room_id");
  if (rErr) return { error: rErr.message };

  // Build simulated routine set: other sections as-is + this section's new rows.
  const others = (allRoutines ?? []).filter((r) => r.section_id !== sectionId);
  const newRows: RoutineRow[] = edits.map((e, i) => ({
    id: `new-${i}`,
    section_id: sectionId,
    day: e.day,
    period_number: e.period,
    teacher_id: e.teacherId,
    subject_id: e.subjectId,
    room_id: e.roomId,
    is_adjusted: false,
    original_teacher_id: null,
  }));
  const simulated = [...others, ...newRows] as RoutineRow[];

  // --- Conflict detection ---
  const warnings: ConflictWarning[] = [];

  // 1) Busy: same teacher in two sections at the same day+period.
  for (const e of edits) {
    if (!e.teacherId) continue;
    const busy = isTeacherBusy(
      simulated,
      e.teacherId,
      e.day,
      e.period,
      `new-${edits.indexOf(e)}`
    );
    if (busy) {
      warnings.push({
        type: "busy",
        level: "red",
        teacherName: teacherNames.get(e.teacherId) ?? "Teacher",
        detail: `Double-booked on day ${e.day + 1}, period ${e.period}`,
      });
    }
  }

  // 2) Overload: a teacher exceeds yellow/red daily threshold in the simulation.
  const loads = allTeacherLoads(simulated);
  for (const [teacherId, dayLoads] of loads) {
    for (const dl of dayLoads) {
      if (dl.level !== "ok") {
        warnings.push({
          type: "overload",
          level: dl.level,
          teacherName: teacherNames.get(teacherId) ?? "Teacher",
          detail: `Day ${dl.day + 1}: ${dl.reasons.join(", ")}`,
        });
      }
    }
  }

  // Dedupe warnings (same teacher+period busy can appear once per edit).
  const seen = new Set<string>();
  const uniqueWarnings = warnings.filter((w) => {
    const k = `${w.type}|${w.teacherName}|${w.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (uniqueWarnings.length > 0 && !force) {
    return { warnings: uniqueWarnings };
  }

  // --- Persist ---
  const { error: delErr } = await admin.from("routines").delete().eq("section_id", sectionId);
  if (delErr) return { error: delErr.message };

  const insertRows = edits
    .filter((e) => e.subjectId ?? e.teacherId ?? e.roomId)
    .map((e) => ({
      section_id: sectionId,
      day: e.day,
      period_number: e.period,
      teacher_id: e.teacherId,
      subject_id: e.subjectId,
      room_id: e.roomId,
    }));

  if (insertRows.length > 0) {
    const { error: insErr } = await admin.from("routines").insert(insertRows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/admin/routine");
  revalidatePath("/");
  revalidatePath("/routine");
  revalidatePath("/teacher");
  return { success: true, savedCount: insertRows.length, warnings: uniqueWarnings };
}
