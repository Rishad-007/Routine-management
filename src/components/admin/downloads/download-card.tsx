"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileDown, FileText, Loader2, ScrollText, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportGranularity } from "@/lib/report-range";

/**
 * One downloadable report. The PDF is produced by a GET route, so the browser
 * handles the download natively — the button only tracks the in-flight state to
 * avoid a dead click while the server renders.
 */
export interface DownloadItem {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  kind: "absence" | "stats" | "combined" | "daily";
  accent: "primary" | "teal" | "indigo";
  /** Human label of the file, shown under the button. */
  filename: string;
  pages: string;
}

export const DOWNLOAD_ITEMS: DownloadItem[] = [
  {
    key: "daily",
    title: "Daily adjustment sheet",
    description:
      "The signed sheet for one school day: every period reassigned away from an unavailable teacher, grouped by that teacher so the column can be initialled in one go.",
    icon: FileText,
    kind: "daily",
    accent: "indigo",
    filename: "adjust-report-<date>.pdf",
    pages: "Portrait, continuous table",
  },
  {
    key: "combined",
    title: "Adjustment & Absence Report",
    description:
      "Everything in one document: executive summary, the leave and absence register, who covered the classes, and the full adjustment ledger with the admin who recorded each change.",
    icon: ScrollText,
    kind: "combined",
    accent: "primary",
    filename: "hr-report-combined-<range>.pdf",
    pages: "Portrait summary + tables, landscape ledger",
  },
  {
    key: "absence",
    title: "Teacher Absence & Leave",
    description:
      "One row per unavailable teacher: days absent, every date with the number of classes skipped, average skipped per day, and the subjects their absence hit.",
    icon: Users,
    kind: "absence",
    accent: "teal",
    filename: "absence-report-<range>.pdf",
    pages: "Portrait",
  },
  {
    key: "stats",
    title: "Substitute Coverage",
    description:
      "Who covered the most adjusted classes, split by primary and tag duty, compared against each teacher's fixed weekly routine load so extra work is obvious.",
    icon: FileText,
    kind: "stats",
    accent: "indigo",
    filename: "substitute-report-<range>.pdf",
    pages: "Portrait",
  },
];

const ACCENTS: Record<
  NonNullable<DownloadItem["accent"]>,
  { tile: string; text: string }
> = {
  primary: { tile: "bg-[#1e3a5f]/10", text: "text-[#1e3a5f]" },
  teal: { tile: "bg-teal-500/10", text: "text-teal-700" },
  indigo: { tile: "bg-indigo-500/10", text: "text-indigo-700" },
};

function reportHref(
  kind: DownloadItem["kind"],
  granularity: ReportGranularity,
  anchor: string,
): string {
  // The daily sheet is per school day, so it ignores the range and uses the
  // anchor date only.
  if (kind === "daily") return `/api/adjust-report.pdf?date=${anchor}`;
  return `/api/hr-report.pdf?kind=${kind}&range=${granularity}&date=${anchor}`;
}

export function DownloadCard({
  item,
  granularity,
  anchor,
  blockedReason,
}: {
  item: DownloadItem;
  granularity: ReportGranularity;
  anchor: string;
  /** When set, the button is disabled and the reason is shown instead. */
  blockedReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const accent = ACCENTS[item.accent];
  const href = reportHref(item.kind, granularity, anchor);
  const disabled = Boolean(blockedReason);

  return (
    <Card className="flex h-full flex-col bg-white/70">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              accent.tile,
            )}
          >
            <item.icon className={cn("h-5 w-5", accent.text)} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#1e3a5f]">
              {item.title}
            </h2>
            <p className="text-xs text-slate-400">{item.pages}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-slate-600">
          {item.description}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
          <a
            href={href}
            aria-disabled={disabled || undefined}
            onClick={(e) => {
              if (disabled) {
                e.preventDefault();
                return;
              }
              setBusy(true);
            }}
            onLoad={() => setBusy(false)}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488] hover:text-white",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            {disabled ? "Unavailable" : busy ? "Preparing…" : "Download PDF"}
          </a>
          <code className="truncate text-[11px] text-slate-400">
            {blockedReason ?? item.filename}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
/**
 * Renders every card. The catalog stays inside this client module on purpose:
 * a `"use client"` module's plain exports are client references, so a server
 * component cannot read `DOWNLOAD_ITEMS`, and the icon components in it are
 * functions that cannot cross the server/client boundary as props.
 */
export function DownloadsGrid({
  granularity,
  anchor,
  dailyBlockedReason,
}: {
  granularity: ReportGranularity;
  anchor: string;
  dailyBlockedReason?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {DOWNLOAD_ITEMS.map((item) => (
        <DownloadCard
          key={item.key}
          item={item}
          granularity={granularity}
          anchor={anchor}
          blockedReason={
            item.kind === "daily" ? dailyBlockedReason : undefined
          }
        />
      ))}
    </div>
  );
}
