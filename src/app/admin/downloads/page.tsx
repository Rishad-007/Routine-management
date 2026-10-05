import { requireAdmin } from "@/lib/auth";
import {
  getSchoolDayIndexYmd,
  resolveReportParams,
  formatFullDate,
} from "@/lib/report-range";
import { ReportPeriodControl } from "@/components/admin/reports/report-period-control";
import { DownloadsGrid } from "@/components/admin/downloads/download-card";

export const dynamic = "force-dynamic";

export default async function DownloadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const range = resolveReportParams(rawRange, rawDate);

  // The daily sheet only exists for a school day, so a weekend anchor disables
  // that one card instead of returning a 400 when clicked.
  const anchorIsSchoolDay = getSchoolDayIndexYmd(range.anchor) !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Downloads</h1>
        <p className="text-sm text-slate-500">
          Every report PDF in one place. Pick the period below — each report is
          generated from the same figures as the on-screen reports, so the
          printed numbers always match.
        </p>
      </div>

      <ReportPeriodControl range={range} baseHref="/admin/downloads" />

      <p className="text-xs text-slate-400">
        Showing {range.label} · {formatFullDate(range.start)} to{" "}
        {formatFullDate(range.end)}
      </p>

      <DownloadsGrid
        granularity={range.granularity}
        anchor={range.anchor}
        dailyBlockedReason={
          anchorIsSchoolDay
            ? undefined
            : "Pick a Sunday–Thursday date — no sheet exists for Friday or Saturday"
        }
      />
    </div>
  );
}