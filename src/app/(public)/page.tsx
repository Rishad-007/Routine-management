import {
  getClasses,
  getSections,
  getTeachers,
  getSubjects,
  getRoutines,
  getAdjustments,
  getSetting,
} from "@/lib/data";
import type { Season } from "@/lib/constants";
import { HomeContent } from "@/components/public/home-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [classes, sections, teachers, subjects, routines, adjustments, season] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRoutines(),
      getAdjustments(),
      getSetting("season"),
    ]);

  return (
    <HomeContent
      classes={classes}
      sections={sections}
      teachers={teachers}
      subjects={subjects}
      routines={routines}
      adjustments={adjustments}
      season={(season as Season) ?? "summer"}
    />
  );
}
