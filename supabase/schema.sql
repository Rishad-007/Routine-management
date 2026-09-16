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
drop trigger if exists trg_validate_routine_assignment on routine_assignments;
drop function if exists validate_routine_assignment();
drop trigger if exists trg_validate_adjustment_assignment on adjustment_assignments;
drop function if exists validate_adjustment_assignment();
drop trigger if exists trg_validate_routine_slot_period on routine_slots;
drop trigger if exists trg_validate_adjustment_period on adjustment_assignments;
drop trigger if exists trg_sync_section_room on sections;
drop function if exists validate_routine_slot_period();
drop function if exists validate_adjustment_period();
drop function if exists sync_section_room();
drop table if exists settings cascade;
drop table if exists adjustment_assignments cascade;
drop table if exists adjustment_batches cascade;
drop table if exists routine_assignments cascade;
drop table if exists routine_slots cascade;
drop table if exists teacher_subjects cascade;
drop table if exists teachers cascade;
drop table if exists sections cascade;
drop table if exists class_period_rules cascade;
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

-- ---------- CLASS PERIOD RULES ----------
-- Which lesson periods a class may be scheduled into, per day.
-- 0=Sun .. 3=Wed share one range; Thursday (4) can differ.
-- Seed data lives in seed.sql (kept in sync with the migration
-- supabase/class-period-rules.sql and src/lib/class-period-rules.ts).
create table class_period_rules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  day int not null check (day between 0 and 4),
  min_period int not null check (min_period between 1 and 7),
  max_period int not null check (max_period between 1 and 7),
  unique (class_id, day),
  check (min_period <= max_period)
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

-- A section has a fixed room. Multiple sections may share a room.
create index idx_sections_room on sections(room_id);

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
  primary_subject_id uuid references subjects(id) on delete set null,
  designation text not null default '',
  class_teacher_section_id uuid references sections(id) on delete set null
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
create index idx_class_period_rules_class on class_period_rules(class_id);
create index idx_routine_slots_section on routine_slots(section_id);
create index idx_routine_slots_day_period on routine_slots(day, period_number);
create index idx_routine_assignments_teacher on routine_assignments(teacher_id);
create index idx_adjustment_batches_date on adjustment_batches(adjust_date);
create index idx_adjustment_assignments_teacher on adjustment_assignments(new_teacher_id);
create index idx_teacher_subjects_subject on teacher_subjects(subject_id);
create unique index uk_teacher_class_section on teachers(class_teacher_section_id) where class_teacher_section_id is not null;

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
      new.new_teacher_id;
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
      new.new_teacher_id;
  end if;

  return new;
end $$ language plpgsql;

create trigger trg_validate_adjustment_assignment
before insert or update on adjustment_assignments
for each row execute function validate_adjustment_assignment();

-- =============================================
-- Class period-range validators (defense-in-depth).
-- A routine/adjustment row is valid only if its period_number falls inside
-- the class's configured [min_period, max_period] for that class and day.
-- Keyed off section_id, so tag rows (same section) are covered automatically.
-- A class+day with no configured rule is treated as unrestricted, but the
-- gap is logged with a raise notice rather than failing silently.
-- =============================================
create function validate_routine_slot_period() returns trigger as $$
declare
  v_class_id uuid;
  v_class_name text;
  v_rule record;
begin
  select s.class_id, c.name into v_class_id, v_class_name
    from sections s
    left join classes c on c.id = s.class_id
   where s.id = new.section_id;

  if v_class_id is null then
    return new;
  end if;

  select min_period, max_period into v_rule
    from class_period_rules pr
   where pr.class_id = v_class_id and pr.day = new.day;

  if not found then
    raise notice 'No class_period_rules for % (class id %) on day %; treating as unrestricted.',
                 v_class_name, v_class_id, new.day;
    return new;
  end if;

  if new.period_number < v_rule.min_period or new.period_number > v_rule.max_period then
    raise exception 'Period % is outside the allowed range for % on this day (only periods % to %).',
                    new.period_number, v_class_name, v_rule.min_period, v_rule.max_period;
  end if;

  return new;
end $$ language plpgsql;

create trigger trg_validate_routine_slot_period
before insert or update on routine_slots
for each row execute function validate_routine_slot_period();

create function validate_adjustment_period() returns trigger as $$
declare
  v_class_id uuid;
  v_class_name text;
  v_adjust_day int;
  v_rule record;
