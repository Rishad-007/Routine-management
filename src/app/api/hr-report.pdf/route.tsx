import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { SCHOOL_NAME_DEFAULT } from "@/lib/constants";
import { getSession } from "@/lib/auth";
import {
  getAdminNames,
  getAllAdjustments,
  getClasses,
  getRooms,
  getRoutines,
  getSections,
  getSubjects,
  getTeachers,
} from "@/lib/data";
import {
  buildAdjustmentStatsReport,
  buildUnavailabilityReport,
  type AdjustmentStatsReport,
  type TeacherAbsenceEntry,
  type TeacherCoverageEntry,
  type UnavailabilityReport,
} from "@/lib/reports";
import {
  countSchoolDays,
  formatFullDate,
  resolveReportParams,
  shortLabel,
  type ReportRange,
} from "@/lib/report-range";
import { DAY_LABELS } from "@/lib/types";
import type { AdjustmentRow } from "@/lib/types";
import {
  DocFooter,
  DocHeader,
  EmptyState,
  SectionNote,
  SectionTitle,
  SummaryCell,
  TableHeader,
  TableRow,
  pdf,
  type PdfCol,
} from "@/lib/pdf-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HR / CO level reporting.
 *
 * Page furniture rule: react-pdf repeats every `fixed` element of a `<Page>` on
 * each of that page's continuation pages, so a page may hold exactly ONE
 * repeating table header. Each table therefore gets its own `<Page>`, whose rows
 * then flow continuously to the bottom and break only between rows.
 *
 * Figures come from `buildUnavailabilityReport` / `buildAdjustmentStatsReport`,
 * the same functions behind /admin/unavailable-teachers and
 * /admin/adjustment-stats, so a printed number can never drift from the screen.
 *
 * Suspended classes are deliberately NOT filtered here: this is a historical
 * audit trail, and a class suspended today was legitimately adjusted earlier.
 * Only the live daily sheet filters suspensions.
 */

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ABSENCE_COLS: PdfCol[] = [
  { label: "Teacher", width: "28%" },
  { label: "Type", width: "8%" },
  { label: "Absent days", width: "9%", align: "right" },
  { label: "Absence dates (classes skipped)", width: "32%" },
  { label: "Classes skipped", width: "12%", align: "right" },
  { label: "Avg / day", width: "11%", align: "right" },
];

const COVER_COLS: PdfCol[] = [
  { label: "Teacher", width: "19%" },
  { label: "Type", width: "7%" },
  { label: "Covered", width: "8%", align: "right" },
  { label: "Extra classes", width: "13%", align: "right" },
  { label: "Extra days", width: "8%", align: "right" },
  { label: "Primary", width: "7%", align: "right" },
  { label: "Tag", width: "6%", align: "right" },
  { label: "Days", width: "6%", align: "right" },
  { label: "Fixed / week", width: "8%", align: "right" },
  { label: "Subjects covered", width: "18%" },
];

const LEDGER_COLS: PdfCol[] = [
  { label: "Date", width: "7%" },
  { label: "Day", width: "6%" },
  { label: "Class & Section", width: "16%" },
  { label: "Period", width: "5%", align: "center" },
  { label: "Role", width: "5%" },
  { label: "Original teacher", width: "13%" },
  { label: "New teacher", width: "13%" },
  { label: "Subject", width: "12%" },
  { label: "Reason", width: "11%" },
  { label: "By", width: "5%" },
  { label: "Recorded at", width: "7%" },
];

type ReportKind = "absence" | "stats" | "combined";

