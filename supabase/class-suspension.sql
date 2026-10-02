-- =============================================
-- Class suspension — non-destructive migration
-- Run this once in the Supabase SQL Editor.
--
-- Adds a global on/off suspension flag to classes. A suspended class keeps its
-- weekly routine, but every live surface (free teachers, adjustments, public
-- views) ignores its slots, which frees its teachers to cover other classes.
-- =============================================

alter table classes
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspension_reason text;

-- Rebuild the adjustment validator so a teacher holding a SUSPENDED class is
-- treated as free and may substitute elsewhere. Mirrors schema.sql exactly.
create or replace function validate_adjustment_assignment() returns trigger as $$
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
    join sections sec on sec.id = rs.section_id
    join classes c on c.id = sec.class_id
   where ra.teacher_id = new.new_teacher_id
     and rs.day = slot_day
     and rs.period_number = new.period_number
     and rs.section_id <> adjustment_section
     and c.is_suspended = false
   limit 1;

  if found then
    raise exception
      'Substitute teacher % is already teaching another class at this day and period.',
      new.new_teacher_id;
  end if;

  select aa.id into conflict
    from adjustment_assignments aa
    join adjustment_batches ab on ab.id = aa.batch_id
    join sections sec on sec.id = ab.section_id
    join classes c on c.id = sec.class_id
   where ab.adjust_date = adjustment_date
     and aa.new_teacher_id = new.new_teacher_id
     and aa.period_number = new.period_number
     and aa.id <> new.id
     and c.is_suspended = false
   limit 1;

  if found then
    raise exception
      'Substitute teacher % is already assigned to another class on this date and period.',
      new.new_teacher_id;
  end if;

  return new;
end $$ language plpgsql;
