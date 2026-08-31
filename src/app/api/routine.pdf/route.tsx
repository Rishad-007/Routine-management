import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { DAY_LABEL_LIST, SCHOOL_NAME_DEFAULT } from "@/lib/constants";
import type {
  SectionRow,
  RoutineRow,
  TeacherRow,
  SubjectRow,
  RoomRow,
  ClassRow,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  header: {
    textAlign: "center",
    marginBottom: 4,
    fontWeight: "bold",
    fontSize: 13,
    color: "#1e3a5f",
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
  subject: { fontSize: 8, color: "#1e3a5f", marginBottom: 2 },
  teacher: { fontSize: 7, color: "#475569" },
  room: { fontSize: 7, color: "#94a3b8" },
  empty: { fontSize: 8, color: "#cbd5e1" },
  footer: { marginTop: 12, textAlign: "center", fontSize: 7, color: "#94a3b8" },
});

async function getSectionRoutine(sectionId: string) {
  const admin = createAdminClient();

  const [secRes, routinesRes, teachersRes, subjectsRes, roomsRes, classesRes] =
    await Promise.all([
      admin.from("sections").select("*").eq("id", sectionId).single(),
      admin.from("routines").select("*").eq("section_id", sectionId),
      admin.from("teachers").select("*"),
      admin.from("subjects").select("*"),
      admin.from("rooms").select("*"),
      admin.from("classes").select("*"),
    ]);

  const section = secRes.data as SectionRow | null;
  if (!section) throw new Error("Section not found");
  const routines = (routinesRes.data ?? []) as RoutineRow[];
  const teachers = new Map(((teachersRes.data ?? []) as TeacherRow[]).map((t) => [t.id, t]));
  const subjects = new Map(((subjectsRes.data ?? []) as SubjectRow[]).map((s) => [s.id, s]));
  const rooms = new Map(((roomsRes.data ?? []) as RoomRow[]).map((r) => [r.id, r]));
  const cls = ((classesRes.data ?? []) as ClassRow[]).find((c) => c.id === section.class_id);
  const label = cls ? `${cls.name} — Section ${section.name}` : `Section ${section.name}`;

  const matrix: Record<number, Record<number, { subject?: string; teacher?: string; room?: string }>> = {};
  for (const r of routines) {
    if (!matrix[r.day]) matrix[r.day] = {};
    matrix[r.day][r.period_number] = {
      subject: r.subject_id ? subjects.get(r.subject_id)?.name : undefined,
      teacher: r.teacher_id ? teachers.get(r.teacher_id)?.short_name : undefined,
      room: r.room_id ? rooms.get(r.room_id)?.name : undefined,
    };
  }
  return { label, matrix };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sectionId = searchParams.get("section");
  if (!sectionId) {
    return new NextResponse("Missing section", { status: 400 });
  }

  let data;
  try {
    data = await getSectionRoutine(sectionId);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const { label, matrix } = data;

  const PDFDoc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.header}>{SCHOOL_NAME_DEFAULT}</Text>
        <Text style={styles.subheader}>Weekly Class Routine — {label} (Summer)</Text>
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
                return (
                  <View style={styles.cell} key={p}>
                    {cell ? (
                      <>
                        <Text style={styles.subject}>{cell.subject ?? ""}</Text>
                        {cell.teacher && (
                          <Text style={styles.teacher}>{cell.teacher}</Text>
                        )}
                        {cell.room && <Text style={styles.room}>{cell.room}</Text>}
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
      "Content-Disposition": `inline; filename="routine-${sectionId}.pdf"`,
    },
  });
}
