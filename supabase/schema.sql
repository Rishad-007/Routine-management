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
drop trigger if exists trg_validate_routine_slot on routines;
drop function if exists validate_routine_slot();
drop trigger if exists trg_validate_adjustment_slot on adjustments;
drop function if exists validate_adjustment_slot();
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
-- Hard guarantee: a teacher can NEVER be assigned
-- to the same day+period in two sections.
-- (NULL teacher = empty cell → ignored.)
-- =============================================
create unique index uk_routines_teacher_slot
  on routines(day, period_number, teacher_id)
  where teacher_id is not null;

-- =============================================
-- Auto-delete expired adjustments trigger
-- Purges any adjustment whose adjust_date < today
-- whenever any write occurs on the adjustments table.
-- =============================================
create function purge_expired_adjustments() returns trigger as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  delete from adjustments where adjust_date < CURRENT_DATE;
  return coalesce(new, old);
end $$ language plpgsql;

create trigger trg_purge_expired_adjustments
after insert or update or delete or truncate on adjustments
for each statement execute function purge_expired_adjustments();

-- =============================================
-- Routine slot validator: block a teacher from
-- being assigned to the same day+period in two
-- different sections (and also within the same
-- section — a cell can only have ONE primary row,
-- a secondary/tag teacher is stored in is_tag rows
-- which must belong to a DIFFERENT teacher).
-- =============================================
create function validate_routine_slot() returns trigger as $$
declare
  conflict record;
  primary_key text := '';
begin
  -- Only validate rows carrying a teacher.
  if new.teacher_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    primary_key := ' and r.id <> ' || quote_literal(old.id);
  end if;

  -- 1) Same teacher, same day+period, any other row.
  --    This covers both cross-section and primary-vs-secondary within a section.
  execute format(
    'select r.id, r.section_id, r.is_tag from routines r
       where r.teacher_id = %L
         and r.day = %L
         and r.period_number = %L %s
       limit 1',
    new.teacher_id, new.day, new.period_number, primary_key
  ) into conflict;

  if found then
    raise exception
      'Teacher % is already assigned to another class at this day (%L) and period (%L).',
      new.teacher_id, new.day, new.period_number;
  end if;

  -- 2) A section cell may only have ONE primary (is_tag=false) row.
  --    Tag (secondary) rows are exempt — they legitimately coexist with a
  --    primary row in the same cell.
  if not new.is_tag then
    execute format(
      'select id from routines r
         where r.section_id = %L
           and r.day = %L
           and r.period_number = %L
           and r.is_tag = false %s
         limit 1',
      new.section_id, new.day, new.period_number, primary_key
    ) into conflict;

    if found then
      raise exception
        'Section % already has a primary class at day %L, period %L.',
        new.section_id, new.day, new.period_number;
    end if;
  end if;

  return coalesce(new, old);
end $$ language plpgsql;

drop trigger if exists trg_validate_routine_slot on routines;
create trigger trg_validate_routine_slot
before insert or update on routines
for each row execute function validate_routine_slot();

-- =============================================
-- Adjustment substitute validator: a substitute
-- teacher can NOT already be teaching in the base
-- routine (or another adjustment) at the same
-- day+period on the chosen date.
-- =============================================
create function validate_adjustment_slot() returns trigger as $$
declare
  slot_day int;
  conflict record;
  old_key text := '';
begin
  if new.new_teacher_id is null then
    return new;
  end if;

  -- Achieve the school day for the adjustment date (0=Sun .. 4=Thu).
  slot_day := extract(dow from new.adjust_date::date);
  if slot_day = 5 or slot_day = 6 then          -- Fri / Sat → no school
    raise exception 'Cannot adjust on a non-school day.';
  end if;

  if tg_op = 'UPDATE' then
    old_key := ' and r.id <> ' || quote_literal(old.id);
  end if;

  -- 1) Substitute must be free in the base routine at that day+period,
  --    EXCLUDING the section currently being substituted (so replacing
  --    the current teacher is allowed).
  execute format(
    'select r.id from routines r
       where r.teacher_id = %L
         and r.day = %L
         and r.period_number = %L
         and r.section_id <> %L %s
       limit 1',
    new.new_teacher_id, slot_day, new.period_number, new.section_id, old_key
  ) into conflict;

  if found then
    raise exception
      'Substitute teacher % is already teaching another class at this day and period %L.',
      new.new_teacher_id, new.period_number;
  end if;

  -- 2) Substitute must not already be assigned as another adjustment's
  --    substitute for the same date+period.
  execute format(
    'select a.id from adjustments a
       where a.adjust_date = %L
         and a.new_teacher_id = %L
         and a.period_number = %L %s
       limit 1',
    new.adjust_date, new.new_teacher_id, new.period_number, old_key
  ) into conflict;

  if found then
    raise exception
      'Substitute teacher % is already assigned to another class on this date at period %L.',
      new.new_teacher_id, new.period_number;
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists trg_validate_adjustment_slot on adjustments;
create trigger trg_validate_adjustment_slot
before insert or update on adjustments
for each row execute function validate_adjustment_slot();

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
