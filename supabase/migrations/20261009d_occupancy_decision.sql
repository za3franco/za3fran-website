-- Arnaud's decision, 9 Oct 2026 (review of the first v14 Business Plan): bistro_wine_bar ramps up faster
-- and keeps growing in year 3. Operator judgment, reviewed by Arnaud: Za3fran verified, medium confidence.
-- Superseded rows stay for history (one live row per parameter, format and qualifier).
insert into brain_parameters (key, scope, grp, level, label_en, label_fr, unit, value_type, qualifier_kind, fav, refresh_months, regulatory, engine_path, notes)
values ('benchmark.occupancy_growth_y3', 'format', 'benchmark', null, 'Cruise occupancy rise in year 3 (points)', 'Hausse du taux de remplissage en année 3 (points)',
        'pct', 'number', null, 'high', 24, false, 'services[].occupancy[2]', 'Added to the year-2 cruise occupancy of every service; capped at the 85% rule (resolver ar-1.6.0)')
on conflict (key) do nothing;

with old as (
  update brain_parameter_values set status = 'superseded'
  where status <> 'superseded' and format_key = 'bistro_wine_bar'
    and ((parameter_key = 'benchmark.ramp_months' and qualifier = '')
      or (parameter_key = 'benchmark.ramp_start_factor' and qualifier = '')
      or (parameter_key = 'benchmark.cruise_occupancy' and qualifier = 'dinner'))
  returning id, parameter_key, qualifier
)
insert into brain_parameter_values (parameter_key, format_key, qualifier, value_num, low, high, unit, source_class, status, source_name,
  observed_at, confidence, researched_by, reviewer, reviewed_at, review_note, refresh_due_at, supersedes_id)
select o.parameter_key, 'bistro_wine_bar', o.qualifier, n.v, n.lo, n.hi, n.unit, 'za3fran_verified', 'verified',
  'Arnaud Hébrard, F&B operator judgment (decision 9 Oct 2026)', date '2026-10-09', 'medium', 'arnaud', 'Arnaud', now(),
  'Faster ramp-up for a wine bistro with a strong pre-opening; replaces the conservative US-source estimate', date '2028-10-09', o.id
from old o join (values
  ('benchmark.ramp_months', '', 6::numeric, 4::numeric, 9::numeric, 'months'),
  ('benchmark.ramp_start_factor', '', 0.65, 0.50, 0.80, 'factor'),
  ('benchmark.cruise_occupancy', 'dinner', 0.70, 0.55, 0.80, 'pct')
) as n(k, q, v, lo, hi, unit) on n.k = o.parameter_key and n.q = o.qualifier;

insert into brain_parameter_values (parameter_key, format_key, qualifier, value_num, low, high, unit, source_class, status, source_name,
  observed_at, confidence, researched_by, reviewer, reviewed_at, review_note, refresh_due_at)
select 'benchmark.occupancy_growth_y3', 'bistro_wine_bar', '', 0.05, 0, 0.08, 'pct', 'za3fran_verified', 'verified',
  'Arnaud Hébrard, F&B operator judgment (decision 9 Oct 2026)', date '2026-10-09', 'medium', 'arnaud', 'Arnaud', now(),
  'Loyalty and word of mouth keep raising occupancy in year 3', date '2028-10-09'
where not exists (select 1 from brain_parameter_values where parameter_key = 'benchmark.occupancy_growth_y3' and format_key = 'bistro_wine_bar' and status <> 'superseded');
