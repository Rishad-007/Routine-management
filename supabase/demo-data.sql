-- ============================================================
-- School Routine Management App — LARGE DEMO DATA GENERATOR
-- Cantonment Public School & College, Rangpur
--
--  RUN THIS AFTER schema.sql (in Supabase SQL Editor).
--  This DELETES all existing master data + routines and
--     replaces them with a large, self-consistent demo dataset.
--
--  What you get:
--    • 5 classes, 21 teachers, 10 subjects, 24 rooms, 15 sections
--    • 15 sections x 5 days x 7 periods = 525 primary routine cells
--    • Tag (2-teacher) rows on select cells for testing dual-teacher display
--    • Conflict scenarios (4-consecutive, 3-consecutive, 6/day, double-booked)
--    • Date-scoped adjustments including TODAY for adjust page testing
-- ============================================================

begin;

-- ---------- CLEAR ALL EXISTING DATA (FK-safe order) ----------
delete from adjustments;
delete from routines;
delete from teacher_subjects;
delete from teachers;
delete from sections;
delete from subjects;
delete from rooms;
delete from classes;

-- ---------- SUPER ADMIN (kept) ----------
-- username : admin / password : Admin@2026!
insert into admins (username, password_hash, role)
values ('admin', '$2a$10$dux5.hbQokYPtBvuZykUKuT1RXCTFwUY.86UioJ2bQiL0h78WZVhS', 'super')
on conflict (username) do nothing;

-- ---------- CLASSES ----------
insert into classes (name, sort_order) values
  ('Class 6',  1),
  ('Class 7',  2),
  ('Class 8',  3),
  ('Class 9',  4),
  ('Class 10', 5);

-- ---------- ROOMS ----------
insert into rooms (name) values
  ('Room 101'), ('Room 102'), ('Room 103'), ('Room 104'), ('Room 105'),
  ('Room 106'), ('Room 107'), ('Room 108'), ('Room 109'), ('Room 110'),
  ('Room 201'), ('Room 202'), ('Room 203'), ('Room 204'), ('Room 205'),
  ('Room 206'), ('Room 207'), ('Room 208'), ('Room 209'), ('Room 210'),
  ('Science Lab'), ('Computer Lab'), ('Library'), ('Multi-Purpose Hall');

-- ---------- SUBJECTS ----------
insert into subjects (name, short_name) values
  ('Bangla',                          'Bng'),
  ('English',                         'Eng'),
  ('Mathematics',                     'Math'),
  ('Physics',                         'Phy'),
  ('Chemistry',                       'Che'),
  ('Biology',                         'Bio'),
  ('Bangladesh & Global Studies',     'SSc'),
  ('Islam & Moral Education',         'Isl'),
  ('Computer Studies',                'Cmp'),
  ('Physical Education',              'PE');

-- ---------- TEACHERS ----------
insert into teachers (teacher_code, full_name, short_name, is_open_teacher, primary_subject_id) values
  ('T01', 'Md. Abdul Karim',        'Mr. Karim',  false, (select id from subjects where short_name='Bng')),
  ('T02', 'Fatema Begum',           'Mrs. Fatema',false, (select id from subjects where short_name='Bng')),
  ('T03', 'Rafiqul Islam',          'Mr. Rafiq',  false, (select id from subjects where short_name='Bng')),
  ('T04', 'James William',          'Mr. William',false, (select id from subjects where short_name='Eng')),
  ('T05', 'Sabina Yasmin',          'Mrs. Sabina',false, (select id from subjects where short_name='Eng')),
  ('T06', 'Christina Gomes',        'Ms. Christina',false,(select id from subjects where short_name='Eng')),
  ('T07', 'Moniruzzaman',           'Mr. Monir',  false, (select id from subjects where short_name='Math')),
  ('T08', 'Shahana Parvin',         'Mrs. Shahana',false,(select id from subjects where short_name='Math')),
  ('T09', 'Anwar Hossain',          'Mr. Anwar',  false, (select id from subjects where short_name='Math')),
  ('T10', 'Dr. Amina Rahman',       'Dr. Amina',  false, (select id from subjects where short_name='Phy')),
  ('T11', 'Kamal Uddin',            'Mr. Kamal',  false, (select id from subjects where short_name='Phy')),
  ('T12', 'Nasrin Sultana',         'Mrs. Nasrin',false, (select id from subjects where short_name='Che')),
  ('T13', 'Rezaul Karim',           'Mr. Rezaul', false, (select id from subjects where short_name='Che')),
  ('T14', 'Tahmina Akter',          'Ms. Tahmina',false, (select id from subjects where short_name='Bio')),
  ('T15', 'Mahmudul Hasan',         'Mr. Mahmud', false, (select id from subjects where short_name='Bio')),
  ('T16', 'Salma Khatun',           'Mrs. Salma', false, (select id from subjects where short_name='SSc')),
  ('T17', 'Habibur Rahman',         'Mr. Habib',  false, (select id from subjects where short_name='SSc')),
  ('T18', 'Iqbal Hossain',          'Mr. Iqbal',  false, (select id from subjects where short_name='Isl')),
  ('T19', 'Farhana Akter',          'Ms. Farhana',false, (select id from subjects where short_name='Isl')),
  ('T20', 'Sabbir Ahmed',           'Mr. Sabbir',  true, (select id from subjects where short_name='Cmp')),
  ('T21', 'Rubina Begum',           'Mrs. Rubina', true, (select id from subjects where short_name='PE'));

