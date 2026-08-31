import { requireAdmin } from "@/lib/auth";
import {
  getClasses,
  getSections,
  getSubjects,
  getTeachers,
  getRooms,
} from "@/lib/data";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  BookOpen,
  School,
  LayoutGrid,
  DoorOpen,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireAdmin();
  const classes = await getClasses();
  const sections = await getSections();
  const subjects = await getSubjects();
  const teachers = await getTeachers();
  const rooms = await getRooms();

  const stats = [
    { label: "Classes", value: classes.length, icon: School },
    { label: "Sections", value: sections.length, icon: LayoutGrid },
    { label: "Subjects", value: subjects.length, icon: BookOpen },
    { label: "Teachers", value: teachers.length, icon: Users },
    { label: "Rooms", value: rooms.length, icon: DoorOpen },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1e3a5f]">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Welcome, {session.username} · Routine management overview
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-[#0d9488]" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-[#1e3a5f]">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-slate-600">
          Use the navigation to manage master data, build routines, and handle
          temporary adjustments.
        </CardContent>
      </Card>
    </div>
  );
}
