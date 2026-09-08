-- Non-destructive migration for an existing Routine Management database.
-- Run this once in the Supabase SQL Editor before saving from the admin UI.
-- It preserves legacy routines and adjustments while creating the normalized write model.

begin;

create extension if not exists "pgcrypto";

-- Keep the existing database aligned with schema.sql: one room belongs to
-- at most one class-section.
create unique index if not exists uk_sections_room on public.sections(room_id);

create table if not exists routine_slots (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  day int not null check (day between 0 and 4),
  period_number int not null check (period_number between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section_id, day, period_number)
);

create table if not exists routine_assignments (
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

create table if not exists adjustment_batches (
  id uuid primary key default gen_random_uuid(),
  adjust_date date not null,
  section_id uuid not null references sections(id) on delete cascade,
  reason text,
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(adjust_date, section_id)
);

create table if not exists adjustment_assignments (
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

-- Copy legacy weekly routine rows once. The NOT EXISTS guards make this safe to rerun.
insert into routine_slots (section_id, day, period_number)
select distinct r.section_id, r.day, r.period_number
  from routines r
 where not exists (
   select 1 from routine_slots s
    where s.section_id = r.section_id
      and s.day = r.day
      and s.period_number = r.period_number
 );

insert into routine_assignments (
  slot_id, assignment_role, teacher_id, subject_id, room_id
)
select s.id,
       case when r.is_tag then 'tag' else 'primary' end,
       r.teacher_id, r.subject_id, r.room_id
  from routines r
  join routine_slots s on s.section_id = r.section_id
                       and s.day = r.day
                       and s.period_number = r.period_number
 where not exists (
   select 1 from routine_assignments a
    where a.slot_id = s.id
      and a.assignment_role = case when r.is_tag then 'tag' else 'primary' end
 );

-- Copy legacy adjustment history into batches and assignment snapshots.
insert into adjustment_batches (adjust_date, section_id, reason, created_by)
select distinct on (a.adjust_date, a.section_id)
       a.adjust_date, a.section_id, a.reason, a.created_by
  from adjustments a
 order by a.adjust_date, a.section_id, a.created_at desc nulls last, a.id desc
on conflict (adjust_date, section_id) do nothing;

insert into adjustment_assignments (
  batch_id, period_number, assignment_role,
  original_teacher_id, new_teacher_id,
  original_subject_id, new_subject_id,
  original_room_id, new_room_id, reason
)
select b.id, a.period_number,
       case when a.is_tag then 'tag' else 'primary' end,
       a.original_teacher_id, a.new_teacher_id,
       a.original_subject_id, a.new_subject_id,
       a.original_room_id, a.new_room_id, a.reason
  from adjustments a
  join adjustment_batches b on b.adjust_date = a.adjust_date
                            and b.section_id = a.section_id
 where not exists (
   select 1 from adjustment_assignments aa
    where aa.batch_id = b.id
      and aa.period_number = a.period_number
      and aa.assignment_role = case when a.is_tag then 'tag' else 'primary' end
 );

-- Keep the original physical tables as backups, then expose read-compatible
-- views under the names already used by the application.
do $$
declare
  routines_kind "char";
  adjustments_kind "char";
begin
  select c.relkind into routines_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'routines';

  if routines_kind = 'v' then
    execute 'drop view public.routines cascade';
  elsif routines_kind in ('r', 'p')
        and to_regclass('public.routines_legacy_backup') is null then
    execute 'alter table public.routines rename to routines_legacy_backup';
  end if;

  select c.relkind into adjustments_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'adjustments';

  if adjustments_kind = 'v' then
    execute 'drop view public.adjustments cascade';
  elsif adjustments_kind in ('r', 'p')
        and to_regclass('public.adjustments_legacy_backup') is null then
    execute 'alter table public.adjustments rename to adjustments_legacy_backup';
  end if;
end $$;

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

alter table routine_slots enable row level security;
alter table routine_assignments enable row level security;
alter table adjustment_batches enable row level security;
alter table adjustment_assignments enable row level security;

drop policy if exists "Public read routine slots" on routine_slots;
drop policy if exists "Public read routine assignments" on routine_assignments;
drop policy if exists "Public read adjustment batches" on adjustment_batches;
drop policy if exists "Public read adjustment assignments" on adjustment_assignments;
create policy "Public read routine slots" on routine_slots for select to anon using (true);
create policy "Public read routine assignments" on routine_assignments for select to anon using (true);
create policy "Public read adjustment batches" on adjustment_batches for select to anon using (true);
create policy "Public read adjustment assignments" on adjustment_assignments for select to anon using (true);

commit;
