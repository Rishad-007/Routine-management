-- =============================================
-- School Routine Management App — Schema
-- Cantonment Public School & College, Rangpur
-- Run this in Supabase SQL Editor
-- =============================================

-- Extensions
create extension if not exists "pgcrypto";

-- ---------- ADMINS ----------
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('super', 'admin')),
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- CLASSES ----------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

-- ---------- ROOMS ----------
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- ---------- SECTIONS ----------
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  room_id uuid references rooms(id) on delete set null,
  fixed_room boolean not null default true
);

-- ---------- SUBJECTS ----------
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null
);

-- ---------- TEACHERS ----------
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  teacher_code text unique not null,
  full_name text not null,
  short_name text not null,
  is_open_teacher boolean not null default false,
  primary_subject_id uuid references subjects(id) on delete set null
);

-- ---------- TEACHER SUBJECTS (many-to-many) ----------
create table if not exists teacher_subjects (
  teacher_id uuid not null references teachers(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);

-- ---------- ROUTINES ----------
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  day int not null check (day between 0 and 4),  -- 0=Sun .. 4=Thu
  period_number int not null check (period_number between 1 and 7),
  teacher_id uuid references teachers(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  is_adjusted boolean not null default false,
  original_teacher_id uuid references teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, day, period_number)
);

-- ---------- ADJUSTMENTS (date-scoped temporary changes) ----------
create table if not exists adjustments (
  id uuid primary key default gen_random_uuid(),
  adjust_date date not null,
  section_id uuid not null references sections(id) on delete cascade,
  period_number int not null check (period_number between 1 and 7),
  original_teacher_id uuid references teachers(id) on delete set null,
  new_teacher_id uuid references teachers(id) on delete set null,
  reason text,
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- SETTINGS ----------
create table if not exists settings (
  key text primary key,
  value text not null
);

-- Seed default settings
insert into settings (key, value) values
  ('season', 'summer'),
  ('school_name', 'Cantonment Public School & College, Rangpur')
on conflict (key) do nothing;

-- =============================================
-- Indexes
-- =============================================
create index if not exists idx_sections_class on sections(class_id);
create index if not exists idx_routines_section on routines(section_id);
create index if not exists idx_routines_teacher on routines(teacher_id);
create index if not exists idx_adjustments_date on adjustments(adjust_date);
create index if not exists idx_teacher_subjects_subject on teacher_subjects(subject_id);

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