begin
  select s.class_id, c.name, extract(dow from ab.adjust_date)::int
    into v_class_id, v_class_name, v_adjust_day
    from adjustment_batches ab
    join sections s on s.id = ab.section_id
    left join classes c on c.id = s.class_id
   where ab.id = new.batch_id;

  if v_class_id is null then
    return new;
  end if;

  select min_period, max_period into v_rule
    from class_period_rules pr
   where pr.class_id = v_class_id and pr.day = v_adjust_day;

  if not found then
    raise notice 'No class_period_rules for % (class id %) on day %; treating as unrestricted.',
                 v_class_name, v_class_id, v_adjust_day;
    return new;
  end if;

  if new.period_number < v_rule.min_period or new.period_number > v_rule.max_period then
    raise exception 'Period % is outside the allowed range for % on this day (only periods % to %).',
                    new.period_number, v_class_name, v_rule.min_period, v_rule.max_period;
  end if;

  return new;
end $$ language plpgsql;

create trigger trg_validate_adjustment_period
before insert or update on adjustment_assignments
for each row execute function validate_adjustment_period();

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
-- JSON routine import (from the offline teacher_routines.json export)
-- Upserts all master data from the file, deletes rows absent from the
-- file, and fully rebuilds the weekly routine. JSON data wins.
-- =============================================
create or replace function import_routine_from_json(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_teacher jsonb;
  v_day_key text;
  v_day_slots jsonb;
  v_slot jsonb;
  v_code text;
  v_name text;
  v_short text;
  v_desig text;
  v_section_key text;
  v_class_lower text;
  v_class_id uuid;
  v_class_num int;
  v_class_name text;
  v_section_id uuid;
  v_room_name text;
  v_room_id uuid;
  v_tchr_id uuid;
  v_tchr_code text;
  v_subj_id uuid;
  v_subj_name text;
  v_ct jsonb;
  v_ct_section_id uuid;
  v_primary_subj uuid;
  v_entry record;
  v_imp_class record;
  v_k text;
  v_period int;
  v_day_idx int;
  v_records jsonb;
  v_r jsonb;
  v_r2 jsonb;
  v_file_teachers int;
  v_report jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload->'meta' is null or payload->'teachers' is null
     or jsonb_typeof(payload->'teachers') <> 'array' then
    raise exception 'Invalid payload: expected object with "meta" and "teachers" array.';
  end if;
  v_file_teachers := jsonb_array_length(payload->'teachers');
  if v_file_teachers = 0 then
    raise exception 'Payload teachers array is empty.';
  end if;

  drop table if exists imp_class_map;
  create temp table imp_class_map(src text primary key, n int);
  insert into imp_class_map values
    ('one',1),('two',2),('three',3),('four',4),('five',5),
    ('six',6),('seven',7),('eight',8),('nine',9),('ten',10);

  drop table if exists imp_section_rooms;
  create temp table imp_section_rooms(k text primary key, class_lower text, section text, room text);

  drop table if exists imp_tchr_subjects;
  create temp table imp_tchr_subjects(teacher_code text, subject_code text, cnt int, primary key (teacher_code, subject_code));

  for v_teacher in select value from jsonb_array_elements(payload->'teachers') loop
    v_tchr_code := v_teacher->>'employee_id';
    for v_day_key, v_day_slots in select key::text, value from jsonb_each(coalesce(v_teacher->'schedule', '{}')) loop
      for v_slot in select value from jsonb_array_elements(coalesce(v_day_slots, '[]')) loop
        v_class_lower := lower(v_slot->>'class');
        v_section_key := v_class_lower || '|' || (v_slot->>'section');
        insert into imp_section_rooms values (v_section_key, v_class_lower, v_slot->>'section', v_slot->>'room')
          on conflict (k) do nothing;
        insert into imp_tchr_subjects values (v_tchr_code, v_slot->>'subject', 1)
          on conflict (teacher_code, subject_code) do update set cnt = imp_tchr_subjects.cnt + 1;
      end loop;
    end loop;
  end loop;

  drop table if exists imp_subjects;
  create temp table imp_subjects(short_name text primary key, name text);
  insert into imp_subjects
  select value,
         case upper(value)
           when 'A1' then 'Arabic'
           when 'AC' then 'Agriculture'
           when 'ACCT' then 'Accounting'
           when 'ACCT2' then 'Accounting 2nd Paper'
           when 'AE' then 'Arabic Education'
           when 'BAN' then 'Bangla'
           when 'BAN1' then 'Bangla 1st Paper'
           when 'BAN2' then 'Bangla 2nd Paper'
           when 'BE' then 'Business Education'
           when 'BGS' then 'Bangladesh and Global Studies'
           when 'BIO' then 'Biology'
           when 'CC' then 'Civic Education'
           when 'CHEM' then 'Chemistry'
           when 'DRW' then 'Drawing'
           when 'ECO' then 'Economics'
           when 'ENG' then 'English'
           when 'ENG1' then 'English 1st Paper'
           when 'ENG2' then 'English 2nd Paper'
           when 'FB' then 'Fine Arts and Crafts'
           when 'GEO' then 'Geography'
           when 'GS' then 'General Science'
           when 'HIS' then 'History'
           when 'HM' then 'Higher Math'
           when 'HS' then 'Home Science'
           when 'ICT' then 'Information and Communication Technology'
           when 'MATH' then 'Mathematics'
           when 'PEH' then 'Physical Education and Health'
           when 'PHY' then 'Physics'
           when 'RME' then 'Religion and Moral Education'
           when 'SCI1' then 'Science 1st Paper'
           when 'SCI2' then 'Science 2nd Paper'
           when 'WLEC' then 'Work and Life Oriented Education'
           else value
         end
  from jsonb_array_elements_text(payload->'meta'->'subjects') s(value);

  drop table if exists imp_subject_ids;
  create temp table imp_subject_ids(id uuid primary key, short_name text unique);
  for v_code in select short_name from imp_subjects loop
    select id into v_subj_id from subjects where short_name = v_code;
    if not found then
      select name into v_subj_name from imp_subjects where short_name = v_code;
      insert into subjects (name, short_name) values (v_subj_name, v_code) returning id into v_subj_id;
    else
      select name into v_subj_name from imp_subjects where short_name = v_code;
      update subjects set name = v_subj_name where id = v_subj_id;
    end if;
    insert into imp_subject_ids values (v_subj_id, v_code) on conflict (short_name) do update set id = excluded.id;
  end loop;

  drop table if exists imp_room_ids;
  create temp table imp_room_ids(id uuid primary key, name text unique);
  for v_room_name in select value from jsonb_array_elements_text(payload->'meta'->'rooms') loop
    select id into v_room_id from rooms where name = v_room_name;
    if not found then
      insert into rooms (name) values (v_room_name) returning id into v_room_id;
    end if;
    insert into imp_room_ids values (v_room_id, v_room_name) on conflict (name) do update set id = excluded.id;
  end loop;

  drop table if exists imp_class_ids;
  create temp table imp_class_ids(id uuid, n int primary key);
  for v_imp_class in select m.n, lower(c.value) as src
                     from jsonb_array_elements_text(payload->'meta'->'classes') c(value)
                     join imp_class_map m on m.src = lower(c.value)
  loop
    v_class_num := v_imp_class.n;
    v_class_name := 'Class ' || v_class_num;
    select id into v_class_id from classes where name = v_class_name;
    if not found then
      insert into classes (name, sort_order) values (v_class_name, v_class_num) returning id into v_class_id;
    else
      update classes set sort_order = v_class_num where id = v_class_id;
    end if;
    insert into imp_class_ids values (v_class_id, v_class_num) on conflict (n) do update set id = excluded.id;

    insert into class_period_rules (class_id, day, min_period, max_period)
    select v_class_id, d.d, 5, 7 from (values (0),(1),(2),(3),(4)) d(d)
    where v_class_num in (1,2)
    on conflict (class_id, day) do nothing;

    insert into class_period_rules (class_id, day, min_period, max_period)
    select v_class_id, d.d, 1, case when d.d = 4 then 3 else 4 end from (values (0),(1),(2),(3),(4)) d(d)
    where v_class_num in (3,4)
    on conflict (class_id, day) do nothing;

    insert into class_period_rules (class_id, day, min_period, max_period)
    select v_class_id, d.d, 1, case when d.d = 4 then 4 else 5 end from (values (0),(1),(2),(3),(4)) d(d)
    where v_class_num = 5
    on conflict (class_id, day) do nothing;

    insert into class_period_rules (class_id, day, min_period, max_period)
    select v_class_id, d.d, 1, 6 from (values (0),(1),(2),(3),(4)) d(d)
    where v_class_num in (6,7,8)
    on conflict (class_id, day) do nothing;

    insert into class_period_rules (class_id, day, min_period, max_period)
    select v_class_id, d.d, 1, 7 from (values (0),(1),(2),(3),(4)) d(d)
    where v_class_num in (9,10)
    on conflict (class_id, day) do nothing;
  end loop;

  drop table if exists imp_section_ids;
  create temp table imp_section_ids(id uuid primary key, class_lower text, name text);
  for v_entry in select k, class_lower, section, room from imp_section_rooms loop
    select c.id into v_class_id
      from classes c
      join imp_class_map m on c.name = 'Class ' || m.n and m.src = v_entry.class_lower limit 1;
    if v_class_id is null then
      continue;
    end if;
    select id into v_room_id from rooms where name = v_entry.room;
    if v_room_id is null then
      continue;
    end if;
    select id into v_section_id from sections where class_id = v_class_id and name = v_entry.section;
    if not found then
      insert into sections (class_id, name, room_id, fixed_room)
      values (v_class_id, v_entry.section, v_room_id, true) returning id into v_section_id;
    else
      update sections set room_id = v_room_id, fixed_room = true where id = v_section_id;
    end if;
    insert into imp_section_ids values (v_section_id, v_entry.class_lower, v_entry.section)
      on conflict (id) do nothing;
  end loop;

  drop table if exists imp_teacher_ids;
  create temp table imp_teacher_ids(teacher_code text primary key, id uuid);
  for v_teacher in select value from jsonb_array_elements(payload->'teachers') loop
    v_tchr_code := v_teacher->>'employee_id';
    v_name := v_teacher->>'name';
    v_desig := coalesce(v_teacher->>'designation', '');

    select string_agg(upper(substr(w, 1, 1)), '') into v_short
      from (
        select w, o
          from regexp_split_to_table(trim(coalesce(translate(v_name, '.', ' '), '')), '\s+') with ordinality as x(w, o)
         where length(w) >= 2 and lower(w) not in ('md','mst','mrs','mr','most','miss','late','begum','begom')
         order by o
         limit 3
      ) s;
    if v_short is null or v_short = '' then
      v_short := upper(substr(v_name, 1, 3));
    end if;

    v_ct_section_id := null;
    v_ct := v_teacher->'class_teacher_of';
    if v_ct is not null and jsonb_typeof(v_ct) = 'object' then
      select s.id into v_ct_section_id
        from sections s
        join classes c on c.id = s.class_id
        join imp_class_map m on c.name = 'Class ' || m.n and m.src = lower(v_ct->>'class')
       where s.name = v_ct->>'section'
       limit 1;
    end if;

    v_primary_subj := null;
    select i.id into v_primary_subj
      from imp_tchr_subjects ts
      join imp_subject_ids i on i.short_name = ts.subject_code
     where ts.teacher_code = v_tchr_code
     order by ts.cnt desc, ts.subject_code asc
     limit 1;

    select id into v_tchr_id from teachers where teacher_code = v_tchr_code;
    if not found then
      insert into teachers (teacher_code, full_name, short_name, designation,
                            class_teacher_section_id, primary_subject_id)
      values (v_tchr_code, v_name, v_short, v_desig, v_ct_section_id, v_primary_subj)
      returning id into v_tchr_id;
    else
      update teachers
         set full_name = v_name,
             short_name = v_short,
             designation = v_desig,
             class_teacher_section_id = v_ct_section_id,
             primary_subject_id = v_primary_subj
       where id = v_tchr_id;
    end if;
    insert into imp_teacher_ids values (v_tchr_code, v_tchr_id) on conflict (teacher_code) do update set id = excluded.id;

    delete from teacher_subjects where teacher_id = v_tchr_id;
    insert into teacher_subjects (teacher_id, subject_id)
    select v_tchr_id, i.id
      from imp_tchr_subjects ts
      join imp_subject_ids i on i.short_name = ts.subject_code
     where ts.teacher_code = v_tchr_code;
  end loop;

  delete from routine_slots where true;

  delete from teachers where teacher_code not in (select teacher_code from imp_teacher_ids);
  delete from sections where id not in (select id from imp_section_ids);
  delete from classes where id not in (select id from imp_class_ids);
  delete from subjects where id not in (select id from imp_subject_ids);
  delete from rooms where id not in (select id from imp_room_ids)
     and id not in (select room_id from sections where room_id is not null);

  drop table if exists imp_slot_recs;
  create temp table imp_slot_recs(
    slot_key text primary key,
    section_id uuid,
    day int,
    period int,
    records jsonb not null default '[]'
  );

  for v_teacher in select value from jsonb_array_elements(payload->'teachers') loop
    v_tchr_code := v_teacher->>'employee_id';
    select id into v_tchr_id from imp_teacher_ids where teacher_code = v_tchr_code;
    if v_tchr_id is null then
      continue;
    end if;
    for v_day_key, v_day_slots in select key::text, value from jsonb_each(coalesce(v_teacher->'schedule', '{}')) loop
      v_day_idx := -1;
      select idx - 1 into v_day_idx
        from jsonb_array_elements_text(payload->'meta'->'school_week') with ordinality as x(d, idx)
       where x.d = v_day_key;
      if v_day_idx < 0 then continue; end if;
      for v_slot in select value from jsonb_array_elements(coalesce(v_day_slots, '[]')) loop
        v_class_lower := lower(v_slot->>'class');
        select id into v_section_id from imp_section_ids where class_lower = v_class_lower and name = v_slot->>'section';
        if v_section_id is null then
          continue;
        end if;
        v_period := (v_slot->>'period')::int;
        v_k := v_section_id::text || ':' || v_day_idx || ':' || v_period;
        select i.id into v_subj_id from imp_subject_ids i where i.short_name = v_slot->>'subject' limit 1;
        select r.id into v_room_id from imp_room_ids r where r.name = v_slot->>'room' limit 1;

        insert into imp_slot_recs (slot_key, section_id, day, period, records)
        values (
          v_k, v_section_id, v_day_idx, v_period,
          jsonb_build_array(
            jsonb_build_object(
              'teacher_id', v_tchr_id,
              'subject_id', v_subj_id,
              'room_id', v_room_id,
              'is_tag', coalesce((v_slot->>'is_tag')::boolean, false),
              'sl', (v_teacher->>'sl')::int
            )
          )
        )
        on conflict (slot_key) do update
          set records = imp_slot_recs.records || excluded.records;
      end loop;
    end loop;
  end loop;

  insert into routine_slots (section_id, day, period_number)
  select r.section_id, r.day, r.period
    from imp_slot_recs r
  on conflict (section_id, day, period_number) do nothing;

  for v_entry in select slot_key, section_id, day, period, records from imp_slot_recs order by slot_key loop
    select s.id into v_section_id from routine_slots s
      where s.section_id = v_entry.section_id and s.day = v_entry.day and s.period_number = v_entry.period limit 1;
    v_records := v_entry.records;
    v_r := v_records -> 0;
    if jsonb_array_length(v_records) = 1 then
      insert into routine_assignments (slot_id, assignment_role, teacher_id, subject_id, room_id)
      values (v_section_id, 'primary',
              (v_r->>'teacher_id')::uuid, (v_r->>'subject_id')::uuid, (v_r->>'room_id')::uuid);
    else
      if (v_r->>'sl')::int <= ((v_records -> 1 ->> 'sl')::int) then
        v_r2 := v_records -> 1;
      else
        v_r2 := v_records -> 0;
        v_r := v_records -> 1;
      end if;
      insert into routine_assignments (slot_id, assignment_role, teacher_id, subject_id, room_id)
      values (v_section_id, 'primary',
              (v_r->>'teacher_id')::uuid, (v_r->>'subject_id')::uuid, (v_r->>'room_id')::uuid);
      insert into routine_assignments (slot_id, assignment_role, teacher_id, subject_id, room_id)
      values (v_section_id, 'tag',
              (v_r2->>'teacher_id')::uuid, (v_r2->>'subject_id')::uuid, (v_r2->>'room_id')::uuid);
    end if;
  end loop;

  v_report := jsonb_build_object(
    'source_file', payload->'meta'->'source_file',
    'imported_classes', (select count(*) from imp_class_ids),
    'imported_sections', (select count(*) from imp_section_ids),
    'imported_rooms', (select count(*) from imp_room_ids),
    'imported_subjects', (select count(*) from imp_subject_ids),
    'imported_teachers', (select count(*) from imp_teacher_ids),
    'routine_slots', (select count(*) from imp_slot_recs),
    'primary_assignments', (select count(*) from routine_assignments where assignment_role = 'primary'),
    'tag_assignments', (select count(*) from routine_assignments where assignment_role = 'tag'),
    'notice', 'JSON data forcefully replaced existing routine & master data. ' ||
               'Admins and adjustment history were preserved.',
    'notes', payload->'meta'->'data_quality_notes'
  );

  drop table if exists imp_class_map;
  drop table if exists imp_section_rooms;
  drop table if exists imp_tchr_subjects;
  drop table if exists imp_subjects;
  drop table if exists imp_subject_ids;
  drop table if exists imp_room_ids;
  drop table if exists imp_class_ids;
  drop table if exists imp_section_ids;
  drop table if exists imp_teacher_ids;
  drop table if exists imp_slot_recs;

  return v_report;
end $$;

-- =============================================
-- Row Level Security
-- Public reads for master data & routines; writes via service-role
-- =============================================
alter table admins enable row level security;
alter table classes enable row level security;
alter table class_period_rules enable row level security;
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
create policy "Public read class_period_rules" on class_period_rules for select to anon using (true);
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