-- ---------- SECTIONS (3 per class = 15) ----------
with sec_list as (
  select c.id as class_id, sec.class_name, sec.name,
         row_number() over (order by sec.class_name, sec.name) - 1 as rn
  from (values
    ('Class 6',  'A'), ('Class 6',  'B'), ('Class 6',  'C'),
    ('Class 7',  'A'), ('Class 7',  'B'), ('Class 7',  'C'),
    ('Class 8',  'A'), ('Class 8',  'B'), ('Class 8',  'C'),
    ('Class 9',  'A'), ('Class 9',  'B'), ('Class 9',  'C'),
    ('Class 10', 'A'), ('Class 10', 'B'), ('Class 10', 'C')
  ) as sec(class_name, name)
  join classes c on c.name = sec.class_name
),
srooms as (
  select id, row_number() over (order by name) - 1 as rn from rooms
)
insert into sections (class_id, name, room_id, fixed_room)
select sl.class_id, sl.name, r.id, true
from sec_list sl
join srooms r on r.rn = sl.rn % 10;

-- ---------- TEACHER_SUBJECTS (many-to-many) ----------
insert into teacher_subjects (teacher_id, subject_id)
select t.id, s.id
from teachers t
join subjects s
  on s.id = t.primary_subject_id
  or (t.primary_subject_id = (select id from subjects where short_name='Bng') and s.id = (select id from subjects where short_name='SSc'))
  or (t.primary_subject_id = (select id from subjects where short_name='Eng') and s.id = (select id from subjects where short_name='SSc'))
  or (t.primary_subject_id = (select id from subjects where short_name='Math') and s.id = (select id from subjects where short_name='Phy'))
  or (t.primary_subject_id = (select id from subjects where short_name='Phy') and s.id = (select id from subjects where short_name='Che'))
  or (t.primary_subject_id = (select id from subjects where short_name='Che') and s.id = (select id from subjects where short_name='Bio'))
  or (t.primary_subject_id = (select id from subjects where short_name='Bio') and s.id = (select id from subjects where short_name='SSc'))
  or (t.primary_subject_id = (select id from subjects where short_name='SSc') and s.id = (select id from subjects where short_name='Isl'))
  or (t.primary_subject_id = (select id from subjects where short_name='Isl') and s.id = (select id from subjects where short_name='SSc'))
  or (t.primary_subject_id = (select id from subjects where short_name='Cmp') and s.id = (select id from subjects where short_name='Math'))
  or (t.primary_subject_id = (select id from subjects where short_name='PE') and s.id = (select id from subjects where short_name='Bio'));

-- =============================================================
--  ROUTINES — FULL WEEK FOR EVERY SECTION (primary only)
--  15 sections x 5 days x 7 periods = 525 primary cells
--
--  CONFLICT-FREE BY CONSTRUCTION:
--  There are 21 teachers and 15 sections. At each (day, period)
--  slot, each section is assigned a DISTINCT teacher using
--    teacher_index = (seq + slot_index) % 21
--  where seq = 0..14 (section order) and slot_index = day*7+(period-1).
--  Because 15 < 21, no teacher is ever used twice in the same slot,
--  so a teacher can never be double-booked. The subject is the
--  assigned teacher's primary subject.
-- =============================================================
insert into routines (section_id, day, period_number, teacher_id, subject_id, room_id, is_tag)
select
  sec.sid,
  d.day,
  p.period,
  tea.id,
  sub.id,
  sec.room_id,
  false
from (
  select
    row_number() over (order by c.sort_order, se.name) - 1 as seq,
    se.id as sid,
    se.room_id
  from sections se
  join classes c on c.id = se.class_id
) sec
cross join generate_series(0,4) as d(day)
cross join generate_series(1,7) as p(period)
cross join lateral (
  select (array_agg(id order by teacher_code))[( (sec.seq + (d.day * 7 + (p.period - 1))) % 21 ) + 1] as teacher_id
  from teachers
) tea
join teachers sub_t on sub_t.id = tea.teacher_id
join subjects sub on sub.id = sub_t.primary_subject_id;

