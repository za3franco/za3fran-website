-- Za3fran Brain — catalogue additions for the assumption resolver (ar-1.0.0)
-- Additive only. Without these, plans would omit marketing and overheads (understating costs, as v13 did)
-- and assume unlimited loss carry-forward. Catalogue goes from 39 to 42 parameters.
insert into brain_parameters (key, scope, grp, level, label_en, label_fr, unit, value_type, qualifier_kind, fav, refresh_months, regulatory, engine_path) values
 ('tax.loss_carryforward_years', 'local','tax','country','Loss carry-forward limit (years)','Report déficitaire (années)','years','number',null,'high',12,true,'tax.loss_carryforward_years'),
 ('benchmark.marketing_pct',     'format','benchmark',null,'Marketing (% of revenue)','Marketing (% du CA)','pct','number',null,'low',24,false,'opex[marketing].pct_of_revenue'),
 ('benchmark.other_opex_pct',    'format','benchmark',null,'Maintenance, supplies, admin, accounting (% of revenue)','Entretien, consommables, administration, comptabilité (% du CA)','pct','number',null,'low',24,false,'opex[other].pct_of_revenue')
on conflict (key) do nothing;
