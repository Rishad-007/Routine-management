"use server";

import { revalidatePath } from "next/cache";
import { authed } from "@/app/admin/auth-helpers";
import {
  buildRoutineIndex,
  teacherDayLoadIndexed,
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

export type AssignmentRole = "primary" | "tag";

export interface AssignInput {
  teacherId: string;
  sectionId: string;
  day: number;
  period: number;
  subjectId: string | null;
  roomId: string | null;
  /** Omitted on the first call so the server can report an occupied cell. */
  role?: AssignmentRole;
  /** Approves yellow/red workload warnings. Never approves a double-booking. */
  force?: boolean;
}

export interface AssignWarning {
  level: "yellow" | "red";
  detail: string;
}

export type AssignResult =
  | { error: string }
  /** The cell already has a primary; the caller must pick tag vs replace. */
  | { needsRoleChoice: true; occupiedBy: string; canAddTag: boolean }
  | { warnings: AssignWarning[] }
  | { success: true; role: AssignmentRole };

function revalidateRoutinePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/assign");
  revalidatePath("/admin/free-teachers");
  revalidatePath("/admin/routine");
  revalidatePath("/admin/adjust");
  revalidatePath("/");
  revalidatePath("/routine");
  revalidatePath("/teacher");
}

/**
 * Assign one teacher to one section's day+period.
 *
 * The section-wide builder rewrites a whole week; this writes a single cell, so
 * it must do its own validation. Order matters: everything is checked before
 * the slot is touched, so a rejection never leaves an empty orphan slot behind.
 */
export async function assignTeacherPeriod(
  input: AssignInput,
): Promise<AssignResult> {
  const { admin } = await authed();
  const { teacherId, sectionId, day, period } = input;

  if (!teacherId) return { error: "Pick a teacher." };
  if (!sectionId) return { error: "Pick a class and section." };
  if (!Number.isInteger(day) || day < 0 || day > 4)
    return { error: "Invalid day." };
  if (!Number.isInteger(period) || period < 1 || period > 7)
    return { error: "Invalid period." };

  const [rules, sections, classes] = await Promise.all([
    getClassPeriodRules(),
    getSections(),
    getClasses(),
  ]);

  const section = sections.find((s) => s.id === sectionId);
  if (!section) return { error: "That section no longer exists." };
  const sectionClass = classes.find((c) => c.id === section.class_id);
  const sectionLabel = `${sectionClass?.name ?? "—"} — ${section.name}`;

  // 1) Class period rule.
  if (sectionClass && !isPeriodAllowed(rules, sectionClass.id, day, period)) {
    return {
      error: `${sectionClass.name} only has ${describePeriodRange(
        rules,
        sectionClass.id,
        day,
      )} on ${DAY_LABELS[day]} (period ${period} rejected).`,
    };
  }

  let routines: RoutineRow[];
  let teacherNames: Map<string, string>;
  try {
    const [rows, teachers] = await Promise.all([
      fetchAllRows<RoutineRow>(
        () =>
          admin
            .from("routines")
            .select(
              "id, section_id, day, period_number, teacher_id, subject_id, room_id, is_tag",
              { count: "exact" },
            ) as unknown as PagedQuery<RoutineRow>,
      ),
      admin.from("teachers").select("id, full_name"),
    ]);
    routines = rows;
    teacherNames = new Map(
      (teachers.data ?? []).map((t) => [t.id, t.full_name as string]),
    );
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not load the routine.",
    };
  }

  const teacherName = teacherNames.get(teacherId) ?? "This teacher";

  // 2) Double-booking — a hard block, mirroring trg_validate_routine_assignment
  // which allows no same-section and no same-slot exemption.
  const heldElsewhere = routines.find(
    (r) =>
      r.teacher_id === teacherId &&
      r.day === day &&
      r.period_number === period &&
      r.section_id !== sectionId,
  );
  if (heldElsewhere) {
    const other = sections.find((s) => s.id === heldElsewhere.section_id);
    const otherClass = other
      ? classes.find((c) => c.id === other.class_id)
      : undefined;
    const where = other ? `${otherClass?.name ?? "—"} — ${other.name}` : "another section";
    return {
      error: `${teacherName} already teaches ${where} in period ${period} on ${DAY_LABELS[day]}. Free that period first.`,
    };
  }

  // 3) Work out which seat to take.
  const { data: slotRow } = await admin
    .from("routine_slots")
    .select("id")
    .eq("section_id", sectionId)
    .eq("day", day)
    .eq("period_number", period)
    .maybeSingle();

  let existing: {
    id: string;
    assignment_role: string;
    teacher_id: string | null;
  }[] = [];
  if (slotRow?.id) {
    const { data } = await admin
      .from("routine_assignments")
      .select("id, assignment_role, teacher_id")
      .eq("slot_id", slotRow.id);
    existing = data ?? [];
  }

  const primary = existing.find((a) => a.assignment_role === "primary");
  const tag = existing.find((a) => a.assignment_role === "tag");

  // Holding the other seat in the same slot would trip the DB trigger.
  const ownsPrimary = primary?.teacher_id === teacherId;
  const ownsTag = tag?.teacher_id === teacherId;

  let role: AssignmentRole;
  if (ownsPrimary) {
    role = "primary";
  } else if (ownsTag) {
    role = "tag";
  } else if (!primary && !tag) {
    role = "primary";
  } else if (!primary && tag) {
    // A tag with no primary is dropped by the matrix builders, so fill the
    // primary seat rather than adding a second tag.
    role = "primary";
  } else if (primary && !tag) {
    if (!input.role) {
      return {
        needsRoleChoice: true,
        occupiedBy: teacherNames.get(primary.teacher_id ?? "") ?? "another teacher",
        canAddTag: true,
      };
    }
    role = input.role;
  } else {
    return {
      error: `Period ${period} in ${sectionLabel} already has two teachers (${
        teacherNames.get(primary?.teacher_id ?? "") ?? "—"
      } and ${
        teacherNames.get(tag?.teacher_id ?? "") ?? "—"
      }). Remove one first.`,
    };
  }

  // 4) Workload + room warnings on a simulated world.
  const simulated = routines.filter(
    (r) =>
      !(
        r.section_id === sectionId &&
        r.day === day &&
        r.period_number === period &&
        r.is_tag === (role === "tag")
      ),
  );
  simulated.push({
    id: "pending",
    section_id: sectionId,
    day,
    period_number: period,
    teacher_id: teacherId,
    subject_id: input.subjectId,
    room_id: input.roomId,
    is_tag: role === "tag",
    is_adjusted: false,
    original_teacher_id: null,
  });

  const warnings: AssignWarning[] = [];
  const load = teacherDayLoadIndexed(
    buildRoutineIndex(simulated),
    teacherId,
    day,
  );
  if (load.level !== "ok") {
    warnings.push({
      level: load.level,
      detail: `${teacherName} on ${DAY_LABELS[day]}: ${load.reasons.join(", ")}`,
    });
  }

  // Rooms are shared between sections, and nothing in the database checks this.
  if (input.roomId) {
    const clash = simulated.find(
      (r) =>
        r.room_id === input.roomId &&
        r.day === day &&
        r.period_number === period &&
        r.section_id !== sectionId,
    );
    if (clash) {
      const other = sections.find((s) => s.id === clash.section_id);
      const otherClass = other
        ? classes.find((c) => c.id === other.class_id)
        : undefined;
      warnings.push({
        level: "yellow",
        detail: `That room is also used by ${otherClass?.name ?? "—"} — ${
          other?.name ?? "—"
        } in this period.`,
      });
    }
  }

  if (warnings.length > 0 && !input.force) return { warnings };

  // 5) Write. upsert (not insert) because the slot usually already exists, and
  // because two admins could otherwise both insert it. ignoreDuplicates must
  // stay false: it compiles to DO NOTHING, which returns no row to .single().
  const { data: slot, error: slotErr } = await admin
    .from("routine_slots")
    .upsert(
      { section_id: sectionId, day, period_number: period },
      { onConflict: "section_id,day,period_number" },
    )
    .select("id")
    .single();
  if (slotErr || !slot) {
    return { error: slotErr?.message ?? "Could not open that period." };
  }

  const payload = {
    teacher_id: teacherId,
    subject_id: input.subjectId,
    room_id: input.roomId,
  };

  const seat = role === "primary" ? primary : tag;
  const { error: writeErr } = seat
    ? await admin.from("routine_assignments").update(payload).eq("id", seat.id)
    : await admin
        .from("routine_assignments")
        .insert({ slot_id: slot.id, assignment_role: role, ...payload });

  if (writeErr) {
    // Roll back a slot this call created, so a rejection leaves no empty slot.
    if (!slotRow?.id) {
      await admin.from("routine_slots").delete().eq("id", slot.id);
    }
    return { error: writeErr.message };
  }

  revalidateRoutinePaths();
  return { success: true, role };
}

