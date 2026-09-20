"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Search, TrendingUp, UserX, Users, XCircle } from "lucide-react";
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
import { shortLabel } from "@/lib/report-range";
import { DAY_LABELS } from "@/lib/types";
import type { UnavailabilityReport, TeacherAbsenceEntry } from "@/lib/reports";
import { ReportStatCards } from "./report-stats-cards";

type SortKey = "skipped" | "daysAbsent" | "avgPerDay" | "name";

interface Props {
  report: UnavailabilityReport;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
};

export function UnavailableTeachersReport({ report }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("skipped");

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
      if (sortKey === "daysAbsent") return b.daysAbsent - a.daysAbsent;
      if (sortKey === "avgPerDay") return b.avgPerDay - a.avgPerDay;
      return b.skipped - a.skipped;
    });
  }, [report.teachers, query, sortKey]);

  const isEmpty = rows.length === 0 && report.totalSkipped === 0 && report.totalVacant === 0;

  const topTeachers = report.teachers
    .slice(0, 8)
    .map((t) => ({ id: t.teacherId, name: t.name, skipped: t.skipped }));

  const weekdayData = [0, 1, 2, 3, 4].map((i) => ({
    day: DAY_LABELS[i],
    count: report.weekdayCounts[i],
  }));

  return (
    <div className="space-y-6">
      <ReportStatCards
        items={[
          {
            label: "Teachers affected",
            value: report.totalAffected,
            sub: `${report.totalTeacherDays} absent teacher-days`,
            icon: Users,
            accent: "primary",
          },
          {
            label: "Classes skipped",
            value: report.totalSkipped,
            sub: `${report.averagePerDay} per school day`,
            icon: XCircle,
            accent: "rose",
          },
          {
            label: "Peak day",
            value: report.busiestCount,
            sub: report.busiestDate ? shortLabel(report.busiestDate) : "no absences",
            icon: CalendarDays,
            accent: "amber",
          },
          {
            label: "Vacant seats filled",
            value: report.totalVacant,
            sub: "covered with no fixed teacher",
            icon: UserX,
            accent: "violet",
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <UserX className="h-4 w-4 text-[#1e3a5f]" />
              Top affected teachers
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
                    cursor={{ fill: "rgba(30, 58, 95, 0.06)" }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`${value ?? 0} classes`, "Skipped"]}
                  />
                  <Bar dataKey="skipped" radius={[3, 3, 0, 0]} maxBarSize={28}>
                    {topTeachers.map((t) => (
                      <Cell key={t.id} fill="#1e3a5f" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">
                No teacher absences in this period.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
              <Users className="h-4 w-4 text-teal-600" />
              Absences by school day
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.totalSkipped > 0 ? (
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
                    cursor={{ fill: "rgba(20, 184, 166, 0.06)" }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`${value ?? 0} classes`, "Skipped"]}
                  />
                  <Bar dataKey="count" fill="#0d9488" radius={[3, 3, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">
                No absences to plot for this period.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            Absence trend
            <span className="text-xs font-normal text-slate-400">
              · {report.range.label}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.series.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={report.series}
                margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="absenceTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
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
                  formatter={(value) => [`${value ?? 0} classes`, "Skipped"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#absenceTrend)"
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

      <Card className="bg-white/70">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base text-[#1e3a5f]">
            <Users className="h-4 w-4 text-[#1e3a5f]" />
            Teacher absence detail
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
              <option value="skipped">Most skipped</option>
              <option value="daysAbsent">Most absent days</option>
              <option value="avgPerDay">Highest avg/day</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No unavailability recorded in this period. The routine ran as scheduled.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Absent days</TableHead>
                  <TableHead>Absence dates</TableHead>
                  <TableHead className="text-right">Classes skipped</TableHead>
                  <TableHead className="text-right">Avg / day</TableHead>
                  <TableHead>Subjects impacted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.teacherId}>
                    <TableCell>
                      <TeacherCell entry={t} />
                    </TableCell>
                    <TableCell className="font-semibold text-[#1e3a5f]">
                      {t.daysAbsent}
                    </TableCell>
                    <TableCell>
                      <DateChips dates={t.byDate} />
                    </TableCell>
                    <TableCell className="text-right font-bold text-[#1e3a5f]">
                      {t.skipped}
                    </TableCell>
                    <TableCell className="text-right text-slate-600">
                      {t.avgPerDay}
                    </TableCell>
                    <TableCell>
                      <SubjectChips labels={t.subjectImpact.map((s) => s.label)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {report.totalVacant > 0 && (
            <p className="mt-3 text-xs text-slate-400">
              Note: {report.totalVacant} vacant seat(s) — periods with no fixed
              teacher — were covered separately and are not attributed to a teacher.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeacherCell({ entry }: { entry: TeacherAbsenceEntry }) {
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

function DateChips({ dates }: { dates: { date: string; count: number }[] }) {
  const visible = dates.slice(0, 6);
  const extra = dates.length - visible.length;
  return (
    <div className="flex max-w-72 flex-wrap gap-1">
      {visible.map((d) => (
        <span
          key={d.date}
          className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
        >
          {shortLabel(d.date)}
          {d.count > 1 && <b className="text-rose-600">×{d.count}</b>}
        </span>
      ))}
      {extra > 0 && (
        <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
          +{extra} more
        </span>
      )}
    </div>
  );
}

function SubjectChips({ labels }: { labels: string[] }) {
  const visible = labels.slice(0, 2);
  if (visible.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex max-w-56 flex-wrap gap-1">
      {visible.map((label) => (
        <Badge
          key={label}
          variant="outline"
          className="border-slate-200 bg-slate-50 px-1.5 text-[10px] font-medium text-slate-600"
        >
          {label}
        </Badge>
      ))}
      {labels.length > visible.length && (
        <span className="text-[10px] text-slate-400">
          +{labels.length - visible.length} more
        </span>
      )}
    </div>
  );
}