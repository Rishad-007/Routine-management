"use server";

import { revalidatePath } from "next/cache";
import { authed } from "@/app/admin/auth-helpers";
import {
  applyAdjustmentsToRoutines,
  simulateTeacherAssignment,
} from "@/lib/conflicts";
import { isPeriodAllowed, describePeriodRange } from "@/lib/class-period-rules";
import {
  fetchAllRows,
  getClassPeriodRules,
  getClasses,
  getSections,
  type PagedQuery,
} from "@/lib/data";
import { getSchoolDayIndex, resolveAdjustDate } from "@/lib/periods";
import { DAY_LABELS, type AdjustmentRow, type RoutineRow } from "@/lib/types";

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

/**
 * Class period-range rule check. Returns a friendly error string naming the
 * first rejected adjustment, or null when every period is allowed.
 * Uses the adjustment date's day-of-week (Thursday rules can be tighter).
 */
async function periodRuleError(
  changes: PeriodAdjustment[],
  dayIndex: number,
): Promise<string | null> {
  const [rules, sections, classes] = await Promise.all([
    getClassPeriodRules(),
    getSections(),
    getClasses(),
  ]);
  const classOf = (sectionId: string) => {
    const s = sections.find((x) => x.id === sectionId);
    return s ? classes.find((c) => c.id === s.class_id) : undefined;
  };
  for (const c of changes) {
    const cls = classOf(c.sectionId);
    if (!cls) continue;
    if (isPeriodAllowed(rules, cls.id, dayIndex, c.period)) continue;
    return `${cls.name} only has ${describePeriodRange(
      rules,
      cls.id,
      dayIndex,
    )} on ${DAY_LABELS[dayIndex]} (period ${c.period} rejected).`;
  }
  return null;
}

/**
 * Replace the date-scoped adjustments for (date, section).
 * Pass only the periods that have a substitution (newTeacherId set);
 * clearing a substitution = omitting it from the list.
 */
