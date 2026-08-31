"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

// Auth-wrapped admin client for all writes
async function authed() {
  const session = await requireAdmin();
  return { session, admin: createAdminClient() };
}

// ---------------- Classes ----------------

export async function createClass(name: string, sortOrder: number) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Class name is required." };
  const { error } = await admin
    .from("classes")
    .insert({ name: trimmed, sort_order: sortOrder });
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function updateClass(id: string, name: string, sortOrder: number) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Class name is required." };
  const { error } = await admin
    .from("classes")
    .update({ name: trimmed, sort_order: sortOrder })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function deleteClass(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("classes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

// ---------------- Sections ----------------

export async function createSection(
  classId: string,
  name: string,
  roomId: string | null,
  fixedRoom: boolean
) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!classId || !trimmed) return { error: "Class and section name are required." };
  const { error } = await admin
    .from("sections")
    .insert({ class_id: classId, name: trimmed, room_id: roomId, fixed_room: fixedRoom });
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function updateSection(
  id: string,
  classId: string,
  name: string,
  roomId: string | null,
  fixedRoom: boolean
) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!classId || !trimmed) return { error: "Class and section name are required." };
  const { error } = await admin
    .from("sections")
    .update({ class_id: classId, name: trimmed, room_id: roomId, fixed_room: fixedRoom })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function deleteSection(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("sections").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

// ---------------- Rooms ----------------

export async function createRoom(name: string) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Room name is required." };
  const { error } = await admin.from("rooms").insert({ name: trimmed });
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function updateRoom(id: string, name: string) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Room name is required." };
  const { error } = await admin.from("rooms").update({ name: trimmed }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function deleteRoom(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("rooms").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

// ---------------- Subjects ----------------

export async function createSubject(name: string, shortName: string) {
  const { admin } = await authed();
  if (!name.trim() || !shortName.trim())
    return { error: "Subject name and short name are required." };
  const { error } = await admin
    .from("subjects")
    .insert({ name: name.trim(), short_name: shortName.trim() });
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function updateSubject(id: string, name: string, shortName: string) {
  const { admin } = await authed();
  if (!name.trim() || !shortName.trim())
    return { error: "Subject name and short name are required." };
  const { error } = await admin
    .from("subjects")
    .update({ name: name.trim(), short_name: shortName.trim() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function deleteSubject(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("subjects").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

// ---------------- Teachers ----------------

export async function createTeacher(input: {
  teacherCode: string;
  fullName: string;
  shortName: string;
  isOpenTeacher: boolean;
  primarySubjectId: string | null;
  subjectIds: string[];
}) {
  const { admin } = await authed();
  if (!input.teacherCode.trim() || !input.fullName.trim() || !input.shortName.trim())
    return { error: "Teacher code, full name and short name are required." };
  const { error } = await admin.from("teachers").insert({
    teacher_code: input.teacherCode.trim(),
    full_name: input.fullName.trim(),
    short_name: input.shortName.trim(),
    is_open_teacher: input.isOpenTeacher,
    primary_subject_id: input.primarySubjectId,
  });
  if (error) return { error: error.message };
  const { data, error: getErr } = await admin
    .from("teachers")
    .select("id")
    .eq("teacher_code", input.teacherCode.trim())
    .single();
  if (getErr) return { error: getErr.message };
  await assignSubjects(admin, (data as { id: string }).id, input.subjectIds);
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function updateTeacher(
  id: string,
  input: {
    teacherCode: string;
    fullName: string;
    shortName: string;
    isOpenTeacher: boolean;
    primarySubjectId: string | null;
    subjectIds: string[];
  }
) {
  const { admin } = await authed();
  if (!input.teacherCode.trim() || !input.fullName.trim() || !input.shortName.trim())
    return { error: "Teacher code, full name and short name are required." };
  const { error } = await admin
    .from("teachers")
    .update({
      teacher_code: input.teacherCode.trim(),
      full_name: input.fullName.trim(),
      short_name: input.shortName.trim(),
      is_open_teacher: input.isOpenTeacher,
      primary_subject_id: input.primarySubjectId,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  await assignSubjects(admin, id, input.subjectIds);
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function deleteTeacher(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("teachers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

async function assignSubjects(
  admin: ReturnType<typeof createAdminClient>,
  teacherId: string,
  subjectIds: string[]
) {
  await admin.from("teacher_subjects").delete().eq("teacher_id", teacherId);
  if (subjectIds.length > 0) {
    await admin.from("teacher_subjects").insert(
      subjectIds.map((subject_id) => ({ teacher_id: teacherId, subject_id }))
    );
  }
}

// ---------------- Admins (super only) ----------------

export async function createAdmin(username: string, password: string, role: "super" | "admin") {
  const { session, admin } = await authed();
  if (session.role !== "super") return { error: "Only the super admin can create admins." };
  if (!username.trim() || password.length < 6)
    return { error: "Username required and password must be at least 6 characters." };

  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash(password, 10);
  const { error } = await admin.from("admins").insert({
    username: username.trim(),
    password_hash: hash,
    role,
    created_by: session.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}

export async function deleteAdmin(id: string) {
  const { session, admin } = await authed();
  if (session.role !== "super") return { error: "Only the super admin can delete admins." };
  if (id === session.id) return { error: "You cannot delete your own account." };
  const { error } = await admin.from("admins").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  return { success: true };
}