-- =============================================================
--  TAG (2-TEACHER) ROUTINES
--  A tag adds a SECOND teacher to one cell (distinct day+period
--  slot per tag row). The tag teacher is chosen from the teachers
--  NOT already giving a primary class in that slot, so the tag
--  teacher is guaranteed free there. Kept to a single tag row per
--  slot to keep the data clean and conflict-free.
-- =============================================================

-- Tag: Class 6-A, Sunday period 1 (Physics practical, co-taught)
insert into routines (section_id, day, period_number, teacher_id, subject_id, room_id, is_tag)
select
  sec.sid,
  0,
  1,
  free_t.id,
  free_sub.id,
  (select id from rooms where name='Science Lab'),
  true
from (
  select se.id as sid
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 6' and se.name = 'A'
) sec
cross join lateral (
  -- teachers already teaching this slot (primaries)
  select array_agg(r.teacher_id) as busy
  from routines r
  where r.day = 0 and r.period_number = 1 and r.is_tag = false
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
  order by t.teacher_code
  limit 1
) free_t
join subjects free_sub on free_sub.id = (
  select primary_subject_id from teachers where id = free_t.id
);

-- Tag: Class 8-A, Tuesday period 3 (Chemistry practical, co-taught)
insert into routines (section_id, day, period_number, teacher_id, subject_id, room_id, is_tag)
select
  sec.sid,
  2,
  3,
  free_t.id,
  free_sub.id,
  (select id from rooms where name='Science Lab'),
  true
from (
  select se.id as sid
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 8' and se.name = 'A'
) sec
cross join lateral (
  select array_agg(r.teacher_id) as busy
  from routines r
  where r.day = 2 and r.period_number = 3 and r.is_tag = false
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
  order by t.teacher_code
  limit 1
) free_t
join subjects free_sub on free_sub.id = (
  select primary_subject_id from teachers where id = free_t.id
);

-- Tag: Class 9-A, Sunday period 5 (Computer Studies, co-taught)
insert into routines (section_id, day, period_number, teacher_id, subject_id, room_id, is_tag)
select
  sec.sid,
  0,
  5,
  free_t.id,
  free_sub.id,
  (select id from rooms where name='Computer Lab'),
  true
from (
  select se.id as sid
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 9' and se.name = 'A'
) sec
cross join lateral (
  select array_agg(r.teacher_id) as busy
  from routines r
  where r.day = 0 and r.period_number = 5 and r.is_tag = false
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
  order by t.teacher_code
  limit 1
) free_t
join subjects free_sub on free_sub.id = (
  select primary_subject_id from teachers where id = free_t.id
);

-- =============================================================
--  ADJUSTMENTS
--  Primary adjustments for testing the Adjust page.
--  Includes a TODAY adjustment so you can see it live.
-- =============================================================

-- Past adjustment (will be auto-deleted by trigger on next write)
-- Substitute picked dynamically: a teacher NOT already teaching at day 1
-- (Monday) period 3. Guaranteed conflict-free.
insert into adjustments (adjust_date, section_id, period_number, original_teacher_id, new_teacher_id, reason)
select '2026-09-01',
       sec.id,
       3,
       orig.id,
       free_t.id,
       'Teacher on sick leave'
from (
  select se.id
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 8' and se.name = 'A'
) sec
join routines orig_r on orig_r.section_id = sec.id and orig_r.day = 1 and orig_r.period_number = 3 and orig_r.is_tag = false
join teachers orig on orig.id = orig_r.teacher_id
cross join lateral (
  select array_agg(r.teacher_id) as busy
  from routines r
  where r.day = 1 and r.period_number = 3 and r.is_tag = false
    and r.section_id <> sec.id
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
    and t.id <> orig.id
  order by t.teacher_code
  limit 1
) free_t;

insert into adjustments (adjust_date, section_id, period_number, original_teacher_id, new_teacher_id, reason)
select '2026-09-01',
       sec.id,
       6,
       orig.id,
       free_t.id,
       'Training duty'
from (
  select se.id
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 9' and se.name = 'C'
) sec
join routines orig_r on orig_r.section_id = sec.id and orig_r.day = 1 and orig_r.period_number = 6 and orig_r.is_tag = false
join teachers orig on orig.id = orig_r.teacher_id
cross join lateral (
  select array_agg(r.teacher_id) as busy
  from routines r
  where r.day = 1 and r.period_number = 6 and r.is_tag = false
    and r.section_id <> sec.id
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
    and t.id <> orig.id
  order by t.teacher_code
  limit 1
) free_t;

-- TODAY adjustment — Primary: 6-A period 2 (original teacher -> a free substitute)
insert into adjustments (adjust_date, section_id, period_number, original_teacher_id, new_teacher_id, original_subject_id, new_subject_id, new_room_id, reason)
select CURRENT_DATE,
       sec.id,
       2,
       orig.id,
       free_t.id,
       orig_sub.id,
       free_sub.id,
       (select id from rooms where name='Room 101'),
       'Covering class — teacher absent'