export async function toggleTeacherOpen(
  teacherId: string,
  open: boolean,
): Promise<{ error: string } | { success: true; open: boolean }> {
  const { admin } = await authed();
  if (!teacherId) return { error: "Pick a teacher." };

  const { error } = await admin
    .from("teachers")
    .update({ is_open_teacher: open })
    .eq("id", teacherId);
  if (error) return { error: error.message };

  revalidateRoutinePaths();
  revalidatePath("/admin/master-data");
  return { success: true, open };
}

export interface UnassignInput {
  sectionId: string;
  day: number;
  period: number;
  role: AssignmentRole;
}

/**
 * Clear one seat of one cell.
 *
 * Removing a primary that still has a tag partner promotes the tag, because
 * every matrix builder assumes a slot has a primary — a tag-only slot would
 * otherwise render as an empty cell while still blocking its teacher.
 */
export async function unassignTeacherPeriod(
  input: UnassignInput,
): Promise<{ error: string } | { success: true }> {
  const { admin } = await authed();
  const { sectionId, day, period, role } = input;

  const { data: slot } = await admin
    .from("routine_slots")
    .select("id")
    .eq("section_id", sectionId)
    .eq("day", day)
    .eq("period_number", period)
    .maybeSingle();
  if (!slot?.id) return { success: true };

  const { error: delErr } = await admin
    .from("routine_assignments")
    .delete()
    .eq("slot_id", slot.id)
    .eq("assignment_role", role);
  if (delErr) return { error: delErr.message };

  const { data: remaining } = await admin
    .from("routine_assignments")
    .select("id, assignment_role")
    .eq("slot_id", slot.id);

  if (!remaining?.length) {
    // An empty slot is invisible in the `routines` view's inner join, so it
    // would just accumulate as drift.
    await admin.from("routine_slots").delete().eq("id", slot.id);
  } else if (role === "primary") {
    const orphanTag = remaining.find((a) => a.assignment_role === "tag");
    if (orphanTag) {
      // Promote after the delete, never before: unique(slot_id, assignment_role).
      const { error: promoteErr } = await admin
        .from("routine_assignments")
        .update({ assignment_role: "primary" })
        .eq("id", orphanTag.id);
      if (promoteErr) return { error: promoteErr.message };
    }
  }

  revalidateRoutinePaths();
  return { success: true };
}
