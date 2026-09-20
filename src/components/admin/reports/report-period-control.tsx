"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  REPORT_GRANULARITIES,
  REPORT_GRANULARITY_LABELS,
  shiftAnchor,
  type ReportGranularity,
  type ReportRange,
} from "@/lib/report-range";
import { cn } from "@/lib/utils";

interface Props {
  baseHref: string;
  range: ReportRange;
}

export function ReportPeriodControl({ baseHref, range }: Props) {
  const router = useRouter();

  const navigate = (granularity: ReportGranularity, date: string) => {
    router.replace(`${baseHref}?range=${granularity}&date=${date}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/70 p-2">
      <div className="flex items-center gap-1">
        {REPORT_GRANULARITIES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => navigate(g, range.anchor)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              range.granularity === g
                ? "bg-[#1e3a5f] text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {REPORT_GRANULARITY_LABELS[g]}
          </button>
        ))}
      </div>

      <div className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous period"
          onClick={() =>
            navigate(range.granularity, shiftAnchor(range.anchor, range.granularity, -1))
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <label className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs text-slate-500">
          <CalendarDays className="h-4 w-4" />
          <input
            type="date"
            value={range.anchor}
            onChange={(e) => {
              if (e.target.value) navigate(range.granularity, e.target.value);
            }}
            className="bg-transparent text-xs font-medium text-slate-700 outline-none"
          />
        </label>

        <button
          type="button"
          aria-label="Next period"
          onClick={() =>
            navigate(range.granularity, shiftAnchor(range.anchor, range.granularity, 1))
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-[#1e3a5f]">
        {range.label}
      </span>
    </div>
  );
}