import { DAY_LABELS } from "./types";

export const SCHOOL_NAME_DEFAULT = "Cantonment Public School & College, Rangpur";

export const DAY_ORDER = [0, 1, 2, 3, 4];
export const DAY_LABEL_LIST = DAY_ORDER.map((d) => DAY_LABELS[d]);

export const PERIOD_ORDER = [1, 2, 3, 4, 5, 6, 7];
export const TIFFIN_AFTER_PERIOD = 4;

export type Season = "summer" | "winter";

// Season key used in the settings table
export const SEASON = "season";

export const COLORS = {
  primary: "#1e3a5f",
  accent: "#0d9488",
  gold: "#c9a227",
  background: "#f8fafc",
  text: "#0f172a",
  muted: "#64748b",
};
