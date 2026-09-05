import { DoorOpen } from "lucide-react";

interface Props {
  used: number;
  total: number;
  usedNames: string[];
}

export function RoomUtilizationCard({ used, total, usedNames }: Props) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-[#1e3a5f]">
          {used}
          <span className="text-xl text-slate-400"> / {total}</span>
        </span>
        <span className="text-sm font-medium text-slate-500">
          rooms in use today
        </span>
      </div>
      <div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#1e3a5f] to-teal-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">{pct}% utilization</p>
      </div>
      {usedNames.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <DoorOpen className="h-3.5 w-3.5" /> Active rooms
          </p>
          <div className="flex flex-wrap gap-1.5">
            {usedNames.slice(0, 18).map((name) => (
              <span
                key={name}
                className="rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
              >
                {name}
              </span>
            ))}
            {usedNames.length > 18 && (
              <span className="px-1 py-0.5 text-xs text-slate-400">
                +{usedNames.length - 18} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}