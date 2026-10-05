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
import { getSchoolDayIndex, getTodayLocal } from "@/lib/periods";
import { HomeContent } from "@/components/public/home-content";

export const revalidate = 60;

export default async function HomePage() {
  const [classes, sections, teachers, subjects, rooms, routines, adjustments, season] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRooms(),
      getRoutines(),
      getAdjustments(),
      getSetting("season"),
    ]);

  const now = new Date();
  const today = getTodayLocal(now);
  const dayIndex = getSchoolDayIndex(now);

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