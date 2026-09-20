import { requireAdmin } from "@/lib/auth";
import {
  getAllAdjustments,
  getClasses,
  getSections,
  getSubjects,
  getTeachers,
} from "@/lib/data";
import { resolveReportParams } from "@/lib/report-range";
import { buildUnavailabilityReport } from "@/lib/reports";
import { ReportPeriodControl } from "@/components/admin/reports/report-period-control";
import { UnavailableTeachersReport } from "@/components/admin/reports/unavailable-teachers-report";

export const dynamic = "force-dynamic";

export default async function UnavailableTeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const range = resolveReportParams(rawRange, rawDate);

  const [adjustments, teachers, sections, classes, subjects] =
    await Promise.all([
      getAllAdjustments(),
      getTeachers(),
      getSections(),
      getClasses(),
      getSubjects(),
    ]);

  const report = buildUnavailabilityReport(
    adjustments,
    teachers,
    sections,
    classes,
    subjects,
    range,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Teacher Absences</h1>
        <p className="text-sm text-slate-500">
          Which teachers were unavailable, which days, and how many classes were
          skipped — viewable daily, weekly, monthly or yearly.
        </p>
      </div>

      <ReportPeriodControl range={range} baseHref="/admin/unavailable-teachers" />

      <UnavailableTeachersReport report={report} />
    </div>
  );
}