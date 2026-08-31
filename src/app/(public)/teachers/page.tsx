import {
  getTeachers,
  getSubjects,
  getTeacherSubjects,
} from "@/lib/data";
import { TeachersDirectory } from "@/components/public/teachers-directory";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const [teachers, subjects, teacherSubjects] = await Promise.all([
    getTeachers(),
    getSubjects(),
    getTeacherSubjects(),
  ]);

  return (
    <TeachersDirectory
      teachers={teachers}
      subjects={subjects}
      teacherSubjects={teacherSubjects}
    />
  );
}