export async function saveDayAdjustments(
  adjustDate: string,
  sectionId: string,
  changes: PeriodAdjustment[],
) {
  const { admin } = await authed();
  const effectiveDate = resolveAdjustDate(adjustDate);
  if (!effectiveDate || !sectionId)
    return { error: "Date and section are required." };

  const dayIndex = getSchoolDayIndex(new Date(effectiveDate + "T00:00:00"));
  if (dayIndex !== null) {
    const ruleError = await periodRuleError(changes, dayIndex);
    if (ruleError) return { error: ruleError };
  }

  const { error: delErr } = await admin
    .from("adjustment_batches")
    .delete()
    .eq("adjust_date", effectiveDate)
    .eq("section_id", sectionId);
  if (delErr) return { error: delErr.message };

  const insertRows = changes
    .filter((c) => c.newTeacherId || c.newSubjectId || c.newRoomId)
    .map((c) => ({
      period_number: c.period,
      assignment_role: c.isTag ? "tag" : "primary",
      original_teacher_id: c.originalTeacherId,
      new_teacher_id: c.newTeacherId,
      original_subject_id: c.originalSubjectId,
      new_subject_id: c.newSubjectId,
      original_room_id: c.originalRoomId,
      new_room_id: c.newRoomId,
      reason: c.reason ?? null,
    }));

  if (insertRows.length > 0) {
    const { data: batch, error: batchErr } = await admin
      .from("adjustment_batches")
      .insert({
        adjust_date: effectiveDate,
        section_id: sectionId,
        created_by: null,
      })
      .select("id")
      .single();
    if (batchErr) return { error: batchErr.message };
    const { error: insErr } = await admin
      .from("adjustment_assignments")
      .insert(insertRows.map((row) => ({ ...row, batch_id: batch.id })));
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
  force: boolean,
) {
  const { admin } = await authed();
  const effectiveDate = resolveAdjustDate(adjustDate);
  if (!effectiveDate) return { error: "Date is required." };

  const dayIndex = getSchoolDayIndex(new Date(effectiveDate + "T00:00:00"));
  if (dayIndex === null) return { error: "Cannot adjust on a weekend." };

  // Class period-range rule check (defense-in-depth at the API layer).
  const ruleError = await periodRuleError(changes, dayIndex);
  if (ruleError) return { error: ruleError };

  // Fetch all routines for conflict validation. Paged — an unbounded select
  // returns only the first 1000 of 3000+ rows, which would let a substitute be
  // double-booked against a row this check never saw.
  let allRoutines: RoutineRow[];
  let dateAdjustments: AdjustmentRow[];
  try {
    [allRoutines, dateAdjustments] = await Promise.all([
      fetchAllRows<RoutineRow>(
        () =>
          admin
            .from("routines")
            .select(
              "id, section_id, day, period_number, teacher_id, subject_id, room_id, is_tag, is_adjusted, original_teacher_id",
              { count: "exact" },
            ) as unknown as PagedQuery<RoutineRow>,
      ),
      fetchAllRows<AdjustmentRow>(
        () =>
          admin
            .from("adjustments")
            .select("*", { count: "exact" })
            .eq("adjust_date", effectiveDate) as unknown as PagedQuery<AdjustmentRow>,
      ),
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load routines." };
  }

  // Scope the overlay to this weekday: applyAdjustmentsToRoutines keys on
  // section+period+is_tag only, so feeding it the whole week would rewrite the
  // same section/period on every other day too.
  const routines = [
    ...allRoutines.filter((r) => r.day !== dayIndex),
    ...applyAdjustmentsToRoutines(
      allRoutines.filter((r) => r.day === dayIndex),
      dateAdjustments,
      effectiveDate,
    ),
  ];

  // Fold the incoming batch into the day's schedule FIRST so multiple
  // substitutions in the same save are cross-graded against each other — a
  // choice that resolves one conflict is visible to the next, exactly matching
  // what the client previews before saving.
  const folded = routines.map((r) => ({ ...r }));
  for (const c of changes) {
    if (!c.newTeacherId) continue;
    const target = folded.find(
      (r) =>
        r.day === dayIndex &&
        r.period_number === c.period &&
        r.section_id === c.sectionId &&
        r.is_tag === c.isTag,
    );
    if (target) {
      target.teacher_id = c.newTeacherId;
      if (c.newSubjectId !== undefined) target.subject_id = c.newSubjectId;
      if (c.newRoomId !== undefined) target.room_id = c.newRoomId;
    }
  }

  // HARD BLOCK — a substitute can NEVER be double-booked at the same
  // day+period in another section, regardless of the force flag.
  for (const c of changes) {
    if (!c.newTeacherId) continue;
    const busy = folded.some(
      (r) =>
        r.day === dayIndex &&
        r.period_number === c.period &&
        r.teacher_id === c.newTeacherId &&
        r.section_id !== c.sectionId,
    );
    if (busy) {
      return {
        error:
          "A substitute already teaches another class at this period. Free that teacher first.",
      };
    }
  }

  // Server-side validation of each adjustment.
  const warnings: {
    period: number;
    sectionId: string;
    level: "yellow" | "red";
    reasons: string[];
  }[] = [];

  for (const c of changes) {
    if (!c.newTeacherId) continue;

    // Revert THIS one change on a copy so the simulation sees the other
    // pending substitutions applied but not the one it is grading.
    const simRoutines = folded.map((r) => ({ ...r }));
    const foldedTarget = simRoutines.find(
      (r) =>
        r.day === dayIndex &&
        r.period_number === c.period &&
        r.section_id === c.sectionId &&
        r.is_tag === c.isTag,
    );
    const baseRow = routines.find(
      (r) =>
        r.day === dayIndex &&
        r.period_number === c.period &&
        r.section_id === c.sectionId &&
        r.is_tag === c.isTag,
    );
    if (foldedTarget && baseRow) {
      foldedTarget.teacher_id = baseRow.teacher_id;
      foldedTarget.subject_id = baseRow.subject_id;
      foldedTarget.room_id = baseRow.room_id;
    }

    const sim = simulateTeacherAssignment(
      simRoutines,
      c.newTeacherId,
      dayIndex,
      c.period,
      c.sectionId,
      c.isTag,
    );
    if (sim.level === "yellow") {
      warnings.push({
        period: c.period,
        sectionId: c.sectionId,
        level: "yellow",
        reasons: sim.reasons,
      });
    } else if (sim.level === "red") {
      warnings.push({
        period: c.period,
        sectionId: c.sectionId,
        level: "red",
        reasons: sim.reasons,
      });
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
      .from("adjustment_batches")
      .delete()
      .eq("adjust_date", effectiveDate)
      .eq("section_id", sectionId);
    if (delErr) return { error: delErr.message };

    const insertRows = sectionChanges
      .filter((c) => c.newTeacherId || c.newSubjectId || c.newRoomId)
      .map((c) => ({
        period_number: c.period,
        assignment_role: c.isTag ? "tag" : "primary",
        original_teacher_id: c.originalTeacherId,
        new_teacher_id: c.newTeacherId,
        original_subject_id: c.originalSubjectId,
        new_subject_id: c.newSubjectId,
        original_room_id: c.originalRoomId,
        new_room_id: c.newRoomId,
        reason: c.reason ?? null,
      }));

    if (insertRows.length > 0) {
      const { data: batch, error: batchErr } = await admin
        .from("adjustment_batches")
        .insert({
          adjust_date: effectiveDate,
          section_id: sectionId,
          created_by: null,
        })
        .select("id")
        .single();
      if (batchErr) return { error: batchErr.message };
      const { error: insErr } = await admin
        .from("adjustment_assignments")
        .insert(insertRows.map((row) => ({ ...row, batch_id: batch.id })));
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
