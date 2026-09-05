import "server-only";
import { createClient } from "./supabase/server";
import { getTodayLocal } from "./periods";
import {
  type ClassRow,
  type SectionRow,
  type SubjectRow,
  type TeacherRow,
  type TeacherSubjectRow,
  type RoomRow,
  type RoutineRow,
  type AdjustmentRow,
  type SettingsRow,
} from "./types";

async function db() {
  return createClient();
}

// ---------------- Master data reads (admin client = bypass RLS on server) ----------------

export async function getClasses(): Promise<ClassRow[]> {
  const { data, error } = await (await db())
    .from("classes")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ClassRow[]) ?? [];
}

export async function getSections(): Promise<SectionRow[]> {
  const { data, error } = await (await db()).from("sections").select("*");
  if (error) throw new Error(error.message);
  return (data as SectionRow[]) ?? [];
}

export async function getRooms(): Promise<RoomRow[]> {
  const { data, error } = await (await db())
    .from("rooms")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return (data as RoomRow[]) ?? [];
}

export async function getSubjects(): Promise<SubjectRow[]> {
  const { data, error } = await (await db())
    .from("subjects")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return (data as SubjectRow[]) ?? [];
}

export async function getTeachers(): Promise<TeacherRow[]> {
  const { data, error } = await (await db())
    .from("teachers")
    .select("*")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data as TeacherRow[]) ?? [];
}

export async function getTeacherSubjects(): Promise<TeacherSubjectRow[]> {
  const { data, error } = await (await db())
    .from("teacher_subjects")
    .select("*");
  if (error) throw new Error(error.message);
  return (data as TeacherSubjectRow[]) ?? [];
}

export async function getRoutines(sectionId?: string): Promise<RoutineRow[]> {
  let q = (await db()).from("routines").select("*");
  if (sectionId) q = q.eq("section_id", sectionId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as RoutineRow[]) ?? [];
}

export async function getAdjustments(): Promise<AdjustmentRow[]> {
  const today = getTodayLocal();
  const { data, error } = await (await db())
    .from("adjustments")
    .select("*")
    .gte("adjust_date", today);
  if (error) throw new Error(error.message);
  return (data as AdjustmentRow[]) ?? [];
}

/**
 * All adjustments across every date (historical + future).
 * Used by the admin Adjust page so past days' substitutions stay
 * viewable and downloadable. Public routine views keep using
 * getAdjustments() (>= today) so the routine rolls back automatically.
 */
export async function getAllAdjustments(): Promise<AdjustmentRow[]> {
  const { data, error } = await (await db())
    .from("adjustments")
    .select("*")
    .order("adjust_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as AdjustmentRow[]) ?? [];
}

export async function getSettings(): Promise<SettingsRow[]> {
  const { data, error } = await (await db()).from("settings").select("*");
  if (error) throw new Error(error.message);
  return (data as SettingsRow[]) ?? [];
}

export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await (await db())
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as string | undefined) ?? null;
}
