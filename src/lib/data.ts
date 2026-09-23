import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/admin";
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

// Service-role client (server-only). The read getters are wrapped in
// `unstable_cache`, whose cached callbacks must NOT touch request-scoped APIs
// like cookies() — the anon SSR client from "./supabase/server" reads cookies,
// which silently disables caching. The service-role client bypasses RLS and
// returns identical data, so cached reads stay consistent across every page
// and route.
const db = () => createAdminClient();

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
// All reads are memoized with `unstable_cache` (60s TTL + on-demand tag
// invalidation from server actions). This turns ~a dozen Supabase round trips
// per page load (including getRoutines()' 4-page walk of 3,060 rows) into a
// single cache hit. Writes invalidate the tags with revalidateTag() in the
// server action files, so data is never stale after a save.

const CACHE_SECONDS = 60;

export const getClasses = unstable_cache(
  async (): Promise<ClassRow[]> => {
    const { data, error } = await db()
      .from("classes")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as ClassRow[]) ?? [];
  },
  ["classes"],
  { tags: ["classes"], revalidate: CACHE_SECONDS },
);

export const getSections = unstable_cache(
  async (): Promise<SectionRow[]> => {
    const { data, error } = await db().from("sections").select("*");
    if (error) throw new Error(error.message);
    return (data as SectionRow[]) ?? [];
  },
  ["sections"],
  { tags: ["sections"], revalidate: CACHE_SECONDS },
);

export const getClassPeriodRules = unstable_cache(
  async (): Promise<ClassPeriodRule[]> => {
    const { data, error } = await db().from("class_period_rules").select("*");
    if (error) throw new Error(error.message);
    return ((data as ClassPeriodRuleRow[]) ?? []).map((r) => ({
      classId: r.class_id,
      day: r.day,
      minPeriod: r.min_period,
      maxPeriod: r.max_period,
    }));
  },
  ["class-period-rules"],
  { tags: ["class-period-rules"], revalidate: CACHE_SECONDS },
);

export const getRooms = unstable_cache(
  async (): Promise<RoomRow[]> => {
    const { data, error } = await db().from("rooms").select("*").order("name");
    if (error) throw new Error(error.message);
    return (data as RoomRow[]) ?? [];
  },
  ["rooms"],
  { tags: ["rooms"], revalidate: CACHE_SECONDS },
);

export const getSubjects = unstable_cache(
  async (): Promise<SubjectRow[]> => {
    const { data, error } = await db()
      .from("subjects")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return (data as SubjectRow[]) ?? [];
  },
  ["subjects"],
  { tags: ["subjects"], revalidate: CACHE_SECONDS },
);

export const getTeachers = unstable_cache(
  async (): Promise<TeacherRow[]> => {
    const { data, error } = await db()
      .from("teachers")
      .select("*")
      .order("full_name");
    if (error) throw new Error(error.message);
    return (data as TeacherRow[]) ?? [];
  },
  ["teachers"],
  { tags: ["teachers"], revalidate: CACHE_SECONDS },
);

export const getTeacherSubjects = unstable_cache(
  async (): Promise<TeacherSubjectRow[]> => {
    const { data, error } = await db().from("teacher_subjects").select("*");
    if (error) throw new Error(error.message);
    return (data as TeacherSubjectRow[]) ?? [];
  },
  ["teacher-subjects"],
  { tags: ["teacher-subjects"], revalidate: CACHE_SECONDS },
);

export const getRoutines = unstable_cache(
  async (sectionId?: string): Promise<RoutineRow[]> => {
    const client = db();
    return fetchAllRows<RoutineRow>(() => {
      let q = client.from("routines").select("*", { count: "exact" });
      if (sectionId) q = q.eq("section_id", sectionId);
      return q as unknown as PagedQuery<RoutineRow>;
    });
  },
  ["routines"],
  { tags: ["routines"], revalidate: CACHE_SECONDS },
);

export const getAdjustments = unstable_cache(
  async (): Promise<AdjustmentRow[]> => {
    const today = getTodayLocal();
    const { data, error } = await db()
      .from("adjustments")
      .select("*")
      .gte("adjust_date", today);
    if (error) throw new Error(error.message);
    return (data as AdjustmentRow[]) ?? [];
  },
  ["adjustments"],
  { tags: ["adjustments"], revalidate: CACHE_SECONDS },
);

/**
 * All adjustments across every date (historical + future).
 * Used by the admin Adjust page so past days' substitutions stay
 * viewable and downloadable. Public routine views keep using
 * getAdjustments() (>= today) so the routine rolls back automatically.
 */
export const getAllAdjustments = unstable_cache(
  async (): Promise<AdjustmentRow[]> => {
    const client = db();
    // Page on the primary key — adjust_date is not unique, so it cannot give the
    // stable total order paging requires. Sort by date afterwards.
    const rows = await fetchAllRows<AdjustmentRow>(
      () =>
        client
          .from("adjustments")
          .select("*", { count: "exact" }) as unknown as PagedQuery<AdjustmentRow>,
    );
    // Copy before sorting — the cached value is returned by reference.
    return rows.slice().sort((a, b) => b.adjust_date.localeCompare(a.adjust_date));
  },
  ["adjustments-all"],
  { tags: ["adjustments"], revalidate: CACHE_SECONDS },
);

export const getSettings = unstable_cache(
  async (): Promise<SettingsRow[]> => {
    const { data, error } = await db().from("settings").select("*");
    if (error) throw new Error(error.message);
    return (data as SettingsRow[]) ?? [];
  },
  ["settings"],
  { tags: ["settings"], revalidate: CACHE_SECONDS },
);

export const getSetting = unstable_cache(
  async (key: string): Promise<string | null> => {
    const { data, error } = await db()
      .from("settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.value as string | undefined) ?? null;
  },
  ["settings"],
  { tags: ["settings"], revalidate: CACHE_SECONDS },
);
