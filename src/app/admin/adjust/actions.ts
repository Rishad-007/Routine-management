"use server";

import { revalidatePath, revalidateTag } from "next/cache";
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
 * Turn raw Postgres / trigger text into something an admin can act on.
 *
 * The adjustment triggers raise plain exceptions and PostgREST surfaces unique
 * violations verbatim; both used to reach the UI as engine jargon like
 * "duplicate key value violates unique constraint".
 */
function friendlyWriteError(message: string): string {
  if (/duplicate key|23505/i.test(message)) {
    return "This adjustment was just saved by another action. Reload and try again.";
  }
  if (/already teaching another class/i.test(message)) {
    return "That teacher already teaches another class at this day and period.";
  }
  if (/already assigned to another class/i.test(message)) {
    return "That teacher is already assigned to another class on this date and period.";
  }
  if (/non-school day/i.test(message)) {
    return "Cannot adjust on a non-school day (Friday or Saturday).";
  }
  if (/outside the allowed range/i.test(message)) {
    return `That period is not allowed for this class on this day (${message}).`;
  }
  return message;
}

/**
 * Every surface that renders substitutions. The weekly grids now overlay the
 * whole school week, so /admin/free-teachers must be invalidated too — it was
 * missing before and kept showing the pre-save free/busy split for a full
 * minute.
 */
