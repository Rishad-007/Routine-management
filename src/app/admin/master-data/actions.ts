"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { authed } from "@/app/admin/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { periodRangesForClassName } from "@/lib/class-period-rules";
import type { RoomRow } from "@/lib/types";

// Master-data writes are rare, so invalidate every read cache related to this
// tool on each save — safe and keeps all pages coherent after edits.
function invalidateMasterDataTags() {
  revalidateTag("classes");
  revalidateTag("sections");
  revalidateTag("teachers");
  revalidateTag("subjects");
  revalidateTag("rooms");
  revalidateTag("teacher-subjects");
  revalidateTag("class-period-rules");
  revalidateTag("settings");
}

// ---------------- Classes ----------------

export async function createClass(name: string, sortOrder: number) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Class name is required." };

  const { data: created, error } = await admin
    .from("classes")
    .insert({ name: trimmed, sort_order: sortOrder })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (!created) return { error: "Class was not created." };

  // Auto-provision class_period_rules from the school rule table so a class
  // named "Class N" immediately gets its period range instead of being
  // treated as unrestricted. Names without a known suffix get no rows.
  const ranges = periodRangesForClassName(trimmed);
  if (ranges && ranges.length > 0) {
    const { error: ruleErr } = await admin.from("class_period_rules").insert(
      ranges.map((r) => ({
        class_id: created.id as string,
        day: r.day,
        min_period: r.minPeriod,
        max_period: r.maxPeriod,
      })),
    );
    if (ruleErr) return { error: ruleErr.message };
  }

  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
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
  invalidateMasterDataTags();
  return { success: true };
}

export async function deleteClass(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("classes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}

// ---------------- Sections ----------------

/**
 * A section's room: either one that already exists, or a name to create on the
 * spot. Creating and assigning in one action avoids leaving a stray room behind
 * when the section insert fails, and saves a round trip before the new room is
 * selectable.
 */
export type RoomChoice =
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string };

type AdminClient = Awaited<ReturnType<typeof authed>>["admin"];

async function resolveRoom(
  admin: AdminClient,
  room: RoomChoice,
): Promise<{ roomId: string } | { error: string }> {
  if (room.kind === "existing") {
    return room.id
      ? { roomId: room.id }
      : { error: "A fixed room is required for every section." };
  }

  const trimmed = room.name.trim();
  if (!trimmed) return { error: "A fixed room is required for every section." };

  // rooms.name is UNIQUE, so upsert makes this find-or-create: typing an
  // existing name reuses that room instead of failing on the constraint.
  const { data, error } = await admin
    .from("rooms")
    .upsert({ name: trimmed }, { onConflict: "name" })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: `Could not create room "${trimmed}".` };
  return { roomId: data.id as string };
}

export async function createSection(
  classId: string,
  name: string,
  room: RoomChoice,
  fixedRoom: boolean
) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!classId || !trimmed) return { error: "Class and section name are required." };

  const resolved = await resolveRoom(admin, room);
  if ("error" in resolved) return resolved;

  const { error } = await admin
    .from("sections")
    .insert({ class_id: classId, name: trimmed, room_id: resolved.roomId, fixed_room: fixedRoom });
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}

export async function updateSection(
  id: string,
  classId: string,
  name: string,
  room: RoomChoice,
  fixedRoom: boolean
) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!classId || !trimmed) return { error: "Class and section name are required." };

  const resolved = await resolveRoom(admin, room);
  if ("error" in resolved) return resolved;

  const { error } = await admin
    .from("sections")
    .update({ class_id: classId, name: trimmed, room_id: resolved.roomId, fixed_room: fixedRoom })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}

export async function deleteSection(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("sections").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}

// ---------------- Rooms ----------------

export async function createRoom(name: string) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Room name is required." };
  // upsert, not insert: rooms.name is UNIQUE, so this is find-or-create and is
  // idempotent under a double-click. Returns the row so callers can assign it.
  const { data, error } = await admin
    .from("rooms")
    .upsert({ name: trimmed }, { onConflict: "name" })
    .select("id, name")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true, room: data as RoomRow };
}

export async function updateRoom(id: string, name: string) {
  const { admin } = await authed();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Room name is required." };
  const { error } = await admin.from("rooms").update({ name: trimmed }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}

export async function deleteRoom(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("rooms").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
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
  invalidateMasterDataTags();
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
  invalidateMasterDataTags();
  return { success: true };
}

export async function deleteSubject(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("subjects").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}

// ---------------- Teachers ----------------

/** Derive initials from a full name, e.g. "Md. Abdul Karim" -> "MAK". */
function initialsFromName(fullName: string): string {
  return (
    fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || fullName.trim()
  );
}

export async function createTeacher(input: {
  teacherCode: string;
  fullName: string;
  isOpenTeacher: boolean;
  primarySubjectId: string | null;
  subjectIds: string[];
  designation: string;
  classTeacherSectionId: string | null;
}) {
  const { admin } = await authed();
  if (!input.teacherCode.trim() || !input.fullName.trim())
    return { error: "Teacher code and full name are required." };
  const { error } = await admin.from("teachers").insert({
    teacher_code: input.teacherCode.trim(),
    full_name: input.fullName.trim(),
    short_name: initialsFromName(input.fullName),
    is_open_teacher: input.isOpenTeacher,
    primary_subject_id: input.primarySubjectId,
    designation: input.designation.trim(),
    class_teacher_section_id: input.classTeacherSectionId,
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
  invalidateMasterDataTags();
  return { success: true };
}

export async function updateTeacher(
  id: string,
  input: {
    teacherCode: string;
    fullName: string;
    isOpenTeacher: boolean;
    primarySubjectId: string | null;
    subjectIds: string[];
    designation: string;
    classTeacherSectionId: string | null;
  }
) {
  const { admin } = await authed();
  if (!input.teacherCode.trim() || !input.fullName.trim())
    return { error: "Teacher code and full name are required." };
  const { error } = await admin
    .from("teachers")
    .update({
      teacher_code: input.teacherCode.trim(),
      full_name: input.fullName.trim(),
      short_name: initialsFromName(input.fullName),
      is_open_teacher: input.isOpenTeacher,
      primary_subject_id: input.primarySubjectId,
      designation: input.designation.trim(),
      class_teacher_section_id: input.classTeacherSectionId,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  await assignSubjects(admin, id, input.subjectIds);
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}

export async function deleteTeacher(id: string) {
  const { admin } = await authed();
  const { error } = await admin.from("teachers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
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
  invalidateMasterDataTags();
  return { success: true };
}

export async function deleteAdmin(id: string) {
  const { session, admin } = await authed();
  if (session.role !== "super") return { error: "Only the super admin can delete admins." };
  if (id === session.id) return { error: "You cannot delete your own account." };
  const { error } = await admin.from("admins").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/master-data");
  invalidateMasterDataTags();
  return { success: true };
}
