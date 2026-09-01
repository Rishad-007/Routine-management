-- ============================================================
-- School Routine Management App — LARGE DEMO DATA GENERATOR
-- Cantonment Public School & College, Rangpur
--
--  RUN THIS AFTER schema.sql (in Supabase SQL Editor).
--  🔥 This DELETES all existing master data + routines and
--     replaces them with a large, self-consistent demo dataset
--     purpose-built so you can verify every feature/test case.
--
--  What you get:
--    • 5 classes, 21 teachers, 10 subjects, 24 rooms, 15 sections
--    • 15 sections x 5 days x 7 periods = 525 routine cells
--    • Deliberately planted conflict scenarios (see block
--      "CONFLICT SCENARIOS FOR TESTING"): 4-consecutive (red),
--      3-consecutive (yellow), 6/day overload (red), and a
--      cross-section double-booked teacher (red).
--    • A few date-scoped adjustments for the Adjust page.
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
-- Each section gets its own default classroom (room_id) for realism.
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
-- Each teacher teaches their primary subject + 1 related subject.
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
--  ROUTINES — FULL WEEK FOR EVERY SECTION
--  Generator: 15 sections x 5 days x 7 periods = 525 cells.
--  Subject per cell rotates across the week; teacher is chosen
--  deterministically from that subject's eligible pool, rotating
--  per section so most sections are naturally conflict-free.
-- =============================================================
insert into routines (section_id, day, period_number, teacher_id, subject_id, room_id)
select
  s.id,
  d.day,
  p.period,
  t.id,
  sub.id,
  s.room_id
from sections s
join (
  select row_number() over (order by c.sort_order, se.name) - 1 as seq, se.id as sid
  from sections se
  join classes c on c.id = se.class_id
) sec on sec.sid = s.id
cross join generate_series(0,4) as d(day)
cross join generate_series(1,7) as p(period)
cross join lateral (
  select (array['Bng','Math','Eng','Phy','Che','Bio','SSc','Isl','Cmp','PE'])
         [ (p.period + d.day) % 10 + 1 ] as subject_short
) subj
join subjects sub on sub.short_name = subj.subject_short
cross join lateral (
  select case subj.subject_short
    when 'Bng'  then (array['T01','T02','T03'])[ (sec.seq + d.day + p.period*2) % 3 + 1 ]
    when 'Eng'  then (array['T04','T05','T06'])[ (sec.seq + d.day + p.period*2) % 3 + 1 ]
    when 'Math' then (array['T07','T08','T09'])[ (sec.seq + d.day + p.period*2) % 3 + 1 ]
    when 'Phy'  then (array['T10','T11'])[ (sec.seq + d.day + p.period*2) % 2 + 1 ]
    when 'Che'  then (array['T12','T13'])[ (sec.seq + d.day + p.period*2) % 2 + 1 ]
    when 'Bio'  then (array['T14','T15'])[ (sec.seq + d.day + p.period*2) % 2 + 1 ]
    when 'SSc'  then (array['T16','T17'])[ (sec.seq + d.day + p.period*2) % 2 + 1 ]
    when 'Isl'  then (array['T18','T19'])[ (sec.seq + d.day + p.period*2) % 2 + 1 ]
    when 'Cmp'  then 'T20'
    when 'PE'   then 'T21'
  end as teacher_code
) tc
join teachers t on t.teacher_code = tc.teacher_code;

-- =============================================================
--  CONFLICT SCENARIOS FOR TESTING
--  These deliberately plant warnings so you can verify the
--  conflict engine. Each is tagged with what it should produce.
-- =============================================================

