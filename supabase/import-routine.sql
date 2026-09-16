-- ============================================================
-- JSON Routine Import — migration
-- Cantonment Public School & College, Rangpur
--
-- Makes the schema accept the offline `teacher_routines.json`
-- export and provides the transactional importer function.
-- Idempotent — safe to run more than once.
--
-- What it does:
--   1. Adds `teachers.designation` and `teachers.class_teacher_section_id`
--      (the "class teacher" feature).
--   2. Relaxes the one-room-per-section unique index (the real school
--      data has two sections sharing a room).
--   3. Creates `import_routine_from_json(payload)` which upserts all
--      master data from the file, deletes rows absent from the file,
--      and fully rebuilds the weekly routine. JSON data wins.
--
-- Run in the Supabase SQL Editor AFTER schema.sql + seed.sql
-- (or after migrate-normalized-schema.sql on an existing DB).
-- Then call the function from the admin "Import JSON" tab, or:
--   select import_routine_from_json('{ ... }'::jsonb);
-- ============================================================

begin;

-- ---------- 1. TEACHERS: designation + class teacher ----------
alter table teachers add column if not exists designation text not null default '';
alter table teachers add column if not exists class_teacher_section_id uuid references sections(id) on delete set null;

create unique index if not exists uk_teacher_class_section
  on teachers(class_teacher_section_id) where class_teacher_section_id is not null;

-- ---------- 2. SECTIONS: allow shared rooms ----------
drop index if exists uk_sections_room;
create index if not exists idx_sections_room on sections(room_id);

-- ---------- 3. IMPORTER ----------
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
  -- ---------- validate ----------
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload->'meta' is null or payload->'teachers' is null
     or jsonb_typeof(payload->'teachers') <> 'array' then
    raise exception 'Invalid payload: expected object with "meta" and "teachers" array.';
  end if;
  v_file_teachers := jsonb_array_length(payload->'teachers');
  if v_file_teachers = 0 then
    raise exception 'Payload teachers array is empty.';
  end if;

  -- ---------- temp tables ----------
  drop table if exists imp_class_map;
  create temp table imp_class_map(src text primary key, n int);
  insert into imp_class_map values
    ('one',1),('two',2),('three',3),('four',4),('five',5),
    ('six',6),('seven',7),('eight',8),('nine',9),('ten',10);

  drop table if exists imp_section_rooms;
  create temp table imp_section_rooms(k text primary key, class_lower text, section text, room text);

  drop table if exists imp_tchr_subjects;
  create temp table imp_tchr_subjects(teacher_code text, subject_code text, cnt int, primary key (teacher_code, subject_code));

  -- ---------- pass A: scan schedules (rooms per section, subjects per teacher) ----------
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

  -- ---------- subjects ----------
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

  -- ---------- rooms ----------
  drop table if exists imp_room_ids;
  create temp table imp_room_ids(id uuid primary key, name text unique);
  for v_room_name in select value from jsonb_array_elements_text(payload->'meta'->'rooms') loop
    select id into v_room_id from rooms where name = v_room_name;
    if not found then
      insert into rooms (name) values (v_room_name) returning id into v_room_id;
    end if;
    insert into imp_room_ids values (v_room_id, v_room_name) on conflict (name) do update set id = excluded.id;
  end loop;

  -- ---------- classes (One..Ten -> Class 1..10) ----------
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

    -- class_period_rules (Sun-Wed days 0-3 / Thursday day 4) — idempotent
    insert into class_period_rules (class_id, day, min_period, max_period)
    select v_class_id, d.d, 5, 7 from (values (0),(1),(2),(3),(4)) d(d)
    where v_class_num in (1,2)
    on conflict (class_id, day) do nothing;

    with days(d) as (values (0),(1),(2),(3),(4))
    insert into class_period_rules (class_id, day, min_period, max_period)
    select v_class_id, d.d, 1, case when d.d = 4 then 3 else 4 end from days d
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

  -- ---------- sections (fixed room = the section's single used room) ----------
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

  -- ---------- teachers ----------
  drop table if exists imp_teacher_ids;
  create temp table imp_teacher_ids(teacher_code text primary key, id uuid);
  for v_teacher in select value from jsonb_array_elements(payload->'teachers') loop
    v_tchr_code := v_teacher->>'employee_id';
    v_name := v_teacher->>'name';
    v_desig := coalesce(v_teacher->>'designation', '');

    -- short name from initials (skip honorifics)
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

    -- class teacher section
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

    -- primary subject: most-taught
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

    -- taught subjects (many-to-many)
    delete from teacher_subjects where teacher_id = v_tchr_id;
    insert into teacher_subjects (teacher_id, subject_id)
    select v_tchr_id, i.id
      from imp_tchr_subjects ts
      join imp_subject_ids i on i.short_name = ts.subject_code
     where ts.teacher_code = v_tchr_code;
  end loop;

  -- ---------- delete rows absent from the file (JSON wins) ----------
  delete from routine_slots where true;  -- cascades routine_assignments

  delete from teachers where teacher_code not in (select teacher_code from imp_teacher_ids);
  delete from sections where id not in (select id from imp_section_ids);
  delete from classes where id not in (select id from imp_class_ids);
  delete from subjects where id not in (select id from imp_subject_ids);
  delete from rooms where id not in (select id from imp_room_ids)
     and id not in (select room_id from sections where room_id is not null);

  -- ---------- collect every slot record ----------
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

  -- ---------- insert slots ----------
  insert into routine_slots (section_id, day, period_number)
  select r.section_id, r.day, r.period
    from imp_slot_recs r
  on conflict (section_id, day, period_number) do nothing;

  -- ---------- insert assignments (primary + tag for pairs) ----------
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
      -- tag pair: lower sl = primary, other = tag
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

  -- ---------- report ----------
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

commit;