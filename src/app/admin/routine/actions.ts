"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { authed } from "@/app/admin/auth-helpers";
import {
  allTeacherLoadsIndexed,
  buildRoutineIndex,
  isTeacherBusy,
} from "@/lib/conflicts";
import { isPeriodAllowed, describePeriodRange } from "@/lib/class-period-rules";
import {
  fetchAllRows,
  getClassPeriodRules,
  getClasses,
  getSections,
  type PagedQuery,
} from "@/lib/data";
import { DAY_LABELS, type RoutineRow } from "@/lib/types";

export interface MatrixEdit {
  day: number;
  period: number;
  subjectId: string | null;
  teacherId: string | null;
  roomId: string | null;
  isTag: boolean;
}

export interface ConflictWarning {
  type: "busy" | "overload";
  level: "yellow" | "red";
  teacherName: string;
  detail: string;
}

/**
 * Replace a section's full-week routine with the provided matrix.
 * Detects conflicts first; if conflicts exist and !force, returns them
 * without saving (the client then offers a "save anyway" / force option).
 */
export async function saveSectionRoutine(
  sectionId: string,
  edits: MatrixEdit[],
  force: boolean,
) {
  const { admin } = await authed();
  if (!sectionId) return { error: "Missing section." };

  // Class period-range rule check (server-authoritative, friendly message).
  // Class 1–2 start at period 5; Class 3/4 end at 4 (3 on Thursday), etc.
  const [rules, sections, classes] = await Promise.all([
    getClassPeriodRules(),
    getSections(),
    getClasses(),
  ]);
  const section = sections.find((s) => s.id === sectionId);
  const sectionClass = section
    ? classes.find((c) => c.id === section.class_id)
    : undefined;
  if (sectionClass) {
    for (const e of edits) {
      if (isPeriodAllowed(rules, sectionClass.id, e.day, e.period)) continue;
      return {
        error: `${sectionClass.name} only has ${describePeriodRange(
          rules,
          sectionClass.id,
          e.day,
        )} on ${DAY_LABELS[e.day]} (period ${e.period} rejected).`,
      };
    }
  }

  const teacherNames = new Map<string, string>();
  const { data: teachers, error: tErr } = await admin
    .from("teachers")
    .select("id, full_name");
  if (tErr) return { error: tErr.message };
  for (const t of teachers ?? []) teacherNames.set(t.id, t.full_name);

  // Existing routines for all sections (for conflict checks). Must be paged —
  // an unbounded select returns only the first 1000 of 3000+ rows, which would
  // make this check pass while the DB trigger still rejects the write.
  let allRoutines: RoutineRow[];
  try {
    allRoutines = await fetchAllRows<RoutineRow>(
      () =>
        admin
          .from("routines")
          .select(
            "id, section_id, day, period_number, teacher_id, subject_id, room_id, is_tag",
            { count: "exact" },
          ) as unknown as PagedQuery<RoutineRow>,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load routines." };
  }

  // Build simulated routine set: other sections as-is + this section's new rows.
  const others = allRoutines.filter((r) => r.section_id !== sectionId);
  const newRows: RoutineRow[] = edits.map((e, i) => ({
    id: `new-${i}`,
    section_id: sectionId,
    day: e.day,
    period_number: e.period,
    teacher_id: e.teacherId,
    subject_id: e.subjectId,
    room_id: e.roomId,
    is_tag: e.isTag,
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
      `new-${edits.indexOf(e)}`,
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
  // Indexed: the scanning variant is O(teachers x days x rows), which is ~5M
  // row visits now that reads return the full 3000+ rows.
  const loads = allTeacherLoadsIndexed(buildRoutineIndex(simulated));
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

  // HARD BLOCK — a teacher can NEVER be double-booked (same day+period in
  // two sections), regardless of force. Overload (load-based) warnings are
  // still force-approvable, but same-period double-booking is not.
  const busyWarnings = uniqueWarnings.filter((w) => w.type === "busy");
  if (busyWarnings.length > 0) {
    return {
      error:
        "Cannot save: " +
        busyWarnings.map((w) => `${w.teacherName} — ${w.detail}`).join("; ") +
        ". Free the teacher in that period first.",
    };
  }

  if (uniqueWarnings.length > 0 && !force) {
    return { warnings: uniqueWarnings };
  }

  // --- Persist ---
  // supabase-js has no transactions, so this is delete-then-insert across three
  // round trips. Snapshot the section first: if any later step fails we restore
  // it, rather than leaving the section's whole week wiped.
  const snapshot = await snapshotSection(admin, sectionId);

  const { error: delErr } = await admin
    .from("routine_slots")
    .delete()
    .eq("section_id", sectionId);
  if (delErr) return { error: delErr.message };

  const filledEdits = edits.filter(
    (e) => e.subjectId ?? e.teacherId ?? e.roomId,
  );
  const slotKeys = new Set(filledEdits.map((e) => `${e.day}:${e.period}`));
  const { data: slots, error: slotErr } = await admin
    .from("routine_slots")
    .insert(
      [...slotKeys].map((key) => {
        const [day, period] = key.split(":").map(Number);
        return { section_id: sectionId, day, period_number: period };
      }),
    )
    .select("id, day, period_number");
  if (slotErr) {
    await restoreSection(admin, sectionId, snapshot);
    return { error: slotErr.message };
  }

  const slotByKey = new Map(
    (slots ?? []).map((slot) => [`${slot.day}:${slot.period_number}`, slot.id]),
  );
  const insertRows = filledEdits.map((e) => ({
    slot_id: slotByKey.get(`${e.day}:${e.period}`),
    assignment_role: e.isTag ? "tag" : "primary",
    teacher_id: e.teacherId,
    subject_id: e.subjectId,
    room_id: e.roomId,
  }));

  if (insertRows.length > 0) {
    const { error: insErr } = await admin
      .from("routine_assignments")
      .insert(insertRows);
    if (insErr) {
      await restoreSection(admin, sectionId, snapshot);
      return { error: insErr.message };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/routine");
  revalidatePath("/admin/adjust");
  revalidatePath("/admin/free-teachers");
  revalidatePath("/");
  revalidatePath("/routine");
  revalidatePath("/teacher");
  revalidateTag("routines");
  return {
    success: true,
    savedCount: insertRows.length,
    warnings: uniqueWarnings,
  };
}

type AdminClient = Awaited<ReturnType<typeof authed>>["admin"];

interface SectionSnapshot {
  slots: { day: number; period_number: number }[];
  assignments: {
    day: number;
    period_number: number;
    assignment_role: string;
    teacher_id: string | null;
    subject_id: string | null;
    room_id: string | null;
  }[];
}

/** Capture a section's current week so a failed save can be rolled back. */
async function snapshotSection(
  admin: AdminClient,
  sectionId: string,
): Promise<SectionSnapshot> {
  const { data } = await admin
    .from("routine_slots")
    .select(
      "day, period_number, routine_assignments(assignment_role, teacher_id, subject_id, room_id)",
    )
    .eq("section_id", sectionId);

  const slots: SectionSnapshot["slots"] = [];
  const assignments: SectionSnapshot["assignments"] = [];
  for (const slot of data ?? []) {
    slots.push({ day: slot.day, period_number: slot.period_number });
    for (const a of slot.routine_assignments ?? []) {
      assignments.push({
        day: slot.day,
        period_number: slot.period_number,
        assignment_role: a.assignment_role,
        teacher_id: a.teacher_id,
        subject_id: a.subject_id,
        room_id: a.room_id,
      });
    }
  }
  return { slots, assignments };
}

/**
 * Put a snapshotted section back after a failed save. Best-effort compensation,
 * not a transaction: it cannot survive a process crash mid-save, but it does
 * stop an ordinary error (a trigger rejection, a concurrent writer) from
 * leaving the section's whole week deleted.
 */
async function restoreSection(
  admin: AdminClient,
  sectionId: string,
  snapshot: SectionSnapshot,
): Promise<void> {
  if (snapshot.slots.length === 0) return;

  await admin.from("routine_slots").delete().eq("section_id", sectionId);

  const { data: restored } = await admin
    .from("routine_slots")
    .insert(
      snapshot.slots.map((s) => ({
        section_id: sectionId,
        day: s.day,
        period_number: s.period_number,
      })),
    )
    .select("id, day, period_number");
  if (!restored?.length) return;

  const byKey = new Map(
    restored.map((s) => [`${s.day}:${s.period_number}`, s.id]),
  );
  const rows = snapshot.assignments
    .map((a) => ({
      slot_id: byKey.get(`${a.day}:${a.period_number}`),
      assignment_role: a.assignment_role,
      teacher_id: a.teacher_id,
      subject_id: a.subject_id,
      room_id: a.room_id,
    }))
    .filter((r) => r.slot_id);
  if (rows.length > 0) await admin.from("routine_assignments").insert(rows);
}
