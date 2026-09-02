import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { DAY_LABEL_LIST, SCHOOL_NAME_DEFAULT } from "@/lib/constants";
import { getSchoolDayIndex } from "@/lib/periods";
import type {
  SectionRow,
  ClassRow,
  TeacherRow,
  SubjectRow,
  RoutineRow,
  AdjustmentRow,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  header: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 14,
    color: "#1e3a5f",
    marginBottom: 3,
  },
  title: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 11,
    color: "#0d9488",
    marginBottom: 2,
  },
  subheader: {
    textAlign: "center",
    fontSize: 9,
    color: "#334155",
    marginBottom: 14,
  },
  teacherBlock: {
    marginBottom: 16,
  },
  teacherName: {
    fontWeight: "bold",
    fontSize: 10,
    color: "#1e3a5f",
    marginBottom: 4,
  },
  noRows: {
    fontSize: 9,
    color: "#64748b",
    textAlign: "center",
    padding: 12,
  },
  table: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
  },
  row: { flexDirection: "row" },
  headCell: {
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 5,
    fontWeight: "bold",
    fontSize: 8,
    backgroundColor: "#f1f5f9",
    color: "#1e3a5f",
    textAlign: "center",
  },
  bodyCell: {
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 5,
    fontSize: 8,
    color: "#334155",
    textAlign: "center",
  },
  clsCol: { width: "24%" },
  perCol: { width: "10%" },
  subCol: { width: "24%" },
  teaCol: { width: "24%" },
  sigCol: { width: "18%" },
  footer: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 7,
    color: "#94a3b8",
  },
});

interface ReportRow {
  label: string;
  period: number;
  subjectName: string;
  newTeacher: string;
  isTag: boolean;
  sortLabel: string;
}

interface TeacherGroup {
  name: string;
  code: string;
  rows: ReportRow[];
}

async function fetchReportData(date: string) {
  const admin = createAdminClient();
  const day = getSchoolDayIndex(new Date(date + "T00:00:00"));
  const dayIndex = day as number;

  const [clsRes, secRes, teaRes, subRes, adjRes, rotRes] = await Promise.all([
    admin.from("classes").select("*").order("sort_order", { ascending: true }),
    admin.from("sections").select("*"),
    admin.from("teachers").select("*").order("full_name"),
    admin.from("subjects").select("*"),
    admin.from("adjustments").select("*").eq("adjust_date", date),
    admin.from("routines").select("*").eq("day", dayIndex),
  ]);

  const classes = (clsRes.data ?? []) as ClassRow[];
  const sections = (secRes.data ?? []) as SectionRow[];
  const teachers = (teaRes.data ?? []) as TeacherRow[];
  const subjects = (subRes.data ?? []) as SubjectRow[];
  const adjustments = (adjRes.data ?? []) as AdjustmentRow[];
  const routines = (rotRes.data ?? []) as RoutineRow[];

  const cls = new Map(classes.map((c) => [c.id, c]));
  const sec = new Map(sections.map((s) => [s.id, s]));
  const tch = new Map(teachers.map((t) => [t.id, t]));
  const sub = new Map(subjects.map((s) => [s.id, s]));

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
      const label =
        classRow && section
          ? `${classRow.name}-${section.name}`
          : section?.name ?? "—";

      const baseRow = base.get(
        `${a.section_id}:${a.period_number}:${a.is_tag ? 1 : 0}`
      );
      const subjectName =
        (a.new_subject_id && sub.get(a.new_subject_id)?.name) ||
        (a.original_subject_id && sub.get(a.original_subject_id)?.name) ||
        (baseRow?.subject_id && sub.get(baseRow.subject_id)?.name) ||
        "—";

      const newTeacherRow = a.new_teacher_id ? tch.get(a.new_teacher_id) : undefined;
      const newTeacher =
        newTeacherRow?.short_name || newTeacherRow?.full_name || "—";

      return {
        originalTeacherId: a.original_teacher_id,
        label,
        period: a.period_number ?? 0,
        subjectName: a.is_tag ? `${subjectName} (Tag)` : subjectName,
        newTeacher,
        isTag: a.is_tag,
        sortLabel: `${classRow?.name ?? ""}${section?.name ?? ""}`,
      };
    });

  const groups = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const key = r.originalTeacherId ?? "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const groupList: TeacherGroup[] = Array.from(groups.entries()).map(
    ([id, groupRows]) => {
      const t = id !== "__none__" ? tch.get(id) : undefined;
      return {
        name: t?.full_name || "—",
        code: t?.teacher_code ?? "",
        rows: groupRows.sort(
          (a, b) =>
            a.sortLabel.localeCompare(b.sortLabel) ||
            a.period - b.period
        ),
      };
    }
  );
  groupList.sort((a, b) => a.name.localeCompare(b.name));

  const total = rows.length;
  return { groupList, total, dayIndex, label: DAY_LABEL_LIST[dayIndex] };
}

