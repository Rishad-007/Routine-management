import { requireAdmin } from "@/lib/auth";
import {
  getClasses,
  getSections,
  getSubjects,
  getTeachers,
  getRooms,
  getRoutines,
} from "@/lib/data";
import Link from "next/link";
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
  CalendarRange,
  SlidersHorizontal,
  Database,
  ArrowRight,
  Globe,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireAdmin();
  const [classes, sections, subjects, teachers, rooms, routines] =
    await Promise.all([
      getClasses(),
      getSections(),
      getSubjects(),
      getTeachers(),
      getRooms(),
      getRoutines(),
    ]);

  const totalCells = sections.length * 5 * 7;
  const filled = routines.length;
  const coverage = totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0;

  const stats = [
    { label: "Classes", value: classes.length, icon: School },
    { label: "Sections", value: sections.length, icon: LayoutGrid },
    { label: "Subjects", value: subjects.length, icon: BookOpen },
    { label: "Teachers", value: teachers.length, icon: Users },
    { label: "Rooms", value: rooms.length, icon: DoorOpen },
  ];

  const quickLinks = [
    { href: "/admin/master-data", label: "Update Database", desc: "Classes, sections, subjects, teachers & rooms", icon: Database },
    { href: "/admin/routine", label: "Update Routine", desc: "Build a section's full weekly routine", icon: CalendarRange },
    { href: "/admin/adjust", label: "Adjust Routine", desc: "Temporary date-scoped teacher substitutions", icon: SlidersHorizontal },
  ];

  const viewLinks = [
    { href: "/routine", label: "Class Routine", desc: "View weekly routine like the public", icon: Globe },
    { href: "/teacher", label: "Teacher Routine", desc: "View any teacher's routine like the public", icon: Globe },
    { href: "/teachers", label: "Teachers", desc: "Browse the teacher directory", icon: Globe },
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
          <Card key={s.label} className="transition-shadow hover:shadow-md">
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

      <Card className="border-[#0d9488]/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-[#1e3a5f]">
            Routine coverage
          </CardTitle>
          <span className="text-2xl font-bold text-[#0d9488]">{coverage}%</span>
        </CardHeader>
        <CardContent>
          <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0d9488] to-[#0b7a70] transition-all"
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {filled} of {totalCells} period cells assigned across all sections
            (15 sections × 5 days × 7 periods).
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {quickLinks.map((q) => (
          <Link key={q.href} href={q.href} className="group">
            <Card className="h-full transition-all hover:border-[#1e3a5f]/30 hover:shadow-md">
              <CardContent className="p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e3a5f]/10">
                  <q.icon className="h-5 w-5 text-[#1e3a5f]" />
                </div>
                <p className="flex items-center gap-1 font-semibold text-[#1e3a5f]">
                  {q.label}
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="mt-1 text-sm text-slate-500">{q.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">
          View Routine (as the public sees it)
        </h2>
        <span className="text-xs text-slate-400">Opens in a new tab</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {viewLinks.map((q) => (
          <Link key={q.href} href={q.href} target="_blank" rel="noreferrer" className="group">
            <Card className="h-full border-[#0d9488]/20 transition-all hover:border-[#0d9488]/60 hover:shadow-md">
              <CardContent className="p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#0d9488]/10">
                  <q.icon className="h-5 w-5 text-[#0d9488]" />
                </div>
                <p className="flex items-center gap-1 font-semibold text-[#0d9488]">
                  {q.label}
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="mt-1 text-sm text-slate-500">{q.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
