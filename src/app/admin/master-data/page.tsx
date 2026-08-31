import { requireAdmin } from "@/lib/auth";
import {
  getClasses,
  getSections,
  getRooms,
  getSubjects,
  getTeachers,
  getTeacherSubjects,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { MasterDataTabs } from "@/components/admin/master-data/master-data-tabs";

export const dynamic = "force-dynamic";

export default async function MasterDataPage() {
  await requireAdmin();

  const [classes, sections, rooms, subjects, teachers, teacherSubjects, adminsResult] =
    await Promise.all([
      getClasses(),
      getSections(),
      getRooms(),
      getSubjects(),
      getTeachers(),
      getTeacherSubjects(),
      createAdminClient().from("admins").select("id, username, role, created_at"),
    ]);

  const admins = (adminsResult.data ?? []) as Array<{
    id: string;
    username: string;
    role: "super" | "admin";
    created_at: string;
  }>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1e3a5f]">Update Database</h1>
        <p className="text-sm text-slate-500">Manage classes, sections, rooms, subjects, teachers & admins.</p>
      </div>
      <MasterDataTabs
        classes={classes}
        sections={sections}
        rooms={rooms}
        subjects={subjects}
        teachers={teachers}
        teacherSubjects={teacherSubjects}
        admins={admins}
      />
    </div>
  );
}
