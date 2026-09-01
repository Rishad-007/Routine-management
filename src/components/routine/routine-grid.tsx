"use client";

import { cn } from "@/lib/utils";
import { DAY_LABEL_LIST, PERIOD_ORDER, TIFFIN_AFTER_PERIOD, type Season } from "@/lib/constants";
import { useCurrentPeriod } from "@/hooks/use-current-period";
import { Badge } from "@/components/ui/badge";

export interface RoutineCell {
  subject?: string;
  subjectShort?: string;
  teacher?: string;
  room?: string;
  classLabel?: string;
  subject2?: string;
  teacher2?: string;
  room2?: string;
  isTag?: boolean;
  isAdjusted?: boolean;
  isTagAdjusted?: boolean;
}

export type RoutineMatrix = Record<number, Record<number, RoutineCell | undefined>>;

interface RoutineGridProps {
  matrix: RoutineMatrix;
  season: Season;
  highlightCurrent?: boolean;
  variant?: "default" | "compact";
}

export function RoutineGrid({
  matrix,
  season,
  highlightCurrent = true,
  variant = "default",
}: RoutineGridProps) {
  const { result, dayIndex } = useCurrentPeriod(season);
  const highlightDay = highlightCurrent ? dayIndex : null;
  const highlightPeriod =
    highlightCurrent && result.kind === "period" ? (result.periodNumber ?? null) : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-28 border border-slate-200 bg-[#1e3a5f] px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white">
              Day
            </th>
            {PERIOD_ORDER.map((p) => (
              <th
                key={p}
                className={cn(
                  "border border-slate-200 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide",
                  highlightPeriod === p
                    ? "bg-[#0d9488] text-white"
                    : "bg-[#f1f5f9] text-slate-600"
                )}
              >
                P{p}
                {p === TIFFIN_AFTER_PERIOD && (
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                    ↓ Tiffin
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABEL_LIST.map((day, di) => (
            <tr key={day}>
              <td
                className={cn(
                  "border border-slate-200 px-2 py-2 text-xs font-semibold",
                  di === highlightDay ? "bg-[#0d9488]/10 text-[#0b7a70]" : "bg-slate-50 text-slate-600"
                )}
              >
                {day}
              </td>
              {PERIOD_ORDER.map((p) => {
                const cell = matrix[di]?.[p];
                const isHighlight =
                  di === highlightDay && p === highlightPeriod;
                return (
                  <td
                    key={p}
                    className={cn(
                      "border border-slate-200 px-2 py-1.5 text-center align-middle",
                      isHighlight ? "bg-[#0d9488]/15 ring-1 ring-inset ring-[#0d9488]" : "bg-white",
                      p === TIFFIN_AFTER_PERIOD && "border-r-2 border-r-amber-300",
                      cell?.isAdjusted && "bg-amber-50/50",
                      cell?.isTag && "border-b-2 border-b-teal-300"
                    )}
                  >
                    {cell ? (
                      <div className={cn(variant === "compact" ? "space-y-0.5" : "space-y-0.5")}>
                        {/* Primary session */}
                        <p className="font-medium text-[#1e3a5f]">
                          {variant === "compact"
                            ? cell.subjectShort || cell.subject || "—"
                            : cell.subject || "—"}
                        </p>
                        {variant !== "compact" && (
                          <p className="text-xs text-slate-500">
                            {cell.teacher || "—"}
                            {cell.room ? ` · ${cell.room}` : ""}
                          </p>
                        )}
                        {cell.isAdjusted && (
                          <Badge variant="secondary" className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0">
                            Adj
                          </Badge>
                        )}

                        {/* Tag session */}
                        {cell.isTag && (
                          <>
                            <div className="my-0.5 border-t border-dashed border-teal-200" />
                            <p className="font-medium text-teal-700">
                              {variant === "compact"
                                ? cell.subject2 || "—"
                                : cell.subject2 || "—"}
                            </p>
                            {variant !== "compact" && (
                              <p className="text-xs text-teal-600">
                                {cell.teacher2 || "—"}
                                {cell.room2 ? ` · ${cell.room2}` : ""}
                              </p>
                            )}
                            <div className="flex justify-center gap-1">
                              <Badge variant="secondary" className="text-[8px] bg-teal-100 text-teal-700 px-1 py-0">
                                Tag
                              </Badge>
                              {cell.isTagAdjusted && (
                                <Badge variant="secondary" className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0">
                                  Adj
                                </Badge>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-200">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
