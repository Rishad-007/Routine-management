"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownWideNarrow, Repeat, Search, SlidersHorizontal, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DAY_LABELS } from "@/lib/types";
import type { AdjustmentStatsReport, TeacherCoverageEntry } from "@/lib/reports";
import { ReportStatCards } from "./report-stats-cards";

type SortKey = "total" | "adjusted" | "fixed" | "name";

interface Props {
  report: AdjustmentStatsReport;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

/** Fixed loads can be fractional in the Daily view (weekly base / 5). */
function fmt(n: number): number | string {
  return Number.isInteger(n) ? n : n.toFixed(1);
}

export function AdjustmentStatsReport({ report }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = report.teachers;
    if (q) {
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "adjusted") return b.extraClasses - a.extraClasses;
      if (sortKey === "fixed") return b.fixedInRange - a.fixedInRange;
      return b.totalInRange - a.totalInRange;
    });
  }, [report.teachers, query, sortKey]);

  const isEmpty = rows.length === 0 && report.totalAdjustments === 0;

  const topTeachers = report.teachers
    .slice(0, 8)
    .map((t) => ({ id: t.teacherId, name: t.name, covered: t.covered }));

  const weekdayData = [0, 1, 2, 3, 4].map((i) => ({
    day: DAY_LABELS[i],
    count: report.weekdayCounts[i],
  }));

  const donutData = [
    { name: "Primary", value: report.primaryCount },
    { name: "Tag", value: report.tagCount },
  ];

  return (
    <div className="space-y-6">
      <ReportStatCards
        items={[
          {
            label: "Total adjustments",
            value: report.totalAdjustments,
            sub: `${report.averagePerSchoolDay} per school day`,
            icon: SlidersHorizontal,
            accent: "primary",
          },
          {
            label: "Substitute teachers",
            value: report.distinctSubstitutes,
            sub: `${report.openSubstitutes} of them open teachers`,
            icon: Users,
            accent: "teal",
          },
          {
            label: "Primary seats covered",
            value: report.primaryCount,
            sub: "class periods filled",
            icon: Repeat,
            accent: "indigo",
          },
          {
            label: "Tag seats covered",
            value: report.tagCount,
            sub: "assistant seats filled",
            icon: ArrowDownWideNarrow,
            accent: "amber",
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <Users className="h-4 w-4 text-[#1e3a5f]" />
              Top substitute teachers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topTeachers.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={topTeachers}
                  margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={54}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(20, 184, 166, 0.06)" }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`${value ?? 0} classes`, "Covered"]}
                  />
                  <Bar dataKey="covered" radius={[3, 3, 0, 0]} maxBarSize={28}>
                    {topTeachers.map((t) => (
                      <Cell key={t.id} fill="#0d9488" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">
                No substitutions recorded in this period.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <SlidersHorizontal className="h-4 w-4 text-amber-600" />
              Coverage by school day
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.totalAdjustments > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={weekdayData}
                  margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                >
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(245, 158, 11, 0.06)" }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`${value ?? 0} adjustments`, "Covered"]}
                  />
                  <Bar dataKey="count" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">
                No adjustments to plot for this period.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <Repeat className="h-4 w-4 text-indigo-600" />
              Primary vs tag
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={180}>
              <PieChart>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  <Cell fill="#1e3a5f" />
                  <Cell fill="#0d9488" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#1e3a5f]" />
                <span className="text-slate-600">Primary</span>
                <b className="ml-auto text-[#1e3a5f]">{report.primaryCount}</b>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
                <span className="text-slate-600">Tag</span>
                <b className="ml-auto text-[#1e3a5f]">{report.tagCount}</b>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <ArrowDownWideNarrow className="h-4 w-4 text-rose-600" />
              Adjustment trend
              <span className="text-xs font-normal text-slate-400">
                · {report.range.label}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.series.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart
                  data={report.series}
                  margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="adjustTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`${value ?? 0} adjustments`, "Total"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#0d9488"
                    strokeWidth={2}
                    fill="url(#adjustTrend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                A single day has no trend line — switch to Weekly, Monthly or Yearly view.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/70">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
            <Users className="h-4 w-4 text-[#1e3a5f]" />
            Teacher coverage detail
          </CardTitle>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search teachers…"
                className="pl-8"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-9 rounded-lg border border-slate-200 bg-transparent px-2 text-xs text-slate-600 outline-none"
            >
              <option value="total">Sort by total class</option>
              <option value="adjusted">Sort by adjusted class</option>
              <option value="fixed">Sort by fixed class</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No substitutions recorded in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="text-right">Fixed class</TableHead>
                  <TableHead className="text-right">Adjusted class</TableHead>
                  <TableHead className="text-right">Total class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.teacherId}>
                    <TableCell>
                      <TeacherCell entry={t} />
                    </TableCell>
                    <TableCell className="text-right text-slate-600">
                      {fmt(t.fixedInRange)}
                    </TableCell>
                    <TableCell className="text-right text-slate-600">
                      {t.extraClasses}
                    </TableCell>
                    <TableCell className="text-right font-bold text-[#1e3a5f]">
                      {fmt(t.totalInRange)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Fixed class = the teacher&apos;s fixed weekly timetable scaled to this
            range (daily ÷5, weekly ×1, monthly ×4, yearly ×48). Adjusted class
            = classes covered outside the teacher&apos;s own timetable. Total =
            Fixed + Adjusted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function TeacherCell({ entry }: { entry: TeacherCoverageEntry }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-semibold text-slate-800">{entry.name}</span>
      {entry.isOpen && (
        <Badge
          variant="outline"
          className="border-teal-200 bg-teal-50 px-1.5 text-[10px] font-semibold text-teal-700"
        >
          open
        </Badge>
      )}
      <span className="text-xs text-slate-400">{entry.code}</span>
    </div>
  );
}