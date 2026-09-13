-- =============================================
-- School Routine Management App — Seed Data
-- Cantonment Public School & College, Rangpur
-- Run AFTER schema.sql in Supabase SQL Editor
-- =============================================

-- ---------- DEFAULT SUPER ADMIN ----------
-- username : admin
-- password : Admin@2026!
-- (password stored as bcrypt hash; see admin-credentials.txt for the raw backup)
insert into admins (username, password_hash, role)
values ('admin', '$2a$10$dux5.hbQokYPtBvuZykUKuT1RXCTFwUY.86UioJ2bQiL0h78WZVhS', 'super')
on conflict (username) do nothing;

-- ---------- SAMPLE CLASSES ----------
insert into classes (name, sort_order) values
  ('Class 6', 1),
  ('Class 7', 2),
  ('Class 8', 3),
  ('Class 9', 4),
  ('Class 10', 5);

-- ---------- CLASS PERIOD RULES ----------
-- Which lesson periods each class may use per day (0=Sun .. 3=Wed, 4=Thu).
-- Rule table (Sun-Wed / Thursday):
--   Class 1,2: 5-7 / 5-7 | Class 3,4: 1-4 / 1-3 | Class 5: 1-5 / 1-4
--   Class 6,7,8: 1-6 / 1-6 | Class 9,10: 1-7 / 1-7
-- Only rows for classes that actually exist are created (the join to
-- `classes` guarantees this). Kept in sync with src/lib/class-period-rules.ts
-- and supabase/class-period-rules.sql.
with rules(class_name, lo, hi, lo_thu, hi_thu) as (
  values
    ('Class 1',  5, 7, 5, 7),
    ('Class 2',  5, 7, 5, 7),
    ('Class 3',  1, 4, 1, 3),
    ('Class 4',  1, 4, 1, 3),
    ('Class 5',  1, 5, 1, 4),
    ('Class 6',  1, 6, 1, 6),
    ('Class 7',  1, 6, 1, 6),
    ('Class 8',  1, 6, 1, 6),
    ('Class 9',  1, 7, 1, 7),
    ('Class 10', 1, 7, 1, 7)
), days(d) as (
  values (0), (1), (2), (3), (4)
)
insert into class_period_rules (class_id, day, min_period, max_period)
select c.id, d.d,
       case when d.d = 4 then r.lo_thu else r.lo end,
       case when d.d = 4 then r.hi_thu else r.hi end
  from rules r
  join classes c on c.name = r.class_name
 cross join days d
on conflict (class_id, day) do nothing;

-- ---------- SAMPLE ROOMS ----------
insert into rooms (name) values
  ('Room 101'), ('Room 102'), ('Room 103'),
  ('Room 201'), ('Room 202'), ('Room 203'),
  ('Science Lab'), ('Computer Lab') on conflict (name) do nothing;

-- ---------- SAMPLE SUBJECTS ----------
insert into subjects (name, short_name) values
  ('Bangla', 'Bng'),
  ('English', 'Eng'),
  ('Mathematics', 'Math'),
  ('Science', 'Sci'),
  ('Social Science', 'SSc'),
  ('Islam & Moral Education', 'Isl'),
  ('Computer Studies', 'Cmp'),
  ('Physical Education', 'PE');

-- =============================================
-- (Teachers and sections withheld from seed to avoid
--  duplicates on re-run — add via the admin UI.)
-- =============================================
