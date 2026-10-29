-- Brain: employee payroll rules, Morocco 2026 (labour.payroll_rules), used by lib/payroll.js (pr-1.0.0)
-- to convert a founder salary entered net into the gross the engine needs.
-- Status researched (regulatory item -> Arnaud's review list). Same JSON as tests/fixtures/payroll-rules-ma-2026.js.

insert into brain_parameters (key, scope, grp, level, label_en, label_fr, unit, value_type, qualifier_kind, fav, refresh_months, regulatory, engine_path, notes)
values ('labour.payroll_rules', 'local', 'labour', 'country',
  'Employee payroll rules (social contributions, income tax)', 'Règles de paie salarié (cotisations, impôt sur le revenu)',
  'json', 'json', null, null, 12, true, null,
  'Employee shares of social contributions, professional-expenses deduction, income-tax scale and family reduction. Used only to convert net <-> gross (lib/payroll.js); employer charges stay labour.employer_charges_pct.')
on conflict (key) do nothing;

insert into brain_parameter_values (parameter_key, market_id, format_key, qualifier, value_json, unit, currency, source_class, status,
  source_name, source_url, source_published_at, observed_at, confidence, researched_by, refresh_due_at, review_note)
select 'labour.payroll_rules', m.id, null, '',
  '{"year":2026,"country":"MA",
    "social":[{"key":"cnss_short_term","rate":0.0052,"ceiling_monthly":6000,"deductible":true},
              {"key":"cnss_long_term","rate":0.0396,"ceiling_monthly":6000,"deductible":true},
              {"key":"amo","rate":0.0226,"ceiling_monthly":null,"deductible":true}],
    "prof_expenses":{"brackets":[{"up_to_annual_gross":78000,"rate":0.35,"cap_annual":null},
                                 {"up_to_annual_gross":null,"rate":0.25,"cap_annual":35000}]},
    "income_tax":{"brackets":[{"up_to":40000,"rate":0,"deduct":0},{"up_to":60000,"rate":0.10,"deduct":4000},
                              {"up_to":80000,"rate":0.20,"deduct":10000},{"up_to":100000,"rate":0.30,"deduct":18000},
                              {"up_to":180000,"rate":0.34,"deduct":22000},{"up_to":null,"rate":0.37,"deduct":27400}]},
    "family":{"per_dependent_annual":500,"cap_annual":3000},
    "sources":[
      {"item":"income_tax scale and family reduction (LF 2025, n° 60-24, from 1 Jan 2025)","name":"Grant Thornton Maroc, Loi de finances 2025 — note sur les principales mesures (Dec 2024)","url":"https://www.grantthornton.ma/globalassets/_markets_/mar/publications/note-fiscale---lf-2025-.pdf","secondary":true},
      {"item":"official text of LF 2025 measures (not readable by our tools: robots)","name":"DGI, Note circulaire n° 736","url":"https://www.tax.gov.ma/wps/wcm/connect/ad04626f-6168-40d0-8f70-8e453a925bdc/Note+Circulaire++n%C2%B0+736+relative+aux+mesures+fiscales+de+la+LF+2025.pdf"},
      {"item":"no change to salary IR in LF 2026 (loi n° 50-25, BO 16 Dec 2025) except CFC staff and sports professionals","name":"Deloitte Société d''Avocats, Maroc : principales mesures de la LF 2026","url":"https://blog.avocats.deloitte.fr/maroc-les-principales-mesures-de-la-loi-de-finances-pour-2026/","secondary":true},
      {"item":"professional expenses 35% up to 78,000 gross a year, 25% above, cap 35,000 (LF 2023, CGI art. 59)","name":"H24info, Loi de finances 2023 : les principales mesures relatives à l''IR (4 Jan 2023)","url":"https://h24info.ma/economie/loi-de-finances-2023-les-principales-mesures-relatives-a-lir/","secondary":true},
      {"item":"CNSS employee shares (short term 1/3 of 1.57%, long term 1/3 of 11.89%) on salary capped at 6,000/month","name":"ACAPS, fiche synthétique CNSS (Feb 2025)","url":"https://www.acaps.ma/sites/default/files/2025-02/fiche_synthetique_cnss.pdf"},
      {"item":"AMO 4.52% shared employer/employee from Jan 2016 (employee 2.26%, no ceiling: split from payroll guides)","name":"Le360, AMO : les salariés du privé cotiseront plus (2015, draft decree)","url":"https://fr.le360.ma/societe/amo-les-salaries-du-prive-cotiseront-plus-23247/","secondary":true}
    ]}'::jsonb,
  'json', 'MAD', 'published', 'researched',
  'LF 2025 IR scale (Grant Thornton note), LF 2026 unchanged for salaries (Deloitte), LF 2023 professional expenses (H24info), CNSS rates (ACAPS), AMO 4.52% (Le360) — details in value_json.sources',
  'https://www.grantthornton.ma/globalassets/_markets_/mar/publications/note-fiscale---lf-2025-.pdf',
  '2024-12-01', '2026-10-29', 'medium', 'claude', '2027-01-15',
  'Secondary sources (consultancy notes, press); the DGI circulars 736/737 could not be read by our tools. AMO employee split 2.26% taken from payroll guides (half of 4.52%). Check against a payslip or a local accountant before marking verified.'
from brain_markets m
where m.country_code = 'MA' and m.city is null
  and not exists (select 1 from brain_parameter_values v where v.parameter_key = 'labour.payroll_rules' and v.market_id = m.id and v.status <> 'superseded');

insert into brain_review_queue (value_id, parameter_key, reason, detail, status)
select v.id, v.parameter_key, 'regulatory', '{"note":"New Brain entry: Morocco payroll rules 2026 for net -> gross conversion of the founder salary"}'::jsonb, 'open'
from brain_parameter_values v
where v.parameter_key = 'labour.payroll_rules' and v.status = 'researched'
  and not exists (select 1 from brain_review_queue q where q.value_id = v.id);