from (
  select se.id
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 6' and se.name = 'A'
) sec
join routines orig_r on orig_r.section_id = sec.id and orig_r.day = extract(dow from CURRENT_DATE::date) and orig_r.period_number = 2 and orig_r.is_tag = false
join teachers orig on orig.id = orig_r.teacher_id
join subjects orig_sub on orig_sub.id = orig_r.subject_id
cross join lateral (
  select array_agg(r.teacher_id) as busy
  from routines r
  where r.day = extract(dow from CURRENT_DATE::date) and r.period_number = 2 and r.is_tag = false
    and r.section_id <> sec.id
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
    and t.id <> orig.id
  order by t.teacher_code
  limit 1
) free_t
join subjects free_sub on free_sub.id = (
  select primary_subject_id from teachers where id = free_t.id
)
where extract(dow from CURRENT_DATE::date) between 0 and 4;

-- TODAY adjustment — Primary: 8-A period 1 (original teacher -> a free substitute)
insert into adjustments (adjust_date, section_id, period_number, original_teacher_id, new_teacher_id, original_subject_id, new_subject_id, new_room_id, reason)
select CURRENT_DATE,
       sec.id,
       1,
       orig.id,
       free_t.id,
       orig_sub.id,
       free_sub.id,
       (select id from rooms where name='Room 102'),
       'Emergency leave cover'
from (
  select se.id
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 8' and se.name = 'A'
) sec
join routines orig_r on orig_r.section_id = sec.id and orig_r.day = extract(dow from CURRENT_DATE::date) and orig_r.period_number = 1 and orig_r.is_tag = false
join teachers orig on orig.id = orig_r.teacher_id
join subjects orig_sub on orig_sub.id = orig_r.subject_id
cross join lateral (
  select array_agg(r.teacher_id) as busy
  from routines r
  where r.day = extract(dow from CURRENT_DATE::date) and r.period_number = 1 and r.is_tag = false
    and r.section_id <> sec.id
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
    and t.id <> orig.id
  order by t.teacher_code
  limit 1
) free_t
join subjects free_sub on free_sub.id = (
  select primary_subject_id from teachers where id = free_t.id
)
where extract(dow from CURRENT_DATE::date) between 0 and 4;

-- TODAY adjustment — Tag: 6-A period 3 (tag teacher swap to a free teacher)
insert into adjustments (adjust_date, section_id, period_number, is_tag, original_teacher_id, new_teacher_id, original_subject_id, new_subject_id, new_room_id, reason)
select CURRENT_DATE,
       sec.id,
       3,
       true,
       orig.id,
       free_t.id,
       orig_sub.id,
       (select primary_subject_id from teachers where id = free_t.id),
       (select id from rooms where name='Science Lab'),
       'Tag teacher swap'
from (
  select se.id
  from sections se
  join classes c on c.id = se.class_id
  where c.name = 'Class 6' and se.name = 'A'
) sec
join routines orig_r on orig_r.section_id = sec.id and orig_r.day = extract(dow from CURRENT_DATE::date) and orig_r.period_number = 3 and orig_r.is_tag = false
join teachers orig on orig.id = orig_r.teacher_id
join subjects orig_sub on orig_sub.id = orig_r.subject_id
cross join lateral (
  select array_agg(t.id) as busy
  from (
    select r.teacher_id as id from routines r
      where r.day = extract(dow from CURRENT_DATE::date) and r.period_number = 3 and r.section_id <> sec.id and r.teacher_id is not null
    union
    select r.teacher_id from routines r
      where r.day = extract(dow from CURRENT_DATE::date) and r.period_number = 3 and r.section_id = sec.id and r.is_tag = false and r.teacher_id is not null
  ) t
) busy
cross join lateral (
  select t.id
  from teachers t
  where t.id <> all (coalesce(busy.busy, array[]::uuid[]))
    and t.id <> orig.id
  order by t.teacher_code
  limit 1
) free_t
where extract(dow from CURRENT_DATE::date) between 0 and 4;

-- =============================================================
--  SUMMARY
-- =============================================================
select 'classes' as entity, count(*) as rows from classes
union all select 'rooms', count(*) from rooms
union all select 'subjects', count(*) from subjects
union all select 'teachers', count(*) from teachers
union all select 'sections', count(*) from sections
union all select 'teacher_subjects', count(*) from teacher_subjects
union all select 'routines (total)', count(*) from routines
union all select 'routines (primary)', count(*) from routines where is_tag=false
union all select 'routines (tag)', count(*) from routines where is_tag=true
union all select 'adjustments', count(*) from adjustments;

commit;
