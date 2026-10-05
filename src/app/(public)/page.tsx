import {
  getClasses,
  getSections,
  getTeachers,
  getSubjects,
  getRooms,
  getRoutines,
  getAdjustments,
  getSetting,
} from "@/lib/data";
import type { Season } from "@/lib/constants";
import { getSchoolDayIndexNow, getSchoolToday } from "@/lib/periods";
import { HomeContent } from "@/components/public/home-content";

// The board's contents depend on the current day and period, so an ISR snapshot
// is the wrong shape for this route: a payload rendered at 23:59 would keep
// serving yesterday's routine past midnight. Force-dynamic costs no extra
// database work — every getter below is already `unstable_cache`d — and it
// matches how /admin is already configured.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [classes, sections, teachers, subjects, rooms, routines, adjustments, season] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRooms(),
      getRoutines(),
      getAdjustments(getSchoolToday()),
      getSetting("season"),
    ]);

  const now = new Date();
  // Resolved in the school's timezone, not the server's: on a UTC host these two
  // disagree for six hours a day, which is how Monday's routine ended up under
  // Tuesday's heading.
  const today = getSchoolToday(now);
  const dayIndex = getSchoolDayIndexNow(now);

  // The live "now teaching" board only ever shows one weekday, and it switches
  // periods client-side from this same payload. Slicing to the day here ships
  // ~600 rows instead of 3000+, which is the difference between a dashboard that
  // feels instant on a phone and one that does not.
  const todayRows = dayIndex === null ? [] : routines.filter((r) => r.day === dayIndex);

  return (
    <HomeContent
      classes={classes}
      sections={sections}
      teachers={teachers}
      subjects={subjects}
      rooms={rooms}
      todayRows={todayRows}
      adjustments={adjustments}
      season={(season as Season) ?? "summer"}
      today={today}
    />
  );
}