-- Scenario A: RED — 4 consecutive periods (a teacher's full day).
--   Section 8-A, Monday (day 1), periods 1-4 -> Mr. Karim (T01, Bangla).
--   Expected: 4 consecutive = RED.
update routines r set teacher_id = t.id, subject_id = s.id
from teachers t, subjects s, sections sec, classes c
where t.teacher_code='T01' and s.short_name='Bng'
  and sec.name='A' and c.name='Class 8' and sec.class_id=c.id and r.section_id=sec.id
  and r.day=1 and r.period_number in (1,2,3,4);

-- Scenario B: RED — 6 periods in one day (daily overload).
--   Section 9-B, Tuesday (day 2) -> Mr. Anwar (T09, Mathematics) in 6 periods.
--   Expected: 6/day = RED (also gives a 3-consecutive = yellow, on top).
update routines r set teacher_id = t.id, subject_id = s.id
from teachers t, subjects s, sections sec, classes c
where t.teacher_code='T09' and s.short_name='Math'
  and sec.name='B' and c.name='Class 9' and sec.class_id=c.id and r.section_id=sec.id
  and r.day=2 and r.period_number in (1,2,4,5,6,7);

-- Scenario C: RED — same teacher double-booked across two sections.
--   Teacher Ms. Christina (T06, English) on Wednesday (day 2), period 3,
--   in BOTH 7-A and 7-B. Expected: busy = RED, plus an overload warning.
update routines r set teacher_id = t.id, subject_id = s.id
from teachers t, subjects s, sections sec, classes c
where t.teacher_code='T06' and s.short_name='Eng'
  and c.name in ('Class 7') and sec.class_id=c.id and r.section_id=sec.id
  and r.day=2 and r.period_number=3;

-- Scenario D: YELLOW — exactly 3 consecutive periods.
--   Section 6-A, Sunday (day 0), periods 1-3 -> Mr. William (T04, English).
--   Expected: 3 consecutive = YELLOW.
update routines r set teacher_id = t.id, subject_id = s.id
from teachers t, subjects s, sections sec, classes c
where t.teacher_code='T04' and s.short_name='Eng'
  and sec.name='A' and c.name='Class 6' and sec.class_id=c.id and r.section_id=sec.id
  and r.day=0 and r.period_number in (1,2,3);

-- Scenario E: YELLOW — 5 periods in one day (daily overload threshold).
--   Section 10-C, Thursday (day 4) -> Mrs. Shahana (T08, Mathematics) in 5.
--   Expected: 5/day = YELLOW.
update routines r set teacher_id = t.id, subject_id = s.id
from teachers t, subjects s, sections sec, classes c
where t.teacher_code='T08' and s.short_name='Math'
  and sec.name='C' and c.name='Class 10' and sec.class_id=c.id and r.section_id=sec.id
  and r.day=4 and r.period_number in (1,2,4,5,6);

-- =============================================================
--  ADJUSTMENTS (date-scoped substitutions for the Adjust page)
--  Applies ONLY on the given date; base routine is untouched.
-- =============================================================
-- Substitute on 2026-09-01 (Tue): 8-A period 3 (Karim -> Fatema, "sick"),
-- and 8-B period 5 (no substitution tracked here).
insert into adjustments (adjust_date, section_id, period_number, original_teacher_id, new_teacher_id, reason)
select '2026-09-01',
       sec.id,
       3,
       (select id from teachers where teacher_code='T01'),
       (select id from teachers where teacher_code='T02'),
       'Teacher on sick leave'
from sections sec join classes c on c.id = sec.class_id
where c.name = 'Class 8' and sec.name = 'A';

insert into adjustments (adjust_date, section_id, period_number, original_teacher_id, new_teacher_id, reason)
select '2026-09-01',
       sec.id,
       6,
       (select id from teachers where teacher_code='T16'),
       (select id from teachers where teacher_code='T17'),
       'Training duty'
from sections sec join classes c on c.id = sec.class_id
where c.name = 'Class 9' and sec.name = 'C';

-- =============================================================
--  SUMMARY (so you can eyeball row counts)
-- =============================================================
select 'classes' as entity, count(*) as rows from classes
union all select 'rooms', count(*) from rooms
union all select 'subjects', count(*) from subjects
union all select 'teachers', count(*) from teachers
union all select 'sections', count(*) from sections
union all select 'teacher_subjects', count(*) from teacher_subjects
union all select 'routines', count(*) from routines
union all select 'adjustments', count(*) from adjustments;

commit;
