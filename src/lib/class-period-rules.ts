// Shared class-period-rule helpers. Pure TypeScript — no server or Supabase
// imports, safe for both server actions (friendly validation messages) and
// the admin client components (disable out-of-range periods in the UI).
//
// The authoritative store is the `class_period_rules` table (see
// supabase/class-period-rules.sql); this file only mirrors the shape.
// `periodRangesForClassName` mirrors the SQL seed so a class created in the
// master-data UI gets the same ranges automatically.

export interface ClassPeriodRule {
  classId: string;
  day: number;
  minPeriod: number;
  maxPeriod: number;
}

/** A single day's range without the classId (used to provision new classes). */
export interface DayPeriodRange {
  day: number;
  minPeriod: number;
  maxPeriod: number;
}

interface ClassRuleTemplate {
  lo: number;
  hi: number;
  loThu: number;
  hiThu: number;
}

// Sun–Wed (days 0–3) use lo/hi; Thursday (day 4) uses loThu/hiThu.
// Keep in sync with supabase/class-period-rules.sql and supabase/seed.sql.
const CLASS_RULE_TEMPLATES: Record<number, ClassRuleTemplate> = {
  1: { lo: 5, hi: 7, loThu: 5, hiThu: 7 },
  2: { lo: 5, hi: 7, loThu: 5, hiThu: 7 },
  3: { lo: 1, hi: 4, loThu: 1, hiThu: 3 },
  4: { lo: 1, hi: 4, loThu: 1, hiThu: 3 },
  5: { lo: 1, hi: 5, loThu: 1, hiThu: 4 },
  6: { lo: 1, hi: 6, loThu: 1, hiThu: 6 },
  7: { lo: 1, hi: 6, loThu: 1, hiThu: 6 },
  8: { lo: 1, hi: 6, loThu: 1, hiThu: 6 },
  9: { lo: 1, hi: 7, loThu: 1, hiThu: 7 },
  10: { lo: 1, hi: 7, loThu: 1, hiThu: 7 },
};

export function isPeriodAllowed(
  rules: ClassPeriodRule[],
  classId: string,
  day: number,
  period: number
): boolean {
  const rule = rules.find((r) => r.classId === classId && r.day === day);
  if (!rule) return true; // no rule configured = unrestricted
  return period >= rule.minPeriod && period <= rule.maxPeriod;
}

/** The numeric range for a class on a day, or null when no rule is configured. */
export function getAllowedRange(
  rules: ClassPeriodRule[],
  classId: string,
  day: number
): { minPeriod: number; maxPeriod: number } | null {
  const rule = rules.find((r) => r.classId === classId && r.day === day);
  if (!rule) return null;
  return { minPeriod: rule.minPeriod, maxPeriod: rule.maxPeriod };
}

/** Human-readable range, e.g. "periods 5–7", or null when unrestricted. */
export function describePeriodRange(
  rules: ClassPeriodRule[],
  classId: string,
  day: number
): string | null {
  const range = getAllowedRange(rules, classId, day);
  if (!range) return null;
  if (range.minPeriod === range.maxPeriod) {
    return `period ${range.minPeriod} only`;
  }
  return `periods ${range.minPeriod}–${range.maxPeriod}`;
}

/**
 * The per-day ranges a class name maps to under the school rule table.
 * Parses `Class N` (case-insensitive); returns null for unknown names so a
 * newly-created class without a known suffix stays unrestricted (no rows),
 * consistent with "no rule configured = unrestricted".
 */
export function periodRangesForClassName(name: string): DayPeriodRange[] | null {
  const match = /^class\s+(\d+)$/i.exec(name.trim());
  if (!match) return null;
  const n = Number(match[1]);
  const t = CLASS_RULE_TEMPLATES[n];
  if (!t) return null;
  return [0, 1, 2, 3, 4].map((day) => ({
    day,
    minPeriod: day === 4 ? t.loThu : t.lo,
    maxPeriod: day === 4 ? t.hiThu : t.hi,
  }));
}