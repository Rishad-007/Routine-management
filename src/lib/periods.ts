import type { Season } from "./constants";
import { PERIOD_ORDER, TIFFIN_AFTER_PERIOD } from "./constants";

// Durations in minutes (same for summer & winter)
const PERIOD_DURATIONS: Record<number, number> = {
  1: 35,
  2: 40,
  3: 40,
  4: 40,
  5: 45,
  6: 40,
  7: 40,
};
const TIFFIN_DURATION = 20;

// Start times (HH:MM) per season
const SEASON_START: Record<Season, string> = {
  summer: "08:30",
  winter: "09:10",
};

interface TimeBlock {
  label: string; // "Period 1" | "Tiffin"
  periodNumber?: number;
  start: Date;
  end: Date;
  startLabel: string;
  endLabel: string;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Build all blocks for a given day's schedule (relative to midnight reference date). */
export function buildSchedule(season: Season, reference: Date): TimeBlock[] {
  const startMin = toMinutes(SEASON_START[season]);
  const blocks: TimeBlock[] = [];
  let cursor = startMin;

  for (const p of PERIOD_ORDER) {
    const startLabel = formatMinutes(cursor);
    const duration = PERIOD_DURATIONS[p];
    cursor += duration;
    const endLabel = formatMinutes(cursor);
    blocks.push({
      label: `Period ${p}`,
      periodNumber: p,
      start: atMinutes(reference, startLabel),
      end: atMinutes(reference, endLabel),
      startLabel,
      endLabel,
    });

    if (p === TIFFIN_AFTER_PERIOD) {
      const tStart = formatMinutes(cursor);
      cursor += TIFFIN_DURATION;
      const tEnd = formatMinutes(cursor);
      blocks.push({
        label: "Tiffin",
        start: atMinutes(reference, tStart),
        end: atMinutes(reference, tEnd),
        startLabel: tStart,
        endLabel: tEnd,
      });
    }
  }

  return blocks;
}

function atMinutes(reference: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(reference);
  d.setHours(h, m, 0, 0);
  return d;
}

export interface CurrentPeriodResult {
  kind: "before" | "period" | "tiffin" | "after";
  periodNumber?: number;
  timeLabel?: string; // "08:30 - 09:05"
  block?: TimeBlock;
  nextPeriodLabel?: string;
}

/** Determine what is currently happening given a `now` date and season. */
export function getCurrentPeriod(now: Date, season: Season): CurrentPeriodResult {
  const reference = new Date(now);
  reference.setHours(0, 0, 0, 0);
  const blocks = buildSchedule(season, reference);
  const ms = now.getTime();

  for (const b of blocks) {
    if (ms >= b.start.getTime() && ms < b.end.getTime()) {
      if (b.periodNumber) {
        return {
          kind: "period",
          periodNumber: b.periodNumber,
          timeLabel: `${b.startLabel} - ${b.endLabel}`,
          block: b,
        };
      }
      return {
        kind: "tiffin",
        timeLabel: `${b.startLabel} - ${b.endLabel}`,
        block: b,
      };
    }
  }

  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (ms < first.start.getTime()) {
    return { kind: "before", nextPeriodLabel: first.startLabel, block: first };
  }
  return {
    kind: "after",
    nextPeriodLabel: formatMinutes(toMinutes(last.endLabel) + 15),
    block: last,
  };
}

/** Get the end-of-day "after school" threshold so the view can show nothing running. */
export function getSchoolDayWindow(season: Season, reference: Date): {
  start: Date;
  end: Date;
} {
  const blocks = buildSchedule(season, reference);
  return { start: blocks[0].start, end: blocks[blocks.length - 1].end };
}

/**
 * Map a JS Date to the school day index.
 * Sunday=0 .. Thursday=4. Returns null for Friday/Saturday.
 */
export function getSchoolDayIndex(date: Date): number | null {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  if (jsDay === 5 || jsDay === 6) return null; // Fri, Sat
  return jsDay; // Sun..Thu already 0..4
}

/**
 * Today's date as YYYY-MM-DD in the LOCAL timezone.
 * IMPORTANT: use this (not `new Date().toISOString()`, which is UTC) so the
 * server and the adjust page agree on which calendar day is "today". A UTC
 * "today" can drift from local "today" between midnight and the UTC offset,
 * which is why adjustments sometimes didn't appear in the main routine.
 */
export function getTodayLocal(reference?: Date): string {
  const d = reference ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type { TimeBlock };
