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
  AdjustmentRow,
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
  credit: { textAlign: "center", fontSize: 6, color: "#b0b7c0", marginTop: 2 },
});

async function getSectionRoutine(sectionId: string) {
  const admin = createAdminClient();

  const [secRes, routinesRes, teachersRes, subjectsRes, roomsRes, classesRes, adjRes] =
    await Promise.all([
      admin.from("sections").select("*").eq("id", sectionId).single(),
      admin.from("routines").select("*").eq("section_id", sectionId),
      admin.from("teachers").select("*"),
      admin.from("subjects").select("*"),
      admin.from("rooms").select("*"),
      admin.from("classes").select("*"),
      admin.from("adjustments").select("*").eq("adjust_date", new Date().toISOString().slice(0, 10)),
    ]);

  const section = secRes.data as SectionRow | null;
  if (!section) throw new Error("Section not found");
  const routines = (routinesRes.data ?? []) as RoutineRow[];
  const teachers = new Map(((teachersRes.data ?? []) as TeacherRow[]).map((t) => [t.id, t]));
  const subjects = new Map(((subjectsRes.data ?? []) as SubjectRow[]).map((s) => [s.id, s]));
  const rooms = new Map(((roomsRes.data ?? []) as RoomRow[]).map((r) => [r.id, r]));
  const cls = ((classesRes.data ?? []) as ClassRow[]).find((c) => c.id === section.class_id);
  const label = cls ? `${cls.name} — Section ${section.name}` : `Section ${section.name}`;

  const adjustments = (adjRes.data ?? []) as AdjustmentRow[];

  const matrix: Record<number, Record<number, { subject?: string; teacher?: string; room?: string; subject2?: string; teacher2?: string; room2?: string; isTag?: boolean; isAdjusted?: boolean }>> = {};

  // Group by day+period: primary + tag
  const byDayPeriod = new Map<string, { primary: RoutineRow; tag: RoutineRow | null }>();
  for (const r of routines) {
    const key = `${r.day}:${r.period_number}`;
    if (r.is_tag) {
      const existing = byDayPeriod.get(key);
      if (existing) existing.tag = r;
    } else {
      if (!byDayPeriod.has(key)) byDayPeriod.set(key, { primary: r, tag: null });
      byDayPeriod.get(key)!.primary = r;
    }
  }

  // today's adjustments already filtered in the query
  for (const [key, { primary, tag }] of byDayPeriod) {
    const [dayStr, periodStr] = key.split(":");
    const day = Number(dayStr);
    const period = Number(periodStr);

    let subjectId = primary.subject_id;
    let teacherId = primary.teacher_id;
    let roomId = primary.room_id;
    let isAdjusted = false;

    const adj = adjustments.find(
      (a) => a.period_number === period && a.section_id === sectionId && !a.is_tag
    );
    if (adj) {
      if (adj.new_teacher_id) teacherId = adj.new_teacher_id;
      if (adj.new_subject_id) subjectId = adj.new_subject_id;
      if (adj.new_room_id) roomId = adj.new_room_id;
      isAdjusted = true;
    }

    let subject2 = tag ? (tag.subject_id ? subjects.get(tag.subject_id)?.name : undefined) : undefined;
    let teacher2 = tag ? (tag.teacher_id ? teachers.get(tag.teacher_id)?.short_name : undefined) : undefined;
    let room2 = tag ? (tag.room_id ? rooms.get(tag.room_id)?.name : undefined) : undefined;
    const isTag = !!tag;

    if (tag) {
      const tagAdj = adjustments.find(
        (a) => a.period_number === period && a.section_id === sectionId && a.is_tag
      );
      if (tagAdj) {
        if (tagAdj.new_teacher_id) teacher2 = teachers.get(tagAdj.new_teacher_id)?.short_name;
        if (tagAdj.new_subject_id) subject2 = subjects.get(tagAdj.new_subject_id)?.name;
        if (tagAdj.new_room_id) room2 = rooms.get(tagAdj.new_room_id)?.name;
      }
    }

    if (!matrix[day]) matrix[day] = {};
    matrix[day][period] = {
      subject: subjectId ? subjects.get(subjectId)?.name : undefined,
      teacher: teacherId ? teachers.get(teacherId)?.short_name : undefined,
      room: roomId ? rooms.get(roomId)?.name : undefined,
      subject2,
      teacher2,
      room2,
      isTag,
      isAdjusted,
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
                        {cell.isAdjusted && (
                          <Text style={{ fontSize: 6, color: "#d97706" }}>Adj</Text>
                        )}
                        {cell.isTag && (
                          <>
                            <Text style={{ fontSize: 6, color: "#0d9488", marginTop: 2 }}>— Tag —</Text>
                            <Text style={{ fontSize: 7, color: "#0d9488" }}>{cell.subject2 ?? ""}</Text>
                            {cell.teacher2 && (
                              <Text style={{ fontSize: 6, color: "#0d9488" }}>{cell.teacher2}</Text>
                            )}
                            {cell.room2 && (
                              <Text style={{ fontSize: 6, color: "#999" }}>{cell.room2}</Text>
                            )}
                          </>
                        )}
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
        <Text style={styles.credit}>
          Software by Rishad Nur &amp; CPSCR ICT department (School)
        </Text>
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