function revalidateAdjustmentViews() {
  revalidatePath("/admin/adjust");
  revalidatePath("/admin/free-teachers");
  revalidatePath("/");
  revalidatePath("/routine");
  revalidatePath("/teacher");
  revalidateTag("adjustments");
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

  revalidateAdjustmentViews();
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
  const { admin, session } = await authed();
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
    // Must come from `allRoutines` (never overlaid). Reverting to a row of the
    // overlaid set would restore the SAVED SUBSTITUTE rather than the genuine
    // original, so re-editing an existing adjustment graded the wrong teacher.
    const baseRow = allRoutines.find(
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

  // Group changes by section so each (date, section) batch is written once.
  const bySection = new Map<string, PeriodAdjustment[]>();
  for (const c of changes) {
    if (!bySection.has(c.sectionId)) bySection.set(c.sectionId, []);
    bySection.get(c.sectionId)!.push(c);
  }

  let savedCount = 0;

  for (const [sectionId, sectionChanges] of bySection) {
    const insertRows = sectionChanges
      .filter((c) => c.newTeacherId || c.newSubjectId || c.newRoomId)
      .map((c) => {
        // `original_*` is DERIVED from the base weekly routine, never taken from
        // the client. The client only ever sees the post-adjustment state, so a
        // value it sends for a re-edit is the previous substitute — trusting it
        // rewrote the audit chain on every edit (A -> B -> A recorded
        // "original = B"). The base row is the only stable truth, and it is
        // what makes repeated edits safe.
        const base = allRoutines.find(
          (r) =>
            r.day === dayIndex &&
            r.period_number === c.period &&
            r.section_id === c.sectionId &&
            r.is_tag === c.isTag,
        );
        return {
          period_number: c.period,
          assignment_role: c.isTag ? "tag" : "primary",
          original_teacher_id: base?.teacher_id ?? null,
          new_teacher_id: c.newTeacherId,
          original_subject_id: base?.subject_id ?? null,
          new_subject_id: c.newSubjectId,
          original_room_id: base?.room_id ?? null,
          new_room_id: c.newRoomId,
          reason: c.reason ?? null,
        };
      });

    // Nothing to write for this section (e.g. every change was a no-op) — do not
    // create an empty batch, since the CHECK constraint below rejects all-null
    // rows and an empty batch is pure litter.
    if (insertRows.length === 0) continue;

    // Upsert the batch on its natural key. A plain INSERT raced with itself the
    // moment the same section was saved twice (23505 on
    // unique(adjust_date, section_id)); upsert is idempotent and also keeps the
    // batch id stable across edits instead of churning a new one each time.
    const { data: batch, error: batchErr } = await admin
      .from("adjustment_batches")
      .upsert(
        {
          adjust_date: effectiveDate,
          section_id: sectionId,
          created_by: session.id,
        },
        { onConflict: "adjust_date,section_id" },
      )
      .select("id")
      .single();
    if (batchErr) return { error: friendlyWriteError(batchErr.message) };

    // Replace ONLY the periods being written, and do it as a single atomic
    // statement rather than delete-then-insert.
    //
    // The previous sequence deleted the existing rows first and then inserted.
    // If the insert was rejected — say the conflict trigger fired — the old,
    // working substitution had already been destroyed, leaving the period with
    // no adjustment at all. That is exactly the "the period just vanishes"
    // failure. `onConflict: batch_id,period_number,assignment_role` targets the
    // table's natural key, so one upsert both creates and replaces and a
    // rejection leaves the previous row untouched.
    //
    // Rows for periods NOT in this payload are deliberately not mentioned, so
    // sibling adjustments on the same day survive.
    const { error: insErr } = await admin
      .from("adjustment_assignments")
      .upsert(
        insertRows.map((row) => ({ ...row, batch_id: batch.id })),
        { onConflict: "batch_id,period_number,assignment_role" },
      );
    if (insErr) return { error: friendlyWriteError(insErr.message) };

    savedCount += insertRows.length;
  }

  revalidateAdjustmentViews();
  return { success: true, savedCount };
}

/**
 * Clear saved adjustments for specific periods of a (date, section).
 *
 * Backs both the "Revert to original teacher" and "Remove adjustment" actions —
 * they are the same database operation. Deleting the row makes the base weekly
 * routine's teacher effective again, which is exactly what "revert" means.
 *
 * Only the requested periods are deleted, so sibling adjustments on the same
 * day survive. A missing batch or a period that has no adjustment is a no-op
 * success rather than an error, which keeps the action idempotent.
 */
export async function removeAdjustment(
  adjustDate: string,
  sectionId: string,
  entries: { period: number; isTag: boolean }[],
) {
  const { admin } = await authed();
  const effectiveDate = resolveAdjustDate(adjustDate);
  if (!effectiveDate || !sectionId)
    return { error: "Date and section are required." };
  if (!entries || entries.length === 0)
    return { error: "No periods to clear." };

  const dayIndex = getSchoolDayIndex(new Date(effectiveDate + "T00:00:00"));
  if (dayIndex === null) return { error: "Cannot adjust on a weekend." };

  const { data: batch, error: batchErr } = await admin
    .from("adjustment_batches")
    .select("id")
    .eq("adjust_date", effectiveDate)
    .eq("section_id", sectionId)
    .maybeSingle();
  if (batchErr) return { error: friendlyWriteError(batchErr.message) };
  // Nothing saved for this section/day — already in the desired state.
  if (!batch) return { success: true, removed: 0 };

  // Delete by exact (period, role) identity rather than a period-only `in()`:
  // a primary and a tag adjustment share a period, and removing one must not
  // take the other with it.
  const predicate = entries
    .map(
      (e) =>
        `and(period_number.eq.${Number(e.period)},assignment_role.eq.${
          e.isTag ? "tag" : "primary"
        })`,
    )
    .join(",");

  const { data: doomed, error: selectErr } = await admin
    .from("adjustment_assignments")
    .select("id")
    .eq("batch_id", batch.id)
    .or(predicate);
  if (selectErr) return { error: friendlyWriteError(selectErr.message) };

  const ids = (doomed ?? []).map((row) => row.id as string);
  if (ids.length === 0) return { success: true, removed: 0 };

  const { error: delErr } = await admin
    .from("adjustment_assignments")
    .delete()
    .in("id", ids);
  if (delErr) return { error: friendlyWriteError(delErr.message) };

  // Drop the batch once it is empty. An orphaned batch is invisible through the
  // `adjustments` view but still occupies the unique key and shows up in
  // maintenance queries, so clean it up. A failure here is not worth reporting
  // — the rows the user cared about are already gone.
  const { data: remaining } = await admin
    .from("adjustment_assignments")
    .select("id")
    .eq("batch_id", batch.id)
    .limit(1);
  if (!remaining || remaining.length === 0) {
    await admin.from("adjustment_batches").delete().eq("id", batch.id);
  }

  revalidateAdjustmentViews();
  return { success: true, removed: ids.length };
}
