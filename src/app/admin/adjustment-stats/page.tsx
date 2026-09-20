import { requireAdmin } from "@/lib/auth";
import {
  getAllAdjustments,
  getRoutines,
  getSubjects,
  getTeachers,
} from "@/lib/data";
import { resolveReportParams } from "@/lib/report-range";
import { buildAdjustmentStatsReport } from "@/lib/reports";
import { ReportPeriodControl } from "@/components/admin/reports/report-period-control";
import { AdjustmentStatsReport } from "@/components/admin/reports/adjustment-stats-report";

export const dynamic = "force-dynamic";

export default async function AdjustmentStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const range = resolveReportParams(rawRange, rawDate);

  const [adjustments, routines, teachers, subjects] = await Promise.all([
    getAllAdjustments(),
    getRoutines(),
    getTeachers(),
    getSubjects(),
  ]);

  const report = buildAdjustmentStatsReport(
    adjustments,
    routines,
    teachers,
    subjects,
    range,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">
          Adjustment Statistics
        </h1>
        <p className="text-sm text-slate-500">
          Which teachers cover the most adjusted classes and who is teaching
          more than their fixed weekly load — daily, weekly, monthly or yearly.
        </p>
      </div>

      <ReportPeriodControl range={range} baseHref="/admin/adjustment-stats" />

      <AdjustmentStatsReport report={report} />
    </div>
  );
}