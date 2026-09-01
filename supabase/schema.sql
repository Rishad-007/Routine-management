-- =============================================
-- School Routine Management App — Schema
-- Cantonment Public School & College, Rangpur
-- Run this in Supabase SQL Editor
--
-- FULL DROP-ALL RESET: re-running this destroys
-- all existing data and rebuilds the schema.
-- =============================================

-- ---------- DROP EXISTING (FK-safe order) ----------
drop trigger if exists trg_purge_expired_adjustments on adjustments;
drop function if exists purge_expired_adjustments();
drop table if exists settings cascade;
drop table if exists adjustments cascade;
drop table if exists routines cascade;
drop table if exists teacher_subjects cascade;
drop table if exists teachers cascade;
drop table if exists sections cascade;
drop table if exists subjects cascade;
drop table if exists rooms cascade;
drop table if exists classes cascade;
drop table if exists admins cascade;

-- Extensions
create extension if not exists "pgcrypto";

-- ---------- ADMINS ----------
create table admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('super', 'admin')),
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- CLASSES ----------
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

-- ---------- ROOMS ----------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- ---------- SECTIONS ----------
create table sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  room_id uuid references rooms(id) on delete set null,
  fixed_room boolean not null default true
);

-- ---------- SUBJECTS ----------
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null
);

-- ---------- TEACHERS ----------
create table teachers (
  id uuid primary key default gen_random_uuid(),
  teacher_code text unique not null,
  full_name text not null,
  short_name text not null,
  is_open_teacher boolean not null default false,
  primary_subject_id uuid references subjects(id) on delete set null
);

-- ---------- TEACHER SUBJECTS (many-to-many) ----------
create table teacher_subjects (
  teacher_id uuid not null references teachers(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);

-- ---------- ROUTINES ----------
-- NOTE: no UNIQUE on (section_id, day, period_number)
-- because a tag (2-teacher) class stores two rows per cell.
create table routines (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  day int not null check (day between 0 and 4),  -- 0=Sun .. 4=Thu
  period_number int not null check (period_number between 1 and 7),
  teacher_id uuid references teachers(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  is_tag boolean not null default false,
  is_adjusted boolean not null default false,
  original_teacher_id uuid references teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- ADJUSTMENTS (date-scoped temporary changes) ----------
-- Supports both primary and tag session overrides (teacher + subject + room).
create table adjustments (
  id uuid primary key default gen_random_uuid(),
  adjust_date date not null,
  section_id uuid not null references sections(id) on delete cascade,
  period_number int not null check (period_number between 1 and 7),
  is_tag boolean not null default false,
  original_teacher_id uuid references teachers(id) on delete set null,
  new_teacher_id uuid references teachers(id) on delete set null,
  original_subject_id uuid references subjects(id) on delete set null,
  new_subject_id uuid references subjects(id) on delete set null,
  original_room_id uuid references rooms(id) on delete set null,
  new_room_id uuid references rooms(id) on delete set null,
  reason text,
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- SETTINGS ----------
create table settings (
  key text primary key,
  value text not null
);

-- Seed default settings
insert into settings (key, value) values
  ('season', 'summer'),
  ('school_name', 'Cantonment Public School & College, Rangpur');

-- =============================================
-- Indexes
-- =============================================
create index idx_sections_class on sections(class_id);
create index idx_routines_section on routines(section_id);
create index idx_routines_teacher on routines(teacher_id);
create index idx_routines_tag on routines(is_tag);
create index idx_adjustments_date on adjustments(adjust_date);
create index idx_adjustments_tag on adjustments(is_tag);
create index idx_teacher_subjects_subject on teacher_subjects(subject_id);

-- =============================================
-- Auto-delete expired adjustments trigger
-- Purges any adjustment whose adjust_date < today
-- whenever any write occurs on the adjustments table.
-- =============================================
create function purge_expired_adjustments() returns trigger as $$
begin
  delete from adjustments where adjust_date < CURRENT_DATE;
  return coalesce(new, old);
end $$ language plpgsql;

create trigger trg_purge_expired_adjustments
after insert or update or delete or truncate on adjustments
for each statement execute function purge_expired_adjustments();

-- =============================================
-- Row Level Security
-- Public reads for master data & routines; writes via service-role
-- =============================================
alter table admins enable row level security;
alter table classes enable row level security;
alter table sections enable row level security;
alter table rooms enable row level security;
alter table subjects enable row level security;
alter table teachers enable row level security;
alter table teacher_subjects enable row level security;
alter table routines enable row level security;
alter table adjustments enable row level security;
alter table settings enable row level security;

-- Read-only policies for anon (public client area)
create policy "Public read classes" on classes for select to anon using (true);
create policy "Public read sections" on sections for select to anon using (true);
create policy "Public read rooms" on rooms for select to anon using (true);
create policy "Public read subjects" on subjects for select to anon using (true);
create policy "Public read teachers" on teachers for select to anon using (true);
create policy "Public read teacher_subjects" on teacher_subjects for select to anon using (true);
create policy "Public read routines" on routines for select to anon using (true);
create policy "Public read adjustments" on adjustments for select to anon using (true);
create policy "Public read settings" on settings for select to anon using (true);

-- Admins table is fully private (no anon read)
