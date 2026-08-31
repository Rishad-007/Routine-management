import {
  getClasses,
  getSections,
  getTeachers,
  getSubjects,
  getRoutines,
  getSetting,
} from "@/lib/data";
import type { Season } from "@/lib/constants";
import { HomeContent } from "@/components/public/home-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [classes, sections, teachers, subjects, routines, season] =
    await Promise.all([
      getClasses(),
      getSections(),
      getTeachers(),
      getSubjects(),
      getRoutines(),
      getSetting("season"),
    ]);

  return (
    <HomeContent
      classes={classes}
      sections={sections}
      teachers={teachers}
      subjects={subjects}
      routines={routines}
      season={(season as Season) ?? "summer"}
    />
  );
}
