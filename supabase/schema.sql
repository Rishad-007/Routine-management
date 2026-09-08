-- =============================================
-- School Routine Management App — Schema
-- Cantonment Public School & College, Rangpur
-- Run this in Supabase SQL Editor
--
-- FULL DROP-ALL RESET: re-running this destroys
-- all existing data and rebuilds the schema.
-- =============================================

-- ---------- DROP EXISTING (FK-safe order) ----------
drop view if exists teacher_adjustment_candidates cascade;
drop view if exists teacher_daily_load cascade;
drop view if exists teacher_weekly_load cascade;
do $$
begin
  if exists (select 1 from pg_class where relname = 'routines' and relkind = 'v') then
    execute 'drop view routines cascade';
  elsif exists (select 1 from pg_class where relname = 'routines') then
    execute 'drop table routines cascade';
  end if;
  if exists (select 1 from pg_class where relname = 'adjustments' and relkind = 'v') then
    execute 'drop view adjustments cascade';
  elsif exists (select 1 from pg_class where relname = 'adjustments') then
    execute 'drop table adjustments cascade';
  end if;
end $$;
drop function if exists validate_routine_assignment();
drop function if exists validate_adjustment_assignment();
drop trigger if exists trg_sync_section_room on sections;
drop function if exists sync_section_room();
drop table if exists settings cascade;
drop table if exists adjustment_assignments cascade;
drop table if exists adjustment_batches cascade;
drop table if exists routine_assignments cascade;
drop table if exists routine_slots cascade;
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
-- Each section has a mandatory fixed room. Routines auto-fill this room
-- (see trg_sync_section_room) but individual cells may override it.
create table sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  room_id uuid not null references rooms(id) on delete restrict,
  fixed_room boolean not null default true
);

-- A room belongs to at most one class-section. This prevents accidental
-- collisions while keeping the existing section.room_id frontend contract.
create unique index uk_sections_room on sections(room_id);

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

-- ---------- ROUTINE SLOTS ----------
-- One row represents one class-section at one weekly day/period.
create table routine_slots (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  day int not null check (day between 0 and 4),  -- 0=Sun .. 4=Thu
  period_number int not null check (period_number between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section_id, day, period_number)
);

-- A slot has one primary assignment and optionally one tag assignment.
create table routine_assignments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references routine_slots(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('primary', 'tag')),
  teacher_id uuid references teachers(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(slot_id, assignment_role),
  check (teacher_id is not null or subject_id is not null or room_id is not null)
);

-- One adjustment batch is the auditable save operation for one section/day.
create table adjustment_batches (
  id uuid primary key default gen_random_uuid(),
  adjust_date date not null,
  section_id uuid not null references sections(id) on delete cascade,
  reason text,
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(adjust_date, section_id)
);

