-- 20261027_staffing_model_sm3.sql — staffing method sm-3 (estimates est-1.2.0, resolver ar-1.7.0, engine fe-1.5.0)
-- Arnaud, 27 Oct 2026 (Brief #11, decision 7c): the team grows with covers in year 3.
-- sm-3 = sm-2 unchanged + "growth": the hours of the covers-driven roles (server, cook, commis, kitchen porter,
-- bartender) follow covers from year 2 to year 3 (elasticity 1, range 0.7-1), rounded to half-time posts.
-- Fixed roles (chef, manager/founder, sommelier, cleaner) do not grow with covers.
update brain_parameter_values set status = 'superseded'
 where parameter_key = 'benchmark.staffing_model' and format_key = 'bistro_wine_bar' and status <> 'superseded';
insert into brain_parameter_values (id, parameter_key, market_id, format_key, qualifier, value_json, unit, source_class, status, source_name, source_url, observed_at, confidence, researched_by, review_note, refresh_due_at, supersedes_id)
 select '13356846-04af-4d57-9fd5-58b20eb06aea', 'benchmark.staffing_model', null, 'bistro_wine_bar', '',
  value_json || '{"version":"sm-3","growth":{"roles":["server","cook","commis","kitchen_porter","bartender"],"elasticity":{"base":1,"low":0.7,"high":1},"step":0.5,"from_year":3,"note":"Hours of covers-driven roles follow covers from year 2 to year 3; rounded to half-time posts"}}'::jsonb,
  'json', 'estimate', 'researched',
  'Za3fran judgment, 27 Oct 2026 (sm-2 + year-3 growth rule decided by Arnaud Hébrard on 27 Oct 2026). Elasticity 1 = staff hours in proportion to covers; 0.7 = some slack absorbed by the existing team.',
  null, '2026-10-27', 'low', 'claude',
  'ESTIMATE, JUDGMENT. sm-3: year-3 hires for server, cook, commis, kitchen porter, bartender in proportion to the covers rise (elasticity 1, range 0.7-1, half-time steps). Canaille check (decided intake): +0.5 server, +0.5 cook; year-3 payroll 18.9% -> 19.9%, EBITDA 24.4% -> 23.3% of revenue; years 1-2 unchanged.',
  '2027-10-27', id from brain_parameter_values where id = 'a6598257-4ec3-465f-b12a-111ee2f5f050';
-- Arnaud's review list: a new or changed method is reviewed (Brain rule 8); plans use it immediately.
-- Open items on sm-2 move to sm-3 (as in the sm-2 migration); otherwise one method_change item is added.
update brain_review_queue set value_id = '13356846-04af-4d57-9fd5-58b20eb06aea',
  detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('note', 'Method sm-3 (supersedes sm-2): the team grows with covers in year 3 (elasticity 1, range 0.7-1, half-time steps). Plans use it immediately; review when convenient.')
 where parameter_key = 'benchmark.staffing_model' and status = 'open';
insert into brain_review_queue (value_id, parameter_key, reason, detail, status)
 select '13356846-04af-4d57-9fd5-58b20eb06aea', 'benchmark.staffing_model', 'method_change',
  jsonb_build_object('note', 'Method sm-3 (supersedes sm-2): the team grows with covers in year 3 (elasticity 1, range 0.7-1, half-time steps). Plans use it immediately; review when convenient.'), 'open'
 where not exists (select 1 from brain_review_queue where value_id = '13356846-04af-4d57-9fd5-58b20eb06aea' and status = 'open');
