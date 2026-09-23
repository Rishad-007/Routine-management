import "server-only";
import { createClient } from "./supabase/server";
import { getTodayLocal } from "./periods";
import {
  type ClassRow,
  type ClassPeriodRuleRow,
  type SectionRow,
  type SubjectRow,
  type TeacherRow,
  type TeacherSubjectRow,
  type RoomRow,
  type RoutineRow,
  type AdjustmentRow,
  type SettingsRow,
} from "./types";
import type { ClassPeriodRule } from "./class-period-rules";

async function db() {
  return createClient();
}

// ---------------- Paged reads ----------------

/**
 * PostgREST caps every response at the project's "Max rows" setting
 * (Supabase default: 1000) and does NOT report that it truncated — the array
 * simply ends early. `routine_assignments` alone is 3000+ rows, so an
 * unbounded .select() silently hides two thirds of the school's routine.
 *
 * Structural typing (rather than PostgrestFilterBuilder, which carries eight
 * generic parameters) keeps this usable with both the anon SSR client and the
 * service-role client used by the PDF routes and server actions.
 */
interface PagedResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}

export interface PagedQuery<T> {
  order(
    column: string,
    options: { ascending: boolean },
  ): { range(from: number, to: number): PromiseLike<PagedResponse<T>> };
}

/**
 * Read every row of a query, one page at a time.
 *
 * `makeQuery` must be a thunk: a Postgrest query builder is a single-use
 * thenable, so building it once and awaiting it twice replays the cached first
 * response. Its select() must pass `{ count: "exact" }`.
 *
 * Paging needs a stable total order — Postgres gives no ordering guarantee for
 * LIMIT/OFFSET, `synchronize_seqscans` is on by default, and `routines` is a
 * join view whose plan can change between requests, so an unordered page walk
 * both skips and duplicates rows. Order on a primary key.
 */
export async function fetchAllRows<T>(
  makeQuery: () => PagedQuery<T>,
  orderColumn = "id",
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;

  // Guard against a server that keeps returning rows we have already counted.
  for (let page = 0; page < 500; page++) {
    const { data, error, count } = await makeQuery()
      .order(orderColumn, { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);
    if (total === null) total = count;

    const batch = data ?? [];
    if (batch.length === 0) break;
    rows.push(...batch);

    // Terminate on the exact count rather than `batch.length < pageSize`: if a
    // project's Max rows is ever set below pageSize, the length test would exit
    // after the first page and silently reinstate the truncation bug.
    if (total !== null && rows.length >= total) break;
  }

  // Fail-fast instead of silently returning a partial array. A truncated read
  // here used to look like "no class at this period" — busy teachers could
  // appear free. Every caller requests { count: "exact" }, so total is known.
  if (total !== null && rows.length < total) {
    throw new Error(
      `fetchAllRows: incomplete read — got ${rows.length}/${total} of "${orderColumn}" after paging.`,
    );
  }

  return rows;
}

// ---------------- Master data reads ----------------
// NOTE: db() is the anon-key SSR client, not the service-role client — these
// reads depend on the "Public read" RLS policies in supabase/schema.sql. A table
// without such a policy returns [] rather than an error.

export async function getClasses(): Promise<ClassRow[]> {
  const { data, error } = await (await db())
    .from("classes")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ClassRow[]) ?? [];
}

export async function getSections(): Promise<SectionRow[]> {
  const { data, error } = await (await db()).from("sections").select("*");
  if (error) throw new Error(error.message);
  return (data as SectionRow[]) ?? [];
}

export async function getClassPeriodRules(): Promise<ClassPeriodRule[]> {
  const { data, error } = await (await db())
    .from("class_period_rules")
    .select("*");
  if (error) throw new Error(error.message);
  return ((data as ClassPeriodRuleRow[]) ?? []).map((r) => ({
    classId: r.class_id,
    day: r.day,
    minPeriod: r.min_period,
    maxPeriod: r.max_period,
  }));
}

export async function getRooms(): Promise<RoomRow[]> {
  const { data, error } = await (await db())
    .from("rooms")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return (data as RoomRow[]) ?? [];
}

export async function getSubjects(): Promise<SubjectRow[]> {
  const { data, error } = await (await db())
    .from("subjects")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return (data as SubjectRow[]) ?? [];
}

export async function getTeachers(): Promise<TeacherRow[]> {
  const { data, error } = await (await db())
    .from("teachers")
    .select("*")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data as TeacherRow[]) ?? [];
}

export async function getTeacherSubjects(): Promise<TeacherSubjectRow[]> {
  const { data, error } = await (await db())
    .from("teacher_subjects")
    .select("*");
  if (error) throw new Error(error.message);
  return (data as TeacherSubjectRow[]) ?? [];
}

export async function getRoutines(sectionId?: string): Promise<RoutineRow[]> {
  const client = await db();
  return fetchAllRows<RoutineRow>(() => {
    let q = client.from("routines").select("*", { count: "exact" });
    if (sectionId) q = q.eq("section_id", sectionId);
    return q as unknown as PagedQuery<RoutineRow>;
  });
}

export async function getAdjustments(): Promise<AdjustmentRow[]> {
  const today = getTodayLocal();
  const { data, error } = await (await db())
    .from("adjustments")
    .select("*")
    .gte("adjust_date", today);
  if (error) throw new Error(error.message);
  return (data as AdjustmentRow[]) ?? [];
}

/**
 * All adjustments across every date (historical + future).
 * Used by the admin Adjust page so past days' substitutions stay
 * viewable and downloadable. Public routine views keep using
 * getAdjustments() (>= today) so the routine rolls back automatically.
 */
export async function getAllAdjustments(): Promise<AdjustmentRow[]> {
  const client = await db();
  // Page on the primary key — adjust_date is not unique, so it cannot give the
  // stable total order paging requires. Sort by date afterwards.
  const rows = await fetchAllRows<AdjustmentRow>(
    () =>
      client
        .from("adjustments")
        .select("*", { count: "exact" }) as unknown as PagedQuery<AdjustmentRow>,
  );
  return rows.sort((a, b) => b.adjust_date.localeCompare(a.adjust_date));
}

export async function getSettings(): Promise<SettingsRow[]> {
  const { data, error } = await (await db()).from("settings").select("*");
  if (error) throw new Error(error.message);
  return (data as SettingsRow[]) ?? [];
}

export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await (await db())
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as string | undefined) ?? null;
}
