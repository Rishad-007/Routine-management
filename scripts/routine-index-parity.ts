// Verifies the indexed helpers in src/lib/conflicts.ts return exactly the same
// answers as the array-scanning helpers they accelerate, using the live routine
// data. Also asserts the paged read returns every row (an unbounded select is
// capped at the project's "Max rows" setting and truncates silently).
//
//   npx tsx --env-file=.env.local scripts/routine-index-parity.ts
import { createClient } from "@supabase/supabase-js";
import {
  allTeacherLoads,
  allTeacherLoadsIndexed,
  buildRoutineIndex,
  countDayPeriods,
  dayCountIndexed,
  isBusyIndexed,
  isTeacherBusy,
  longestConsecutiveStretch,
  stretchIndexed,
} from "../src/lib/conflicts";
import { DAYS, PERIOD_NUMBERS, type RoutineRow } from "../src/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!url || !key) throw new Error("Missing Supabase env vars.");

const db = createClient(url, key);
const PAGE = 1000;

async function readAllRoutines(): Promise<RoutineRow[]> {
  const rows: RoutineRow[] = [];
  let total: number | null = null;
  for (let page = 0; page < 500; page++) {
    const { data, error, count } = await db
      .from("routines")
      .select("*", { count: "exact" })
      .order("id", { ascending: true })
      .range(rows.length, rows.length + PAGE - 1);
    if (error) throw new Error(error.message);
    if (total === null) total = count;
    if (!data?.length) break;
    rows.push(...(data as RoutineRow[]));
    if (total !== null && rows.length >= total) break;
  }
  return rows;
}

async function main() {
const routines = await readAllRoutines();

const { count: exactCount } = await db
  .from("routines")
  .select("id", { count: "exact", head: true });
const { data: unpaged } = await db.from("routines").select("id");

const teacherIds = [
  ...new Set(routines.map((r) => r.teacher_id).filter(Boolean)),
] as string[];

const index = buildRoutineIndex(routines);
const failures: string[] = [];

for (const teacherId of teacherIds) {
  for (const day of DAYS) {
    const a = countDayPeriods(routines, teacherId, day);
    const b = dayCountIndexed(index, teacherId, day);
    if (a !== b) failures.push(`dayCount ${teacherId} d${day}: ${a} != ${b}`);

    const c = longestConsecutiveStretch(routines, teacherId, day);
    const d = stretchIndexed(index, teacherId, day);
    if (c !== d) failures.push(`stretch ${teacherId} d${day}: ${c} != ${d}`);

    for (const period of PERIOD_NUMBERS) {
      const e = isTeacherBusy(routines, teacherId, day, period);
      const f = isBusyIndexed(index, teacherId, day, period);
      if (e !== f) failures.push(`busy ${teacherId} d${day}p${period}: ${e} != ${f}`);
    }
  }
}

const scanLoads = allTeacherLoads(routines);
const idxLoads = allTeacherLoadsIndexed(index);
if (scanLoads.size !== idxLoads.size) {
  failures.push(`allTeacherLoads size: ${scanLoads.size} != ${idxLoads.size}`);
}
for (const [teacherId, loads] of scanLoads) {
  const other = idxLoads.get(teacherId) ?? [];
  const norm = (l: typeof loads) =>
    JSON.stringify([...l].sort((x, y) => x.day - y.day));
  if (norm(loads) !== norm(other)) failures.push(`loads differ for ${teacherId}`);
}

console.log(`rows via paged read        : ${routines.length}`);
console.log(`rows via exact count       : ${exactCount}`);
console.log(`rows via unbounded select  : ${unpaged?.length ?? 0}  <- the bug`);
console.log(`teachers x days x periods  : ${teacherIds.length * DAYS.length * PERIOD_NUMBERS.length} comparisons`);

if (routines.length !== exactCount) {
  failures.push(`paged read got ${routines.length}, expected ${exactCount}`);
}

if (failures.length) {
  console.error(`\nFAIL (${failures.length}):`);
  for (const f of failures.slice(0, 20)) console.error("  " + f);
  process.exit(1);
}
console.log("\nPASS - indexed helpers match the scanning helpers exactly.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
