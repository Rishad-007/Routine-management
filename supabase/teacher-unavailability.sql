-- =============================================
-- Teacher unavailability — non-destructive migration
-- Run this once in the Supabase SQL Editor.
--
-- Declares that a teacher is unavailable on a date. This is independent of
-- whether a substitute was ever recorded: /admin/unavailable-teachers can only
-- infer absence from adjustments.original_teacher_id, so a teacher who was away
-- but whose classes were never covered is invisible to it, and a teacher
-- declared out before the day's substitutions are entered is invisible to the
-- adjustment screen entirely.
--
-- One row per period, because `unique (absent_date, teacher_id, period_number)`
-- makes the save idempotent: re-saving P1-P3 replaces rather than accumulates,
-- and "is this teacher out at period P" collapses to a set membership test.
--
-- is_whole_day is what separates the two scopes the UI exposes:
--   true  -> the teacher is out for the whole day. Consumed by every surface
--            (/admin/adjust, /admin/assign, /admin/free-teachers, the absence
--            report and the dashboard).
--   false -> blocked at these periods ONLY. Consumed by /admin/adjust alone,
--            which is the one surface that is scoped to a calendar date.
--            Per-period records are an operational note about a single day,
--            not an absence, so they deliberately do not feed the report.
--
-- Saved as 7 rows when whole-day, so a whole-day record and a per-period
-- record are indistinguishable to isUnavailableAt() and only is_whole_day
-- tells them apart for the wider surfaces.
-- =============================================

create table if not exists teacher_unavailability (
  id uuid primary key default gen_random_uuid(),
  absent_date date not null,
  teacher_id uuid not null references teachers(id) on delete cascade,
  reason text not null check (reason in ('on_leave','exam_duty','official_work','other')),
  note text,
  period_number int not null check (period_number between 1 and 7),
  is_whole_day boolean not null default false,
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (absent_date, teacher_id, period_number)
);

create index if not exists idx_teacher_unavailability_date
  on teacher_unavailability(absent_date);
create index if not exists idx_teacher_unavailability_teacher
  on teacher_unavailability(teacher_id);

-- RLS on, but deliberately NO anon read policy: leave and absence data is
-- admin-only. Admin pages read it through the service-role client in
-- src/lib/data.ts, which bypasses RLS entirely.
alter table teacher_unavailability enable row level security;
