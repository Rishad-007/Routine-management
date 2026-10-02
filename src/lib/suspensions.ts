import type { ClassRow, SectionRow } from "./types";

/**
 * Class suspension helpers.
 *
 * There is no teacher->class assignment table: a teacher is "busy" only because
 * they occupy a `routines` row at a day+period. Suspension is therefore a LIVE
 * overlay — the weekly routine is preserved, but every live surface filters out
 * the suspended class's rows, which frees its teachers automatically.
 *
 * These helpers are pure and safe to import from both server and client code.
 */

/** Ids of every class currently suspended. */
export function suspendedClassIdSet(classes: ClassRow[]): Set<string> {
  return new Set(classes.filter((c) => c.is_suspended).map((c) => c.id));
}

/** classId -> admin-provided suspension reason (may be empty). */
export function suspendedClassReasons(
  classes: ClassRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of classes) {
    if (c.is_suspended) map.set(c.id, c.suspension_reason?.trim() || "");
  }
  return map;
}

/** Ids of every section belonging to a suspended class. */
export function suspendedSectionIdSet(
  sections: SectionRow[],
  classes: ClassRow[],
): Set<string> {
  const suspendedClasses = suspendedClassIdSet(classes);
  const ids = new Set<string>();
  for (const s of sections) {
    if (suspendedClasses.has(s.class_id)) ids.add(s.id);
  }
  return ids;
}

/** Drop routine rows that belong to a suspended class (for live views only). */
export function filterSuspendedRoutines<T extends { section_id: string }>(
  routines: T[],
  sections: SectionRow[],
  classes: ClassRow[],
): T[] {
  const suspendedSections = suspendedSectionIdSet(sections, classes);
  if (suspendedSections.size === 0) return routines;
  return routines.filter((r) => !suspendedSections.has(r.section_id));
}

/** Drop adjustments targeting a suspended class (for live views only). */
export function filterSuspendedAdjustments<T extends { section_id: string }>(
  adjustments: T[],
  sections: SectionRow[],
  classes: ClassRow[],
): T[] {
  return filterSuspendedRoutines(adjustments, sections, classes);
}
