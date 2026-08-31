"use client";

import { useCurrentPeriod } from "@/hooks/use-current-period";
import type { Season } from "@/lib/constants";
import {
  Clapperboard,
  Coffee,
  Clock,
  DoorOpen,
  BookOpen,
  User,
  Sun,
  Moon,
} from "lucide-react";

interface CellInfo {
  subject?: string;
  teacher?: string;
  room?: string;
}

export function CurrentPeriodCard({
  season,
  currentCell,
}: {
  season: Season;
  currentCell?: CellInfo;
}) {
  const { result, dayIndex } = useCurrentPeriod(season);

  const isTiffin = result.kind === "tiffin";
  const inactive = result.kind === "before" || result.kind === "after";

  return (
    <div
      className={
        "rounded-2xl border p-6 shadow-sm " +
        (isTiffin
          ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
          : inactive
          ? "border-slate-200 bg-slate-50"
          : "border-[#0d9488]/30 bg-gradient-to-br from-[#0d9488]/10 to-white")
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Clock className="h-4 w-4" />
          {season === "summer" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-slate-400" />}
          <span>Summer Schedule</span>
        </div>
        <span className="text-xs text-slate-400">
          {dayIndex !== null ? `Day ${dayIndex + 1}` : "Weekend"}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Currently Running
        </p>
        {isTiffin ? (
          <div className="mt-1 flex items-center gap-3">
            <Coffee className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-700">Tiffin Break</p>
              <p className="text-sm text-slate-500">{result.timeLabel}</p>
            </div>
          </div>
        ) : inactive ? (
          <div className="mt-1">
            <p className="text-2xl font-bold text-slate-400">
              {result.kind === "before" ? "School not started" : "School over"}
            </p>
            {result.kind === "before" && (
              <p className="text-sm text-slate-500">
                Next period starts {result.nextPeriodLabel}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-1">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3 py-1 text-lg font-bold text-white">
                <Clapperboard className="h-5 w-5" /> Period {result.periodNumber}
              </span>
              <p className="text-sm font-medium text-slate-500">{result.timeLabel}</p>
            </div>
            {currentCell?.subject ? (
              <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2 text-slate-600">
                  <BookOpen className="h-4 w-4 text-[#0d9488]" />
                  {currentCell.subject}
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="h-4 w-4 text-[#0d9488]" />
                  {currentCell.teacher ?? "—"}
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <DoorOpen className="h-4 w-4 text-[#0d9488]" />
                  {currentCell.room ?? "—"}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                Select a class &amp; section below to see who&apos;s teaching now.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
