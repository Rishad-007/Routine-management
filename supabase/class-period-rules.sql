-- ============================================================
-- Class Period Rules — migration
-- Cantonment Public School & College, Rangpur
--
-- Non-destructive and idempotent — safe to run more than once
-- in the Supabase SQL Editor. Run AFTER migrate-normalized-schema.sql
-- (or after a fresh schema.sql + seed.sql reset).
--
-- What it does:
--   1. Creates the `class_period_rules` table (which lesson periods a
--      class may be scheduled into, per day of week).
--   2. Seeds it from the school's rule table. Only rows for classes that
--      already exist are created (the join to `classes` guarantees this),
--      so Class 1–5 get rules automatically once they're added.
--   3. Reports + deletes pre-existing routine/adjustment rows that now
--      violate the rules (flagged for the admin; historical period-7
--      Class 6/7/8 cells cannot be re-saved under the new rule).
--   4. Adds defense-in-depth triggers on routine_slots and
--      adjustment_assignments so out-of-range periods are rejected by
--      the DB itself, no matter what writes to it.
-- ============================================================

begin;

-- ---------- 1. TABLE ----------
create table if not exists class_period_rules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  day int not null check (day between 0 and 4),
  min_period int not null check (min_period between 1 and 7),
  max_period int not null check (max_period between 1 and 7),
  unique (class_id, day),
  check (min_period <= max_period)
);

create index if not exists idx_class_period_rules_class on class_period_rules(class_id);

-- ---------- 2. SEED ----------
-- Rule table (Sun-Wed = days 0-3, Thursday = day 4):
--   Class 1,2   : 5-7 / 5-7
--   Class 3,4   : 1-4 / 1-3
--   Class 5     : 1-5 / 1-4
--   Class 6,7,8 : 1-6 / 1-6
--   Class 9,10  : 1-7 / 1-7
-- Kept in sync with src/lib/class-period-rules.ts (periodRangesForClassName).
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

-- ---------- 3. EXISTING-DATA CHECK + CLEANUP ----------
-- Report first (never delete silently). Repeat this report any time via
-- supabase/class-period-rules-violations.sql (this table is now the source).
select 'Residual routine slots outside class period rules (to be deleted):' as report;
select c.name as class_name, s.name as section_name, rs.day, rs.period_number, rs.id
  from routine_slots rs
  join sections s on s.id = rs.section_id
  join classes c on c.id = s.class_id
  join class_period_rules pr on pr.class_id = c.id and pr.day = rs.day
 where rs.period_number < pr.min_period or rs.period_number > pr.max_period
 order by c.sort_order, s.name, rs.day, rs.period_number;

select 'Residual adjustment_assignments outside class period rules:' as report;
select c.name as class_name, s.name as section_name, ab.adjust_date,
       extract(dow from ab.adjust_date)::int as day, aa.period_number, aa.id
  from adjustment_assignments aa
  join adjustment_batches ab on ab.id = aa.batch_id
  join sections s on s.id = ab.section_id
  join classes c on c.id = s.class_id
  join class_period_rules pr on pr.class_id = c.id and pr.day = extract(dow from ab.adjust_date)::int
 where aa.period_number < pr.min_period or aa.period_number > pr.max_period
 order by ab.adjust_date, c.sort_order, aa.period_number;

-- Admin-approved cleanup: pre-existing period-7 cells for Class 6/7/8 are
-- outside the rule and would block any future re-save of those sections.
-- Assignments cascade-delete with their slot.
delete from routine_slots rs
 using sections s, classes c, class_period_rules pr
 where rs.section_id = s.id
   and s.class_id = c.id
   and pr.class_id = c.id
   and pr.day = rs.day
   and (rs.period_number < pr.min_period or rs.period_number > pr.max_period);

-- ---------- 4. ROW LEVEL SECURITY ----------
alter table class_period_rules enable row level security;
drop policy if exists "Public read class_period_rules" on class_period_rules;
create policy "Public read class_period_rules" on class_period_rules for select to anon using (true);

-- ---------- 5. DEFENSE-IN-DEPTH TRIGGERS ----------
-- Routine: the period + day + section all live on routine_slots, so validate
-- there (BEFORE INSERT/UPDATE). Keyed off section_id so tag assignments to
-- the same section are covered automatically. A missing rule row = "no
-- restriction" but is logged via raise notice (not silently allowed).
create or replace function validate_routine_slot_period() returns trigger as $$
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

drop trigger if exists trg_validate_routine_slot_period on routine_slots;
create trigger trg_validate_routine_slot_period
before insert or update on routine_slots
for each row execute function validate_routine_slot_period();

-- Adjustment: the class is resolved through the batch's section, and the day
-- of week comes from the adjustment date. Same "missing rule = unrestricted,
-- but logged" behaviour.
create or replace function validate_adjustment_period() returns trigger as $$
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

drop trigger if exists trg_validate_adjustment_period on adjustment_assignments;
create trigger trg_validate_adjustment_period
before insert or update on adjustment_assignments
for each row execute function validate_adjustment_period();

commit;