-- Each changed primary/tag assignment is retained as an immutable snapshot.
create table adjustment_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references adjustment_batches(id) on delete cascade,
  period_number int not null check (period_number between 1 and 7),
  assignment_role text not null check (assignment_role in ('primary', 'tag')),
  original_teacher_id uuid references teachers(id) on delete set null,
  new_teacher_id uuid references teachers(id) on delete set null,
  original_subject_id uuid references subjects(id) on delete set null,
  new_subject_id uuid references subjects(id) on delete set null,
  original_room_id uuid references rooms(id) on delete set null,
  new_room_id uuid references rooms(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique(batch_id, period_number, assignment_role),
  check (new_teacher_id is not null or new_subject_id is not null or new_room_id is not null)
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
create index idx_routine_slots_section on routine_slots(section_id);
create index idx_routine_slots_day_period on routine_slots(day, period_number);
create index idx_routine_assignments_teacher on routine_assignments(teacher_id);
create index idx_adjustment_batches_date on adjustment_batches(adjust_date);
create index idx_adjustment_assignments_teacher on adjustment_assignments(new_teacher_id);
create index idx_teacher_subjects_subject on teacher_subjects(subject_id);

-- =============================================
-- Compatibility read views. Existing public pages, PDFs and types can keep
-- selecting routines/adjustments while writes use normalized tables.
-- =============================================
create view routines as
select ra.id, rs.section_id, rs.day, rs.period_number,
       ra.teacher_id, ra.subject_id, ra.room_id,
       (ra.assignment_role = 'tag') as is_tag,
       false as is_adjusted, null::uuid as original_teacher_id,
       ra.created_at, ra.updated_at
  from routine_assignments ra
  join routine_slots rs on rs.id = ra.slot_id;

create view adjustments as
select aa.id, ab.adjust_date, ab.section_id, aa.period_number,
       (aa.assignment_role = 'tag') as is_tag,
       aa.original_teacher_id, aa.new_teacher_id,
       aa.original_subject_id, aa.new_subject_id,
       aa.original_room_id, aa.new_room_id,
      aa.reason, ab.created_by, aa.created_at
  from adjustment_assignments aa
  join adjustment_batches ab on ab.id = aa.batch_id;

-- =============================================
-- Adjustment history — permanently retained
-- =============================================
-- NOTE: adjustment history is intentionally KEPT forever.
-- Adjustments are date-scoped: only the selected day's changes are shown
-- in views/PDFs, and past days' records remain browsable & downloadable.
-- (No purge trigger — data persists in `adjustments` permanently.)


-- =============================================
-- Routine assignment validator: a teacher can only occupy one weekly
-- day/period, including tag assignments.
-- =============================================
create function validate_routine_assignment() returns trigger as $$
declare
  conflict record;
begin
  if new.teacher_id is null then
    return new;
  end if;

  select ra.id into conflict
    from routine_assignments ra
    join routine_slots rs on rs.id = ra.slot_id
   where ra.teacher_id = new.teacher_id
     and rs.day = (select day from routine_slots where id = new.slot_id)
     and rs.period_number = (select period_number from routine_slots where id = new.slot_id)
     and ra.id <> new.id
   limit 1;

  if found then
    raise exception
      'Teacher % is already assigned at this weekly day and period.', new.teacher_id;
  end if;

  return new;
end $$ language plpgsql;

create trigger trg_validate_routine_assignment
before insert or update on routine_assignments
for each row execute function validate_routine_assignment();

-- =============================================
-- Section fixed-room sync: when a section's room is edited and the
-- section is "fixed", propagate the new room to that section's routine
-- rows — but only for cells that still use the section's previous room
-- (so per-cell overrides like labs / computer rooms are preserved).
-- =============================================
create function sync_section_room() returns trigger as $$
begin
  if new.fixed_room and new.room_id is distinct from old.room_id then
     update routine_assignments ra
        set room_id = new.room_id
       from routine_slots rs
      where ra.slot_id = rs.id
        and rs.section_id = new.id
        and ra.room_id is not distinct from old.room_id;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_sync_section_room on sections;
create trigger trg_sync_section_room
after update on sections
for each row execute function sync_section_room();

-- =============================================
-- Adjustment validator: substitutes must be free in the base routine and
-- cannot be used twice in the same date/period.
-- =============================================
create function validate_adjustment_assignment() returns trigger as $$
declare
  slot_day int;
  conflict record;
  adjustment_date date;
  adjustment_section uuid;
begin
  if new.new_teacher_id is null then
    return new;
  end if;

  select adjust_date, section_id into adjustment_date, adjustment_section
    from adjustment_batches where id = new.batch_id;
  slot_day := extract(dow from adjustment_date);
  if slot_day = 5 or slot_day = 6 then          -- Fri / Sat → no school
    raise exception 'Cannot adjust on a non-school day.';
  end if;

  select ra.id into conflict
    from routine_assignments ra
    join routine_slots rs on rs.id = ra.slot_id
   where ra.teacher_id = new.new_teacher_id
     and rs.day = slot_day
     and rs.period_number = new.period_number
     and rs.section_id <> adjustment_section
   limit 1;

  if found then
    raise exception
      'Substitute teacher % is already teaching another class at this day and period.',
      new.new_teacher_id, new.period_number;
  end if;

  select aa.id into conflict
    from adjustment_assignments aa
    join adjustment_batches ab on ab.id = aa.batch_id
   where ab.adjust_date = adjustment_date
     and aa.new_teacher_id = new.new_teacher_id
     and aa.period_number = new.period_number
     and aa.id <> new.id
   limit 1;

  if found then
    raise exception
      'Substitute teacher % is already assigned to another class on this date and period.',
      new.new_teacher_id, new.period_number;
  end if;

  return new;
end $$ language plpgsql;

create trigger trg_validate_adjustment_assignment
before insert or update on adjustment_assignments
for each row execute function validate_adjustment_assignment();

-- Normal weekly load, daily load, and the longest continuous run. A run is
-- calculated separately on either side of the period-4 tiffin break.
create view teacher_weekly_load as
select ra.teacher_id, count(distinct (rs.day, rs.period_number))::int as class_count
  from routine_assignments ra join routine_slots rs on rs.id = ra.slot_id
 where ra.teacher_id is not null
 group by ra.teacher_id;

create view teacher_daily_load as
with assigned as (
  select ra.teacher_id, rs.day, rs.period_number
    from routine_assignments ra join routine_slots rs on rs.id = ra.slot_id
   where ra.teacher_id is not null
   group by ra.teacher_id, rs.day, rs.period_number
), groups as (
  select *, period_number - row_number() over (partition by teacher_id, day order by period_number) as grp
    from assigned where period_number <= 4
  union all
  select *, period_number - row_number() over (partition by teacher_id, day order by period_number) as grp
    from assigned where period_number >= 5
), stretches as (
  select teacher_id, day, count(*)::int as continuous_count
    from groups group by teacher_id, day, grp
)
select a.teacher_id, a.day, count(*)::int as class_count,
       (select max(s.continuous_count) from stretches s where s.teacher_id = a.teacher_id and s.day = a.day)::int as continuous_count
  from assigned a group by a.teacher_id, a.day;

-- Candidate data consumed by an adjustment UI. The function excludes teachers
-- busy in the selected base slot and returns normal weekly/daily counts plus
-- the current-period count and pre-assignment continuous run.
create or replace function get_teacher_adjustment_candidates(
  p_adjust_date date, p_period int, p_section_id uuid
) returns table (
  teacher_id uuid, teacher_code text, teacher_name text,
  weekly_class_count int, adjusted_weekly_class_count int,
  daily_class_count int, adjusted_daily_class_count int,
  current_period_class_count int,
  continuous_count int, is_available boolean
) as $$
declare p_day int := extract(dow from p_adjust_date)::int;
begin
  return query
  select t.id, t.teacher_code, t.full_name,
    coalesce(w.class_count, 0),
    coalesce(w.class_count, 0)
      + (select count(*)::int from adjustment_assignments aa join adjustment_batches ab on ab.id = aa.batch_id
        where ab.adjust_date = p_adjust_date and aa.new_teacher_id = t.id)
      - (select count(*)::int from adjustment_assignments aa join adjustment_batches ab on ab.id = aa.batch_id
        where ab.adjust_date = p_adjust_date and aa.original_teacher_id = t.id),
    coalesce(d.class_count, 0),
    coalesce(d.class_count, 0)
      + (select count(*)::int from adjustment_assignments aa join adjustment_batches ab on ab.id = aa.batch_id
        where ab.adjust_date = p_adjust_date and aa.new_teacher_id = t.id)
      - (select count(*)::int from adjustment_assignments aa join adjustment_batches ab on ab.id = aa.batch_id
        where ab.adjust_date = p_adjust_date and aa.original_teacher_id = t.id),
    (select count(*)::int from routine_assignments ra join routine_slots rs on rs.id = ra.slot_id
      where ra.teacher_id = t.id and rs.day = p_day and rs.period_number = p_period),
    coalesce(d.continuous_count, 0),
    not exists (select 1 from routine_assignments ra join routine_slots rs on rs.id = ra.slot_id
      where ra.teacher_id = t.id and rs.day = p_day and rs.period_number = p_period
        and rs.section_id <> p_section_id)
  from teachers t
  left join teacher_weekly_load w on w.teacher_id = t.id
  left join teacher_daily_load d on d.teacher_id = t.id and d.day = p_day
  order by is_available desc, adjusted_daily_class_count, adjusted_weekly_class_count, teacher_name;
end $$ language plpgsql stable;

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
alter table routine_slots enable row level security;
alter table routine_assignments enable row level security;
alter table adjustment_batches enable row level security;
alter table adjustment_assignments enable row level security;
alter table settings enable row level security;

-- Read-only policies for anon (public client area)
create policy "Public read classes" on classes for select to anon using (true);
create policy "Public read sections" on sections for select to anon using (true);
create policy "Public read rooms" on rooms for select to anon using (true);
create policy "Public read subjects" on subjects for select to anon using (true);
create policy "Public read teachers" on teachers for select to anon using (true);
create policy "Public read teacher_subjects" on teacher_subjects for select to anon using (true);
create policy "Public read routine slots" on routine_slots for select to anon using (true);
create policy "Public read routine assignments" on routine_assignments for select to anon using (true);
create policy "Public read adjustment batches" on adjustment_batches for select to anon using (true);
create policy "Public read adjustment assignments" on adjustment_assignments for select to anon using (true);
create policy "Public read settings" on settings for select to anon using (true);

-- Admins table is fully private (no anon read)
