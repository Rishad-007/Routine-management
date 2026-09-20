"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardItem {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: "primary" | "teal" | "indigo" | "rose" | "violet" | "amber";
}

const ACCENTS: Record<
  NonNullable<StatCardItem["accent"]>,
  { tile: string; text: string }
> = {
  primary: { tile: "bg-[#1e3a5f]/10", text: "text-[#1e3a5f]" },
  teal: { tile: "bg-teal-500/10", text: "text-teal-700" },
  indigo: { tile: "bg-indigo-500/10", text: "text-indigo-700" },
  rose: { tile: "bg-rose-500/10", text: "text-rose-700" },
  violet: { tile: "bg-violet-500/10", text: "text-violet-700" },
  amber: { tile: "bg-amber-500/10", text: "text-amber-700" },
};

export function ReportStatCards({ items }: { items: StatCardItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((s) => {
        const accent = ACCENTS[s.accent ?? "primary"];
        return (
          <Card key={s.label} className="bg-white/70">
            <CardContent className="p-4">
              {s.icon && (
                <div
                  className={cn(
                    "mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg",
                    accent.tile,
                  )}
                >
                  <s.icon className={cn("h-4.5 w-4.5", accent.text)} />
                </div>
              )}
              <p className="text-2xl font-bold text-[#1e3a5f]">{s.value}</p>
              <p className="text-xs font-semibold text-slate-600">{s.label}</p>
              {s.sub && <p className="text-xs text-slate-400">{s.sub}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}