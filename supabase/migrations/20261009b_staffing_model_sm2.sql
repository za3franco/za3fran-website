-- 20261009b_staffing_model_sm2.sql — staffing method sm-2 (estimates est-1.1.0) and two new role salaries
-- Arnaud, 9 Oct 2026: Brain estimates must land inside the normal ranges. sm-1 gave payroll ~18% of revenue
-- for Canaille (band 20-38%) because it had no sommelier, no cleaner, no leave/holiday cover and no kitchen prep.
update brain_parameter_values set status = 'superseded'
 where parameter_key = 'benchmark.staffing_model' and format_key = 'bistro_wine_bar' and status <> 'superseded';
insert into brain_parameter_values (parameter_key, market_id, format_key, qualifier, value_json, unit, source_class, status, source_name, source_url, observed_at, confidence, researched_by, review_note, refresh_due_at, supersedes_id)
 select 'benchmark.staffing_model', null, 'bistro_wine_bar', '', '{"version":"sm-2","overtime_tolerance":0.1,"absence_factor":{"base":1.12,"low":1.1,"high":1.15},"service_hours":{"lunch":{"base":5,"low":4.5,"high":6},"dinner":{"base":6.5,"low":6,"high":7.5},"default":{"base":6,"low":5,"high":7}},"fixed":[{"role":"chef","count":1,"covers":["cook"],"note":"One head chef per venue; works the line (covers cook hours)"},{"role":"manager","count":1,"covers":["server"],"founder_replaces":true,"note":"One floor manager per venue; covers one floor position"}],"on_duty":[{"role":"server","seats_per":{"base":18,"low":15,"high":22}},{"role":"cook","seats_per":{"base":25,"low":20,"high":30},"prep_hours_per_day":{"base":3,"low":2,"high":4}},{"role":"commis","count":1,"min_seats":40,"prep_hours_per_day":{"base":2,"low":1.5,"high":3}},{"role":"kitchen_porter","count":1,"prep_hours_per_day":{"base":1,"low":0.5,"high":1.5}},{"role":"bartender","count":1,"alcohol_only":true},{"role":"sommelier","count":1,"alcohol_only":true,"services":["dinner"]},{"role":"cleaner","hours_per_open_day":{"base":4,"low":3,"high":6}}]}'::jsonb, 'json', 'estimate', 'researched',
  'Za3fran judgment, 9 Oct 2026. Absence factor from the Moroccan Labour Code as summarised by Africarrieres (1.5 working days of paid leave per month of service, 18 per year; 10-11 paid public holidays; 44-hour week). Secondary source, AI-assisted, to confirm against the Code du travail.',
  'https://africarrieres.com/maroc/fr/guide/droit-du-travail/heures-et-conges', '2026-10-09', 'low', 'claude',
  'ESTIMATE, JUDGMENT. sm-2: adds sommelier (dinner, alcohol), cleaner (4 h per open day), kitchen prep hours per open day, absence factor 1.12 (leave + holidays + sickness), one server per 18 seats. Canaille check: 16 people, payroll 25% and EBITDA 16.5% of year-2 revenue (bands 20-38% and 8-22%).',
  '2027-10-09', id from brain_parameter_values where id = '60ac8eca-a20e-4a14-bf56-4a92a134d21d';
insert into brain_parameter_values (parameter_key, market_id, format_key, qualifier, value_num, low, high, unit, currency, source_class, status, source_name, source_url, observed_at, confidence, researched_by, review_note, refresh_due_at) values
 ('labour.salary_monthly', '6e6218db-0e40-4fc9-9528-30465935d145', null, 'sommelier', 6500, 5000, 9000, 'currency_per_month', 'MAD', 'estimate', 'researched',
  'jobandsalaryabroad.com, Sommelier Casablanca (single figure USD 646, period and date not stated, about 6,400 MAD) + Za3fran judgment',
  'https://jobandsalaryabroad.com/en-in/casablanca/english-sommelier-casablanca.html', '2026-10-09', 'low', 'claude',
  'ESTIMATE. Secondary aggregator source, undated; no Moroccan restaurant sommelier salary found. Gross monthly.', '2027-10-09'),
 ('labour.salary_monthly', '6e6218db-0e40-4fc9-9528-30465935d145', null, 'cleaner', 3500, 3423, 4000, 'currency_per_month', 'MAD', 'estimate', 'researched',
  'Za3fran judgment anchored on the Moroccan minimum wage (labour.minimum_wage_monthly, 3,422.72 MAD)',
  null, '2026-10-09', 'low', 'claude', 'ESTIMATE, JUDGMENT. Cleaner at or slightly above the minimum wage. Gross monthly.', '2027-10-09');
update brain_review_queue set value_id = (select id from brain_parameter_values where parameter_key = 'benchmark.staffing_model' and status = 'researched'),
  detail = detail || jsonb_build_object('note', 'Method sm-2 (supersedes sm-1): sommelier, cleaner, prep hours, leave and holiday cover. Plans use it immediately; review when convenient.')
 where parameter_key = 'benchmark.staffing_model' and status = 'open';
