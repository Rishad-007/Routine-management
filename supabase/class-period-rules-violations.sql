-- ============================================================
-- Class Period Rules — residual violation report
-- Cantonment Public School & College, Rangpur
--
-- Run any time in the Supabase SQL Editor. Prints any existing
-- routine_slots / adjustment_assignments that fall outside the
-- configured class_period_rules. Nothing is modified.
-- ============================================================

select 'Routine slots outside class period rules:' as report;
select c.name as class_name, s.name as section_name, rs.day, rs.period_number, rs.id
  from routine_slots rs
  join sections s on s.id = rs.section_id
  join classes c on c.id = s.class_id
  join class_period_rules pr on pr.class_id = c.id and pr.day = rs.day
 where rs.period_number < pr.min_period or rs.period_number > pr.max_period
 order by c.sort_order, s.name, rs.day, rs.period_number;

select 'Adjustment assignments outside class period rules:' as report;
select c.name as class_name, s.name as section_name, ab.adjust_date,
       extract(dow from ab.adjust_date)::int as day, aa.period_number, aa.id
  from adjustment_assignments aa
  join adjustment_batches ab on ab.id = aa.batch_id
  join sections s on s.id = ab.section_id
  join classes c on c.id = s.class_id
  join class_period_rules pr on pr.class_id = c.id and pr.day = extract(dow from ab.adjust_date)::int
 where aa.period_number < pr.min_period or aa.period_number > pr.max_period
 order by ab.adjust_date, c.sort_order, aa.period_number;

select 'Classes with no configured rule (treated as unrestricted):' as report;
select c.name as class_name
  from classes c
 where not exists (
   select 1 from class_period_rules pr where pr.class_id = c.id
 )
 order by c.sort_order;