export async function GET(req: NextRequest) {
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

  const { groupList, total, label } = data;

  // Paginate: max 8 unavailable-teacher blocks per page.
  const perPage = 8;
  const pages: TeacherGroup[][] = [];
  for (let i = 0; i < groupList.length; i += perPage) {
    pages.push(groupList.slice(i, i + perPage));
  }
  if (pages.length === 0) pages.push([]);

  const TableRow = ({ r }: { r: ReportRow }) => (
    <View style={styles.row}>
      <View style={[styles.bodyCell, styles.clsCol]}>
        <Text>{r.label}</Text>
      </View>
      <View style={[styles.bodyCell, styles.perCol]}>
        <Text>{r.period}</Text>
      </View>
      <View style={[styles.bodyCell, styles.subCol]}>
        <Text>{r.subjectName}</Text>
      </View>
      <View style={[styles.bodyCell, styles.teaCol]}>
        <Text>{r.newTeacher}</Text>
      </View>
      <View style={[styles.bodyCell, styles.sigCol]}>
        <Text> </Text>
      </View>
    </View>
  );

  const PDFDoc = (
    <Document>
      {pages.map((pageGroups, pi) => (
        <Page key={pi} size="A4" orientation="portrait" style={styles.page}>
          <Text style={styles.header}>{SCHOOL_NAME_DEFAULT}</Text>
          <Text style={styles.title}>Daily Adjustment Report — Adjust Class</Text>
          <Text style={styles.subheader}>
            Date: {date} ({label}) · {total} substitution(s), {groupList.length}{" "}
            unavailable teacher(s)
          </Text>

          {groupList.length === 0 ? (
            <Text style={styles.noRows}>
              No adjustments recorded for this date.
            </Text>
          ) : (
            pageGroups.map((g) => (
              <View key={`${g.name}-${g.code}`} style={styles.teacherBlock}>
                <Text style={styles.teacherName}>
                  Unavailable Teacher: {g.name}
                  {g.code ? `  (${g.code})` : ""}
                </Text>
                <View style={styles.table}>
                  <View style={styles.row}>
                    <View style={[styles.headCell, styles.clsCol]}>
                      <Text>Class &amp; Section</Text>
                    </View>
                    <View style={[styles.headCell, styles.perCol]}>
                      <Text>Period</Text>
                    </View>
                    <View style={[styles.headCell, styles.subCol]}>
                      <Text>Subject</Text>
                    </View>
                    <View style={[styles.headCell, styles.teaCol]}>
                      <Text>New Assigned Teacher</Text>
                    </View>
                    <View style={[styles.headCell, styles.sigCol]}>
                      <Text>Signature</Text>
                    </View>
                  </View>
                  {g.rows.map((r, ri) => (
                    <TableRow key={ri} r={r} />
                  ))}
                </View>
              </View>
            ))
          )}

          <Text style={styles.footer}>
            Cantonment Public School &amp; College, Rangpur
          </Text>
        </Page>
      ))}
    </Document>
  );

  const { pdf } = await import("@react-pdf/renderer");
  const buffer = (await pdf(PDFDoc).toBuffer()) as unknown as BodyInit;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="adjust-report-${date}.pdf"`,
    },
  });
}