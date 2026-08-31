"use client";

import { useEffect, useState } from "react";
import {
  getCurrentPeriod,
  getSchoolDayIndex,
  type CurrentPeriodResult,
} from "@/lib/periods";
import type { Season } from "@/lib/constants";

const TICK_MS = 30_000;

export function useCurrentPeriod(season: Season): {
  result: CurrentPeriodResult;
  dayIndex: number | null;
  now: Date;
} {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return {
    result: getCurrentPeriod(now, season),
    dayIndex: getSchoolDayIndex(now),
    now,
  };
}
