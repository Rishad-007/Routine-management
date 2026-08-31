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
