import { PERIOD_ORDER, TIFFIN_AFTER_PERIOD } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface PeriodStripProps {
  /** Periods the teacher already occupies. */
  busy: ReadonlySet<number>;
  /**
   * Tooltip text for a busy period, e.g. "Class 8-Mashaeli · Mathematics".
   * Omitted or returning null falls back to "Busy".
   */
  describe?: (period: number) => string | null;
  className?: string;
}

/**
 * One cell per period — `[1][2][3][4][T][5][6][7]` — green when the teacher is
 * free and red when they already hold a class.
 *
 * Tiffin gets a neutral cell rather than a green or red one: it is a break
 * between P4 and P5, so no teacher is free or busy then and colouring it would
 * invent a class hour that does not exist. It is emitted before period 5, never
 * in place of it — the T cell and period 5 are separate nodes.
 */
export function PeriodStrip({ busy, describe, className }: PeriodStripProps) {
  const freeAt: string[] = [];
  const busyAt: string[] = [];
  for (const p of PERIOD_ORDER) {
    (busy.has(p) ? busyAt : freeAt).push(`P${p}`);
  }

  return (
    <div
      role="img"
      aria-label={`Free at ${freeAt.join(", ") || "no periods"}. Busy at ${
        busyAt.join(", ") || "no periods"
      }.`}
      className={cn("flex items-center gap-1", className)}
    >
      {PERIOD_ORDER.flatMap((period) => {
        const cells = [];

        if (period === TIFFIN_AFTER_PERIOD + 1) {
          cells.push(
            <span
              key="tiffin"
              title="Tiffin — no classes"
              className="flex h-6 w-6 items-center justify-center rounded bg-amber-100 text-[10px] font-semibold text-amber-700"
            >
              T
            </span>,
          );
        }

        const isBusy = busy.has(period);
        const detail = isBusy ? (describe?.(period) ?? "Busy") : "Free";

        cells.push(
          <span
            key={period}
            title={`P${period} · ${detail}`}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold",
              isBusy
                ? "bg-red-100 text-red-700"
                : "bg-emerald-100 text-emerald-700",
            )}
          >
            {period}
          </span>,
        );

        return cells;
      })}
    </div>
  );
}