function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd} ${MONTH_SHORT[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function dateWithCount(d: { date: string; count: number }): string {
  return `${shortLabel(d.date)} (${d.count})`;
}

function schoolDayHint(range: ReportRange): string {
  const days = countSchoolDays(range);
  return `${days} school day${days === 1 ? "" : "s"}`;
}

function AbsenceRows({ entries }: { entries: TeacherAbsenceEntry[] }) {
  return (
    <>
      <TableHeader cols={ABSENCE_COLS} />
      {entries.map((e, i) => (
        <TableRow
          key={e.teacherId}
          cols={ABSENCE_COLS}
          striped={i % 2 === 1}
          strongFirst
          cells={[
            `${e.name} (${e.code})`,
            e.isOpen ? "Open" : "Regular",
            String(e.daysAbsent),
            e.byDate.map(dateWithCount).join(", "),
            String(e.skipped),
            String(e.avgPerDay),
          ]}
        />
      ))}
    </>
  );
}

interface CoverTotals {
  covered: number;
  extra: number;
  primary: number;
  tag: number;
}

function CoverRows({
  entries,
  totals,
}: {
  entries: TeacherCoverageEntry[];
  totals: CoverTotals;
}) {
  const allExtra = entries.every((e) => e.extraClasses === 0);
  return (
    <>
      <TableHeader cols={COVER_COLS} />
      {entries.map((e, i) => (
        <TableRow
          key={e.teacherId}
          cols={COVER_COLS}
          striped={i % 2 === 1}
          strongFirst
          cells={[
            `${e.name} (${e.code})`,
            e.isOpen ? "Open" : "Regular",
            String(e.covered),
            String(e.extraClasses),
            String(e.daysWithExtra),
            String(e.primaryCovered),
            String(e.tagCovered),
            String(e.daysCovered),
            String(e.fixedWeekly),
            e.subjects.length
              ? e.subjects.map((x) => `${x.label} (${x.count})`).join(", ")
              : "—",
          ]}
        />
      ))}
      <TableRow
        cols={COVER_COLS}
        strongFirst
        cells={[
          `TOTAL — ${entries.length} substitute(s)`,
          "",
          String(totals.covered),
          String(totals.extra),
          "",
          String(totals.primary),
          String(totals.tag),
          "",
          "",
          "",
        ]}
      />
      {allExtra ? (
        <View style={{ marginTop: 4 }}>
          <Text style={pdf.sectionNote}>
            Every substitution in this period fell in a period the substitute was
            already timetabled to teach, so no genuinely additional class was
            taken on.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function LedgerRows({
  adjustments,
  sections,
  classes,
  teacherName,
  subjectName,
  adminName,
  roomName,
}: {
  adjustments: AdjustmentRow[];
  sections: Map<string, { class_id: string; name: string; room_id: string | null }>;
  classes: Map<string, string>;
  teacherName: Map<string, string>;
  subjectName: Map<string, string>;
  adminName: Map<string, string>;
  roomName: Map<string, string>;
}) {
  return (
    <>
      <TableHeader cols={LEDGER_COLS} />
      {adjustments.map((a, i) => {
        const section = sections.get(a.section_id);
        const cls = section ? classes.get(section.class_id) : undefined;
        const room = section?.room_id ? roomName.get(section.room_id) : undefined;
        const label =
          cls && section
            ? `${cls}-${section.name}${room ? ` (${room})` : ""}`
            : section?.name ?? "—";
        const subject = a.new_subject_id
          ? subjectName.get(a.new_subject_id)
          : a.original_subject_id
            ? subjectName.get(a.original_subject_id)
            : undefined;
        const weekday = new Date(`${a.adjust_date}T00:00:00`).getDay();
        return (
          <TableRow
            key={a.id ?? `${a.adjust_date}-${a.section_id}-${a.period_number}-${i}`}
            cols={LEDGER_COLS}
            striped={i % 2 === 1}
            cells={[
              shortLabel(a.adjust_date),
              weekday < 5 ? DAY_LABELS[weekday].slice(0, 3) : "—",
              label,
              String(a.period_number),
              a.is_tag ? "Tag" : "Primary",
              a.original_teacher_id
                ? teacherName.get(a.original_teacher_id) ?? "—"
                : "Vacant",
              a.new_teacher_id ? teacherName.get(a.new_teacher_id) ?? "—" : "—",
              subject ?? "—",
              a.reason || "—",
              a.created_by ? adminName.get(a.created_by) ?? "—" : "—",
              formatStamp(a.created_at),
            ]}
          />
        );
      })}
    </>
  );
}

function AbsenceSummaryGrid({ r }: { r: UnavailabilityReport }) {
  return (
    <View style={pdf.summaryGrid}>
      <SummaryCell label="Teachers affected" value={r.totalAffected} hint="unavailable at least once" />
      <SummaryCell label="Teacher-days absent" value={r.totalTeacherDays} />
      <SummaryCell label="Classes skipped" value={r.totalSkipped} />
      <SummaryCell
        label="Avg skipped / school day"
        value={r.averagePerDay}
        hint={schoolDayHint(r.range)}
      />
      <SummaryCell label="Vacant seats" value={r.totalVacant} hint="no fixed teacher" />
      <SummaryCell
        label="Peak absence day"
        value={r.busiestDate ? shortLabel(r.busiestDate) : "—"}
        hint={r.busiestDate ? `${r.busiestCount} class(es)` : "none recorded"}
      />
      <SummaryCell
        label="Most impacted subject"
        value={r.subjectImpact[0]?.label ?? "—"}
        hint={r.subjectImpact[0] ? `${r.subjectImpact[0].count} class(es)` : undefined}
      />
      <SummaryCell
        label="Period covered"
        value={r.range.label}
        hint={`${r.range.start} to ${r.range.end}`}
      />
    </View>
  );
}

function CoverageSummaryGrid({ r }: { r: AdjustmentStatsReport }) {
  const top = [...r.teachers].sort((a, b) => b.extraClasses - a.extraClasses)[0];
  const peak = [...r.series].sort((a, b) => b.count - a.count)[0];
  return (
    <View style={pdf.summaryGrid}>
      <SummaryCell label="Total adjustments" value={r.totalAdjustments} />
      <SummaryCell
        label="Classes covered"
        value={r.totalCovered}
        hint={`${r.primaryCount} primary · ${r.tagCount} tag`}
      />
      <SummaryCell
        label="Extra classes taken"
        value={r.totalExtraClasses}
        hint={`outside own timetable · ${r.teachersWithExtra} teacher(s)`}
      />
      <SummaryCell label="Distinct substitutes" value={r.distinctSubstitutes} />
      <SummaryCell
        label="Open teachers used"
        value={r.openSubstitutes}
        hint="of distinct substitutes"
      />
      <SummaryCell
        label="Avg adjustments / school day"
        value={r.averagePerSchoolDay}
        hint={schoolDayHint(r.range)}
      />
      <SummaryCell
        label="Peak adjustment day"
        value={peak && peak.count > 0 ? peak.label : "—"}
        hint={peak && peak.count > 0 ? `${peak.count} adjustment(s)` : "none recorded"}
      />
      <SummaryCell
        label="Heaviest extra load"
        value={top && top.extraClasses > 0 ? top.name : "—"}
        hint={
          top && top.extraClasses > 0
            ? `${top.extraClasses} extra class(es)`
            : "no extra classes"
        }
      />
      <SummaryCell
        label="Period covered"
        value={r.range.label}
        hint={`${r.range.start} to ${r.range.end}`}
      />
    </View>
  );
}

export async function GET(req: NextRequest) {
  // Staff HR data. /api/* is outside the /admin middleware matcher, so the
  // session has to be verified here.
  const session = await getSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") as ReportKind | null;
  if (kind !== "absence" && kind !== "stats" && kind !== "combined") {
    return new NextResponse("Missing kind (absence|stats|combined)", {
      status: 400,
    });
  }

  const rawRange = searchParams.get("range") ?? undefined;
  const rawDate = searchParams.get("date") ?? undefined;
  const range = resolveReportParams(rawRange, rawDate);

  const [adjustments, routines, teachers, subjects, sections, classes, rooms, adminNames] =
    await Promise.all([
      getAllAdjustments(),
      getRoutines(),
      getTeachers(),
      getSubjects(),
      getSections(),
      getClasses(),
      getRooms(),
      getAdminNames(),
    ]);

  const wantsAbsence = kind === "absence" || kind === "combined";
  const wantsCoverage = kind === "stats" || kind === "combined";

  const inRange = adjustments.filter(
    (a) => a.adjust_date >= range.start && a.adjust_date <= range.end
  );

  const absence = wantsAbsence
    ? buildUnavailabilityReport(adjustments, teachers, sections, classes, subjects, range)
    : null;
  const coverage = wantsCoverage
    ? buildAdjustmentStatsReport(adjustments, routines, teachers, subjects, range)
    : null;

  const generatedAt = new Date();
  // The label already spells out a single day, so only widen it for multi-day
  // ranges where it is just "Oct 4 – Oct 8".
  const period =
    range.start === range.end
      ? ""
      : ` · ${formatFullDate(range.start)} to ${formatFullDate(range.end)}`;
  const subtitle = `${range.label}${period} · ${inRange.length} adjustment record(s) · generated ${formatStamp(
    generatedAt.toISOString()
  )} by ${session.username}`;

  const sectionTitle =
    kind === "absence"
      ? "Teacher Absence & Leave Report"
      : kind === "stats"
        ? "Substitute Coverage Report"
        : "Adjustment & Absence Report";

  const teacherName = new Map(teachers.map((t) => [t.id, t.full_name]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const className = new Map(classes.map((c) => [c.id, c.name]));
  const sectionMap = new Map(
    sections.map((s) => [s.id, { class_id: s.class_id, name: s.name, room_id: s.room_id }])
  );
  const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
  const adminNameMap = new Map(Object.entries(adminNames));

  const pages: React.ReactElement[] = [];

  // One table per <Page>: each page carries exactly one repeating header, so a
  // continuation page can never show another section's column titles.
  pages.push(
    <Page key="head" size="A4" orientation="portrait" style={pdf.page}>
      <DocHeader
        schoolName={SCHOOL_NAME_DEFAULT}
        title={sectionTitle}
        subtitle={subtitle}
      />

      <SectionTitle>Executive summary</SectionTitle>
      {absence ? <AbsenceSummaryGrid r={absence} /> : null}
      {coverage ? <CoverageSummaryGrid r={coverage} /> : null}
      <View style={{ height: 8 }} />

      {absence ? (
        <>
          <SectionTitle>Absence &amp; leave register</SectionTitle>
          <SectionNote>
            One row per unavailable teacher. Absence dates lists every date in the
            period with the number of that teacher&apos;s classes skipped on it.
            Vacant seats with no fixed teacher are not attributed to a teacher.
          </SectionNote>
          {absence.teachers.length === 0 ? (
            <EmptyState>
              No teacher was unavailable in this period — every class ran as
              scheduled.
            </EmptyState>
          ) : (
            <AbsenceRows entries={absence.teachers} />
          )}
        </>
      ) : null}

      {coverage && kind !== "combined" ? (
        <>
          <SectionTitle>Substitute load report</SectionTitle>
          <SectionNote>
            Extra classes are the periods a teacher was asked to cover when they
            were NOT already timetabled to teach — the genuinely additional work.
            A substitution handed to someone already in that period is counted
            under Covered only. Fixed / week is their regular routine load.
          </SectionNote>
          {coverage.teachers.length === 0 ? (
            <EmptyState>No substitutions recorded in this period.</EmptyState>
          ) : (
            <CoverRows
              entries={coverage.teachers}
              totals={{
                covered: coverage.totalCovered,
                extra: coverage.totalExtraClasses,
                primary: coverage.primaryCount,
                tag: coverage.tagCount,
              }}
            />
          )}
        </>
      ) : null}

      <DocFooter note={`${sectionTitle} · ${range.label}`} />
    </Page>
  );

  // In the combined report the two tables live on separate pages, so each page
  // carries exactly one repeating header.
  if (kind === "combined") {
    pages.push(
      <Page key="cover-load" size="A4" orientation="portrait" style={pdf.page}>
        <DocHeader
          schoolName={SCHOOL_NAME_DEFAULT}
          title="Substitute load report"
          subtitle={subtitle}
        />
        <SectionNote>
          Extra classes = periods covered when the teacher was not already
          timetabled to teach. Sorted by extra classes.
        </SectionNote>
        {coverage && coverage.teachers.length > 0 ? (
          <CoverRows
            entries={coverage.teachers}
            totals={{
              covered: coverage.totalCovered,
              extra: coverage.totalExtraClasses,
              primary: coverage.primaryCount,
              tag: coverage.tagCount,
            }}
          />
        ) : (
          <EmptyState>No substitutions recorded in this period.</EmptyState>
        )}
        <DocFooter note={`Substitute load · ${range.label}`} />
      </Page>
    );
  }

  if (inRange.length > 0) {
    const sorted = [...inRange].sort(
      (a, b) =>
        a.adjust_date.localeCompare(b.adjust_date) ||
        a.period_number - b.period_number ||
        (a.is_tag ? 1 : 0) - (b.is_tag ? 1 : 0)
    );
    pages.push(
      <Page key="ledger" size="A4" orientation="landscape" style={pdf.pageLandscape}>
        <DocHeader
          schoolName={SCHOOL_NAME_DEFAULT}
          title={`Adjustment ledger — ${range.label}`}
          subtitle={`${sorted.length} record(s) between ${range.start} and ${range.end}. Every change to a teacher, subject or room, in date order.`}
        />
        <LedgerRows
          adjustments={sorted}
          sections={sectionMap}
          classes={className}
          teacherName={teacherName}
          subjectName={subjectName}
          adminName={adminNameMap}
          roomName={roomNames}
        />
        <DocFooter note={`Adjustment ledger · ${range.label}`} />
      </Page>
    );
  }

  const PDFDoc = <Document>{pages}</Document>;

  const { pdf: renderPdf } = await import("@react-pdf/renderer");
  const buffer = (await renderPdf(PDFDoc).toBuffer()) as unknown as BodyInit;

  const suffix = `${range.start}-to-${range.end}`;
  const filename =
    kind === "absence"
      ? `absence-report-${suffix}.pdf`
      : kind === "stats"
        ? `substitute-report-${suffix}.pdf`
        : `hr-report-combined-${suffix}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}