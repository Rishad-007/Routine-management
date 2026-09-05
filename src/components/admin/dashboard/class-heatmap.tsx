"use client";

import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu"];

export interface ClassDayDatum {
  className: string;
  sections: number;
  days: number[]; // length 5, each 0-100
}

interface Props {
  data: ClassDayDatum[];
}

function cellStyles(pct: number): string {
  if (pct >= 95) return "bg-emerald-500 text-white";
  if (pct >= 80) return "bg-teal-500 text-white";
  if (pct >= 50) return "bg-amber-400 text-white";
  return "bg-red-400 text-white";
}

export function ClassCoverageHeatmap({ data }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-24 pb-1 text-left text-xs font-medium text-slate-400">
              Class
            </th>
            {DAY_LABELS.map((d) => (
              <th
                key={d}
                className="pb-1 text-center text-xs font-medium text-slate-400"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.className}>
              <td className="py-0.5 pr-2">
                <span className="text-sm font-semibold text-slate-700">
                  Class {c.className}
                </span>
                <span className="ml-1 text-[10px] text-slate-400">
                  {c.sections} sec
                </span>
              </td>
              {c.days.map((pct, i) => (
                <td key={i} className="p-0">
                  <div
                    className={cn(
                      "flex h-8 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                      cellStyles(pct)
                    )}
                    title={`${DAY_LABELS[i]}: ${pct}% scheduled`}
                  >
                    {pct}%
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}