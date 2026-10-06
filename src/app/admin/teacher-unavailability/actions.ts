"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { authed } from "@/app/admin/auth-helpers";
import { PERIOD_ORDER } from "@/lib/constants";
import { getSchoolDayIndex } from "@/lib/periods";
import { UNAVAILABLE_REASONS, type UnavailableReason } from "@/lib/types";

export interface SaveUnavailabilityInput {
  date: string;
  teacherId: string;
  reason: UnavailableReason;
  note: string;
  /**
   * When true the teacher is out for the whole day and `periods` is ignored —
   * all seven periods are written so the record is indistinguishable from a
   * per-period one to `isUnavailableAt`. When false only the listed periods are
   * written, and only /admin/adjust honours them.
   */
  wholeDay: boolean;
  periods: number[];
}

export type UnavailabilityResult = { error: string } | { success: true };

/**
 * Drop every path and tag whose answer depends on who is unavailable.
 *
 * Modelled on `setClassSuspension`, which also invalidates broadly across all
 * live surfaces because the derived free/busy split changes everywhere. The
 * `unavailability` tag is what clears `getTeacherUnavailability` itself.
 */
function revalidateUnavailabilityPaths() {
  revalidatePath("/admin/teacher-unavailability");
  revalidatePath("/admin");
  revalidatePath("/admin/adjust");
  revalidatePath("/admin/assign");
  revalidatePath("/admin/free-teachers");
  revalidatePath("/admin/unavailable-teachers");
  revalidatePath("/");
  revalidatePath("/routine");
  revalidatePath("/teacher");
  revalidateTag("unavailability");
  revalidateTag("adjustments");
  revalidateTag("routines");
}

/**
 * Replace a teacher's unavailability for one date.
 *
 * Delete-then-insert rather than an upsert: the admin edits by reticking
 * checkboxes, so there is no single natural key to upsert on — a period that
 * was ticked last time and is not ticked this time has to disappear, which an
 * insert-only save would never do.
 */
export async function saveTeacherUnavailability(
  input: SaveUnavailabilityInput,
): Promise<UnavailabilityResult> {
  const { admin, session } = await authed();

  const { date, teacherId, reason, note, wholeDay } = input;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { error: "Pick a date." };
  if (!teacherId) return { error: "Pick a teacher." };
  if (!UNAVAILABLE_REASONS.includes(reason))
    return { error: "Pick a reason." };

  // Fri/Sat are not school days, and a record there would silently do nothing
  // anywhere — rejected rather than stored, matching the adjustment validator
  // which refuses weekend substitutions outright.
  if (getSchoolDayIndex(new Date(`${date}T00:00:00`)) === null)
    return { error: "No school on Friday or Saturday. Pick a weekday." };

  const selected = wholeDay
    ? [...PERIOD_ORDER]
    : Array.from(new Set(input.periods)).sort((a, b) => a - b);

  if (selected.length === 0)
    return { error: "Tick Whole day, or at least one period." };
  if (selected.some((p) => !Number.isInteger(p) || p < 1 || p > 7))
    return { error: "Periods must be between 1 and 7." };

  const trimmedNote = note.trim();
  // "Other" is a label nobody else can interpret, so an empty note would store
  // a row the report renders as a bare reason with no explanation.
  if (reason === "other" && !trimmedNote)
    return { error: "Add a note explaining an “Other” reason." };

  const { error: delErr } = await admin
    .from("teacher_unavailability")
    .delete()
    .eq("absent_date", date)
    .eq("teacher_id", teacherId);
  if (delErr) return { error: delErr.message };

  const { error: insErr } = await admin.from("teacher_unavailability").insert(
    selected.map((period) => ({
      absent_date: date,
      teacher_id: teacherId,
      reason,
      note: trimmedNote || null,
      period_number: period,
      is_whole_day: wholeDay,
      created_by: session.id,
    })),
  );
  if (insErr) return { error: insErr.message };

  revalidateUnavailabilityPaths();
  return { success: true };
}

/** Remove one teacher's unavailability for one date entirely. */
export async function clearTeacherUnavailability(
  date: string,
  teacherId: string,
): Promise<UnavailabilityResult> {
  const { admin } = await authed();
  if (!date || !teacherId) return { error: "Date and teacher are required." };

  const { error } = await admin
    .from("teacher_unavailability")
    .delete()
    .eq("absent_date", date)
    .eq("teacher_id", teacherId);
  if (error) return { error: error.message };

  revalidateUnavailabilityPaths();
  return { success: true };
}
