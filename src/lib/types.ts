// Database row types matching supabase/schema.sql

export type Role = "super" | "admin";

export interface AdminRow {
  id: string;
  username: string;
  password_hash: string;
  role: Role;
  created_by: string | null;
  created_at: string;
}

export interface ClassRow {
  id: string;
  name: string;
  sort_order: number;
}

export interface SectionRow {
  id: string;
  class_id: string;
  name: string;
  room_id: string | null;
  fixed_room: boolean;
}

export interface RoomRow {
  id: string;
  name: string;
}

export interface SubjectRow {
  id: string;
  name: string;
  short_name: string;
}

export interface TeacherRow {
  id: string;
  teacher_code: string;
  full_name: string;
  short_name: string;
  is_open_teacher: boolean;
  primary_subject_id: string | null;
}

export interface TeacherSubjectRow {
  teacher_id: string;
  subject_id: string;
}

export const DAYS = [0, 1, 2, 3, 4] as const;
export const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
};

export const PERIOD_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface RoutineRow {
  id: string;
  section_id: string;
  day: number;
  period_number: number;
  teacher_id: string | null;
  subject_id: string | null;
  room_id: string | null;
  is_tag: boolean;
  is_adjusted: boolean;
  original_teacher_id: string | null;
}

export interface AdjustmentRow {
  id: string;
  adjust_date: string;
  section_id: string;
  period_number: number;
  is_tag: boolean;
  original_teacher_id: string | null;
  new_teacher_id: string | null;
  original_subject_id: string | null;
  new_subject_id: string | null;
  original_room_id: string | null;
  new_room_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SettingsRow {
  key: string;
  value: string;
}
