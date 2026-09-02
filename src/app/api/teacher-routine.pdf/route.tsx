import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DAY_LABEL_LIST,
  SCHOOL_NAME_DEFAULT,
  type Season,
} from "@/lib/constants";
import { buildTeacherMatrix, buildTodayOverrides } from "@/lib/routine-view";
import type {
  SectionRow,
  ClassRow,
  TeacherRow,
  RoutineRow,
  AdjustmentRow,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const styles = StyleSheet.create({
  page: { padding: 24, fontFamily: "Helvetica", fontSize: 9 },
  header: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 13,
    color: "#1e3a5f",
    marginBottom: 3,
  },
  subheader: {
    textAlign: "center",
    marginBottom: 16,
    fontSize: 10,
    color: "#334155",
  },
  table: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
  },
  row: { flexDirection: "row" },
  dayCell: {
    width: "12.5%",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 4,
    fontWeight: "bold",
    backgroundColor: "#1e3a5f",
    color: "#ffffff",
    fontSize: 8,
  },
  colHeader: {
    width: "12.5%",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 4,
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 8,
    backgroundColor: "#f1f5f9",
  },
  cell: {
    width: "12.5%",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 3,
    textAlign: "center",
    minHeight: 30,
  },
  cellDay: {
    width: "12.5%",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
    padding: 3,
    textAlign: "center",
    minHeight: 30,
    fontWeight: "bold",
  },
  sub: { fontSize: 8, color: "#1e3a5f" },
  adj: { fontSize: 6, color: "#d97706" },
  empty: { fontSize: 8, color: "#cbd5e1" },
  footer: { marginTop: 12, textAlign: "center", fontSize: 7, color: "#94a3b8" },
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teacherId = searchParams.get("teacher");
  if (!teacherId) {
    return new NextResponse("Missing teacher", { status: 400 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const [teaRes, clsRes, secRes, rotRes, adjRes, seasonRes] =
    await Promise.all([
      admin.from("teachers").select("*").eq("id", teacherId).single(),
      admin.from("classes").select("*"),
      admin.from("sections").select("*"),
      admin.from("routines").select("*"),
      admin.from("adjustments").select("*").eq("adjust_date", today),
      admin.from("settings").select("value").eq("key", "season").maybeSingle(),
    ]);

  const teacher = teaRes.data as TeacherRow | null;
  if (!teacher) {
    return new NextResponse("Teacher not found", { status: 404 });
  }

  const classes = (clsRes.data ?? []) as ClassRow[];
  const sections = (secRes.data ?? []) as SectionRow[];
  const routines = (rotRes.data ?? []) as RoutineRow[];
  const adjustments = (adjRes.data ?? []) as AdjustmentRow[];
  const season = ((seasonRes.data?.value as Season) ?? "summer") as Season;

  const todayPrimaryOverrides = buildTodayOverrides(adjustments, today, false);
  const todayTagOverrides = buildTodayOverrides(adjustments, today, true);
  const matrix = buildTeacherMatrix(
    routines,
    teacherId,
    sections,
    classes,
    todayPrimaryOverrides,
    todayTagOverrides
  );

  const seasonLabel = season === "winter" ? "Winter" : "Summer";

  const PDFDoc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.header}>{SCHOOL_NAME_DEFAULT}</Text>
        <Text style={styles.subheader}>
          Teacher Routine — {teacher.full_name} ({teacher.teacher_code}) ·{" "}
          {seasonLabel}
        </Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <View style={styles.dayCell}>
              <Text>Day</Text>
            </View>
            {[1, 2, 3, 4, 5, 6, 7].map((p) => (
              <View style={styles.colHeader} key={p}>
                <Text>P{p}</Text>
              </View>
            ))}
          </View>
          {[0, 1, 2, 3, 4].map((day) => (
            <View style={styles.row} key={day}>
              <View style={styles.cellDay}>
                <Text>{DAY_LABEL_LIST[day]}</Text>
              </View>
              {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                const cell = matrix[day]?.[p];
                const label = cell?.subject ?? "";
                const adjusted = label.includes("adj");
                const clean = label.replace(" (adj)", "").replace(" (tag adj)", "");
                return (
                  <View style={styles.cell} key={p}>
                    {label ? (
                      <>
                        <Text style={styles.sub}>{clean}</Text>
                        {adjusted && <Text style={styles.adj}>Adj</Text>}
                      </>
                    ) : (
                      <Text style={styles.empty}>—</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <Text style={styles.footer}>Cantonment Public School &amp; College, Rangpur</Text>
      </Page>
    </Document>
  );

  const { pdf } = await import("@react-pdf/renderer");
  const buffer = (await pdf(PDFDoc).toBuffer()) as unknown as BodyInit;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="teacher-routine-${teacherId}.pdf"`,
    },
  });
}