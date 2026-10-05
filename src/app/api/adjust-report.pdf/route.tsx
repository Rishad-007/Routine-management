import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { DAY_LABEL_LIST, SCHOOL_NAME_DEFAULT } from "@/lib/constants";
import { getSchoolDayIndex } from "@/lib/periods";
import { getSession } from "@/lib/auth";
import { fetchAllRows, type PagedQuery } from "@/lib/data";
import {
  filterSuspendedAdjustments,
  filterSuspendedRoutines,
} from "@/lib/suspensions";
import {
  DocFooter,
  DocHeader,
  EmptyState,
  TableHeader,
  TableRow,
  pdf,
  type PdfCol,
} from "@/lib/pdf-kit";
import type {
  SectionRow,
  ClassRow,
  TeacherRow,
  SubjectRow,
  RoomRow,
  RoutineRow,
  AdjustmentRow,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One small table per unavailable teacher: the teacher's name heads the block and
 * the column header follows it, so a class teacher can initial the whole block at
 * once. The teacher therefore does NOT need a column of its own.
 *
 * The blocks run continuously down a single `<Page>` with no forced page break
 * between them. Each block is `wrap={false}`, so a block is never split: when the
 * page runs out of room the whole table moves to the next page with its heading
 * and header intact, and `repeat={false}` stops one teacher's header from being
 * painted on every other teacher's continuation.
 */
const COLS: PdfCol[] = [
  { label: "Class & Section", width: "32%" },
  { label: "Period", width: "8%", align: "center" },
  { label: "Subject", width: "27%" },
  { label: "New Assigned Teacher", width: "23%" },
  { label: "Signature", width: "10%" },
];

interface ReportRow {
  label: string;
  period: number;
  subjectName: string;
  newTeacher: string;
  sortLabel: string;
}

async function fetchReportData(date: string) {
  const admin = createAdminClient();
  const day = getSchoolDayIndex(new Date(date + "T00:00:00"));
  const dayIndex = day as number;

  // One weekday of `routines` is ~600 rows today and grows with the section
  // count — page it so the report never silently loses periods.
  const [clsRes, secRes, teaRes, subRes, roomRes, adjRes, dayRoutines] =
    await Promise.all([
      admin.from("classes").select("*").order("sort_order", { ascending: true }),
      admin.from("sections").select("*"),
      admin.from("teachers").select("*").order("full_name"),
      admin.from("subjects").select("*"),
      admin.from("rooms").select("*"),
      admin.from("adjustments").select("*").eq("adjust_date", date),
      fetchAllRows<RoutineRow>(
        () =>
          admin
            .from("routines")
            .select("*", { count: "exact" })
            .eq("day", dayIndex) as unknown as PagedQuery<RoutineRow>,
      ),
    ]);

  const classes = (clsRes.data ?? []) as ClassRow[];
  const sections = (secRes.data ?? []) as SectionRow[];
  const teachers = (teaRes.data ?? []) as TeacherRow[];
  const subjects = (subRes.data ?? []) as SubjectRow[];
  const rooms = (roomRes.data ?? []) as RoomRow[];
  // Suspended classes are not running, so their substitutions are moot.
  const adjustments = filterSuspendedAdjustments(
    (adjRes.data ?? []) as AdjustmentRow[],
    sections,
    classes,
  );
  const routines = filterSuspendedRoutines(dayRoutines, sections, classes);

  const cls = new Map(classes.map((c) => [c.id, c]));
  const sec = new Map(sections.map((s) => [s.id, s]));
  const tch = new Map(teachers.map((t) => [t.id, t]));
  const sub = new Map(subjects.map((s) => [s.id, s]));
  const room = new Map(rooms.map((r) => [r.id, r]));

  // Base routine subject fallback keyed by section:period:isTag
  const base = new Map<string, RoutineRow>();
  for (const r of routines) {
    const key = `${r.section_id}:${r.period_number}:${r.is_tag ? 1 : 0}`;
    if (!base.has(key)) base.set(key, r);
  }

  const rows: Array<ReportRow & { originalTeacherId: string | null }> =
    adjustments.map((a) => {
      const section = sec.get(a.section_id);
      const classRow = section ? cls.get(section.class_id) : undefined;
      // The section's fixed room, e.g. "Class 9-Dhalia (R-295)".
      const roomName = section?.room_id
        ? room.get(section.room_id)?.name
        : undefined;
      const label =
        classRow && section
          ? `${classRow.name}-${section.name}${roomName ? ` (${roomName})` : ""}`
          : section?.name ?? "—";

      const baseRow = base.get(
        `${a.section_id}:${a.period_number}:${a.is_tag ? 1 : 0}`
      );
      const subjectName =
        (a.new_subject_id && sub.get(a.new_subject_id)?.name) ||
        (a.original_subject_id && sub.get(a.original_subject_id)?.name) ||
        (baseRow?.subject_id && sub.get(baseRow.subject_id)?.name) ||
        "—";

      return {
        originalTeacherId: a.original_teacher_id,
        label,
        period: a.period_number ?? 0,
        subjectName: a.is_tag ? `${subjectName} (Tag)` : subjectName,
        newTeacher: (a.new_teacher_id ? tch.get(a.new_teacher_id)?.full_name : undefined) || "—",
        sortLabel: `${classRow?.name ?? ""}${section?.name ?? ""}`,
      };
    });

  // One group per unavailable teacher, then by class, then by period. Each group
  // becomes its own small table with the teacher's name as the heading.
  const groups = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const key = r.originalTeacherId ?? "__none__";
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const groupList = Array.from(groups.entries())
    .map(([id, groupRows]) => {
      const t = id !== "__none__" ? tch.get(id) : undefined;
      return {
        id,
        name: t?.full_name || "—",
        code: t?.teacher_code ?? "",
        rows: groupRows.sort(
          (a, b) => a.sortLabel.localeCompare(b.sortLabel) || a.period - b.period
        ),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    groups: groupList,
    total: rows.length,
    teacherCount: groupList.length,
    dayIndex,
    label: DAY_LABEL_LIST[dayIndex],
  };
}

export async function GET(req: NextRequest) {
  // Staff absence data — this route is not covered by the /admin middleware
  // matcher, so it must verify the session itself.
  const session = await getSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) {
    return new NextResponse("Missing date (YYYY-MM-DD)", { status: 400 });
  }
  const parsed = new Date(date + "T00:00:00");
  if (Number.isNaN(parsed.getTime())) {
    return new NextResponse("Invalid date", { status: 400 });
  }
  const dayIndex = getSchoolDayIndex(parsed);
  if (dayIndex === null) {
    return new NextResponse("Weekend (Friday/Saturday) — no report", {
      status: 400,
    });
  }

  let data;
  try {
    data = await fetchReportData(date);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const { groups, total, teacherCount, label } = data;

  // ONE page, ONE continuous run of per-teacher tables. Nothing forces a page
  // break between them: each block only moves to the next page when it no longer
  // fits, and it always moves whole.
  const PDFDoc = (
    <Document>
      <Page size="A4" orientation="portrait" style={pdf.page}>
        <DocHeader
          schoolName={SCHOOL_NAME_DEFAULT}
          title="Daily Adjustment Report — Adjust Class"
          subtitle={`Date: ${date} (${label}) · ${total} substitution(s), ${teacherCount} unavailable teacher(s)`}
        />

        {groups.length === 0 ? (
          <EmptyState>No adjustments recorded for this date.</EmptyState>
        ) : (
          <>
            {groups.map((g) => (
              <View key={g.id} wrap={false}>
                <View style={pdf.groupHeading}>
                  <Text style={pdf.groupHeadingName}>
                    {g.code ? `${g.name}  (${g.code})` : g.name}
                  </Text>
                  <Text style={pdf.groupHeadingMeta}>
                    {`${g.rows.length} period(s) reassigned`}
                  </Text>
                </View>
                <TableHeader cols={COLS} repeat={false} />
                {g.rows.map((r, i) => (
                  <TableRow
                    key={`${g.id}-${r.sortLabel}-${r.period}-${r.subjectName}-${i}`}
                    cols={COLS}
                    striped={i % 2 === 1}
                    cells={[r.label, String(r.period), r.subjectName, r.newTeacher, ""]}
                  />
                ))}
              </View>
            ))}
            <View style={{ marginTop: 8 }}>
              <Text style={pdf.sectionNote}>
                {`Total substitutions on this date: ${total}, grouped by the unavailable teacher who could not teach them. Initial one block, then pass the sheet to the class teacher.`}
              </Text>
            </View>
          </>
        )}

        <DocFooter note={`Daily Adjustment Report · ${date} (${label})`} />
      </Page>
    </Document>
  );

  const { pdf: renderPdf } = await import("@react-pdf/renderer");
  const buffer = (await renderPdf(PDFDoc).toBuffer()) as unknown as BodyInit;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="adjust-report-${date}.pdf"`,
    },
  });
}