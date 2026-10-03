-- Za3fran Brain — structured data layer (strategy v1.6, Sections 10–13)
-- Additive only: creates new tables, touches nothing existing.
-- RLS is ENABLED with no policies: only the service key (server functions) can read/write.

-- 1. Markets: country, city or district. Values resolve district -> city -> country.
create table if not exists brain_markets (
  id            uuid primary key default gen_random_uuid(),
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),      -- ISO 3166-1 alpha-2
  city          text,                                                 -- null = country level
  district      text,                                                 -- null = city level
  parent_id     uuid references brain_markets(id),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  coverage      text not null default 'researched' check (coverage in ('researched','partially_verified','verified')),
  created_at    timestamptz not null default now(),
  check (district is null or city is not null)
);
create unique index if not exists brain_markets_uniq on brain_markets (country_code, coalesce(city,''), coalesce(district,''));

-- 2. Parameter catalogue (~30 local parameters + format benchmarks). One row per parameter.
create table if not exists brain_parameters (
  key               text primary key,                 -- e.g. 'tax.vat_food', 'labour.salary_monthly'
  scope             text not null check (scope in ('local','format')),   -- local = per market; format = universal F&B ratio
  grp               text not null check (grp in ('tax','labour','property','operating','finance','regulation','calendar','market','benchmark')),
  level             text check (level in ('country','city','district')), -- for local params: lowest level it varies at
  label_en          text not null,
  label_fr          text not null,
  unit              text not null,                    -- 'pct','currency','currency_per_month','currency_per_m2_month','months','years','days','hours_per_week','factor','json','text'
  value_type        text not null check (value_type in ('number','json','text')),
  qualifier_kind    text,                             -- null, 'role', 'format', 'service', 'district', 'utility'
  fav               text check (fav in ('high','low')),   -- which end of the range is good for the business (scenarios)
  refresh_months    int  not null default 12 check (refresh_months between 1 and 120),
  regulatory        boolean not null default false,   -- always goes to Arnaud's review queue
  engine_path       text,                             -- where the resolver plugs it into engine inputs (null = informational)
  notes             text
);

-- 3. Values with full provenance. Founder figures do NOT live here (they live in project_assumptions).
create table if not exists brain_parameter_values (
  id                  uuid primary key default gen_random_uuid(),
  parameter_key       text not null references brain_parameters(key),
  market_id           uuid references brain_markets(id),        -- required for local params
  format_key          text,                                     -- required for format params (e.g. 'bistro_wine_bar')
  qualifier           text not null default '',                 -- role / service / district / utility, '' if none
  value_num           numeric,
  low                 numeric,
  high                numeric,
  value_json          jsonb,                                    -- tax brackets, holiday calendar, seasonality, ticket bands
  value_text          text,                                     -- regimes and procedures (licence, permits)
  unit                text not null,
  currency            text check (currency is null or currency ~ '^[A-Z]{3}$'),
  source_class        text not null check (source_class in ('za3fran_verified','published','estimate')),
  status              text not null default 'researched' check (status in ('researched','verified','rejected','superseded')),
  source_name         text,
  source_url          text,
  source_published_at date,
  observed_at         date not null default current_date,
  confidence          text not null default 'medium' check (confidence in ('high','medium','low')),
  researched_by       text not null default 'claude',
  reviewer            text,
  reviewed_at         timestamptz,
  review_note         text,
  refresh_due_at      date,                                     -- set by trigger from the parameter's refresh_months
  supersedes_id       uuid references brain_parameter_values(id),
  created_at          timestamptz not null default now(),
  -- integrity
  check (low is null or high is null or low <= high),
  check (value_num is null or low is null or low <= value_num),
  check (value_num is null or high is null or value_num <= high),
  check (num_nonnulls(value_num, value_json, value_text) >= 1),
  check (source_class <> 'estimate' or (low is not null and high is not null) or value_num is null),  -- estimates are ranges
  check (source_class <> 'published' or source_name is not null),                                   -- published = cited
  check (source_class <> 'za3fran_verified' or (status = 'verified' and reviewer is not null and reviewed_at is not null)),
  check (status <> 'verified' or (reviewer is not null and reviewed_at is not null))
);
-- One live value per (parameter, market/format, qualifier)
create unique index if not exists brain_values_live_uniq
  on brain_parameter_values (parameter_key, coalesce(market_id::text,''), coalesce(format_key,''), qualifier)
  where status in ('researched','verified');
create index if not exists brain_values_market_idx on brain_parameter_values (market_id);
create index if not exists brain_values_refresh_idx on brain_parameter_values (refresh_due_at) where status = 'verified';

-- Scope check + refresh date
create or replace function brain_values_before_write() returns trigger language plpgsql as $$
declare p brain_parameters%rowtype;
begin
  select * into p from brain_parameters where key = new.parameter_key;
  if p.scope = 'local'  and new.market_id is null then raise exception 'local parameter % needs market_id', p.key; end if;
  if p.scope = 'format' and new.format_key is null then raise exception 'format parameter % needs format_key', p.key; end if;
  new.refresh_due_at := (coalesce(new.reviewed_at::date, new.observed_at) + make_interval(months => p.refresh_months))::date;
  return new;
end $$;
drop trigger if exists brain_values_before_write on brain_parameter_values;
create trigger brain_values_before_write before insert or update on brain_parameter_values
  for each row execute function brain_values_before_write();

-- Effective view: a verified value past its refresh date drops back to researched (strategy §11).
create or replace view brain_values_effective as
select v.*,
  case when v.status = 'verified' and v.refresh_due_at < current_date then 'researched' else v.status end as effective_status,
  case when v.status = 'verified' and v.refresh_due_at >= current_date then 'za3fran_verified'
       when v.source_class = 'za3fran_verified' then 'published'      -- lapsed verification shows as its underlying source
       else v.source_class end as effective_source_class
from brain_parameter_values v
where v.status in ('researched','verified');

-- 4. Review queue — only the recommended list (strategy §13; Brain rule 8)
create table if not exists brain_review_queue (
  id            uuid primary key default gen_random_uuid(),
  value_id      uuid references brain_parameter_values(id),
  parameter_key text references brain_parameters(key),
  reason        text not null check (reason in ('impact_over_5pct','out_of_range','regulatory','market_profile',
                  'method_change','customer_error','random_audit','refresh_due','founder_evidence')),
  detail        jsonb,                 -- e.g. {"project_id":…, "investment_delta_pct":0.07}
  status        text not null default 'open' check (status in ('open','approved','edited','rejected')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   text,
  note          text
);
create unique index if not exists brain_review_open_uniq on brain_review_queue (value_id, reason) where status = 'open';

-- Weekly jobs (called by a Vercel cron later): expired verifications and the 1-in-20 audit
create or replace function brain_enqueue_refresh_due() returns int language sql as $$
  with ins as (
    insert into brain_review_queue (value_id, parameter_key, reason)
    select id, parameter_key, 'refresh_due' from brain_parameter_values
    where status = 'verified' and refresh_due_at < current_date
    on conflict do nothing returning 1)
  select count(*)::int from ins $$;

create or replace function brain_enqueue_random_audit() returns int language sql as $$
  with ins as (
    insert into brain_review_queue (value_id, parameter_key, reason)
    select id, parameter_key, 'random_audit' from brain_parameter_values
    where status in ('researched','verified') and random() < 0.05
    on conflict do nothing returning 1)
  select count(*)::int from ins $$;

-- 5. Per-project resolved assumptions = the "Assumptions & sources" appendix, frozen per run
create table if not exists project_assumptions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null,
  run_id          text not null,                -- e.g. business_plan_essentials_runs.id
  parameter_key   text not null,                -- brain key or engine-only key (e.g. 'services.dinner.ticket')
  qualifier       text not null default '',
  value_num       numeric,
  low             numeric,
  high            numeric,
  value_json      jsonb,
  unit            text not null,
  currency        text,
  source_class    text not null check (source_class in ('founder','za3fran_verified','published','estimate')),
  value_id        uuid references brain_parameter_values(id),   -- null for founder figures
  founder_note    text,                                         -- founder's own wording / quote reference
  method_version  text not null,                                -- e.g. 'fe-1.0.0'
  resolved_at     timestamptz not null default now(),
  unique (run_id, parameter_key, qualifier),
  check (source_class = 'founder' or value_id is not null or source_class = 'estimate')
);
create index if not exists project_assumptions_project_idx on project_assumptions (project_id);

alter table brain_markets          enable row level security;
alter table brain_parameters       enable row level security;
alter table brain_parameter_values enable row level security;
alter table brain_review_queue     enable row level security;
alter table project_assumptions    enable row level security;

-- 6. Catalogue seed: 34 parameters
insert into brain_parameters (key, scope, grp, level, label_en, label_fr, unit, value_type, qualifier_kind, fav, refresh_months, regulatory, engine_path) values
 ('tax.corporate_brackets',      'local','tax','country','Corporate tax brackets','Barème de l''impôt sur les sociétés','json','json',null,null,12,true,'tax.corporate_brackets'),
 ('tax.minimum_tax_pct',         'local','tax','country','Minimum tax (% of revenue)','Cotisation minimale (% du CA)','pct','number',null,'low',12,true,'tax.minimum_tax_pct_of_revenue'),
 ('tax.vat_food_service',        'local','tax','country','VAT on food service','TVA sur la restauration','pct','number',null,'low',12,true,'tax.vat_food'),
 ('tax.vat_alcohol',             'local','tax','country','VAT on alcohol','TVA sur l''alcool','pct','number',null,'low',12,true,'tax.vat_beverage'),
 ('tax.alcohol_excise',          'local','tax','country','Excise on alcohol','Taxe intérieure sur l''alcool','json','json',null,null,12,true,null),
 ('labour.minimum_wage_monthly', 'local','labour','country','Minimum wage (monthly)','Salaire minimum (mensuel)','currency_per_month','number',null,'low',12,true,null),
 ('labour.salary_monthly',       'local','labour','city','Gross monthly salary by role','Salaire brut mensuel par poste','currency_per_month','number','role','low',12,false,'labour.roster[].monthly_gross'),
 ('labour.employer_charges_pct', 'local','labour','country','Employer social charges','Charges patronales','pct','number',null,'low',12,true,'labour.employer_charges_pct'),
 ('labour.legal_hours_week',     'local','labour','country','Legal working week','Durée légale du travail','hours_per_week','number',null,null,12,true,null),
 ('labour.extra_months',         'local','labour','country','Mandatory bonuses (months of salary)','Primes obligatoires (mois de salaire)','months','number',null,'low',12,true,'labour.extra_months'),
 ('property.rent_m2_month',      'local','property','district','Retail rent per m² per month','Loyer commercial au m² par mois','currency_per_m2_month','number','district','low',12,false,'rent.monthly'),
 ('property.deposit_months',     'local','property','city','Rent deposit (months)','Dépôt de garantie (mois)','months','number',null,'low',12,false,'investment[deposit]'),
 ('property.key_money',          'local','property','district','Key money / goodwill','Pas-de-porte / droit au bail','currency','number','district','low',12,false,'investment[key_money]'),
 ('property.lease_years',        'local','property','country','Typical lease length','Durée de bail usuelle','years','number',null,null,12,false,null),
 ('property.rent_escalation',    'local','property','country','Rent escalation (rate and period)','Révision du loyer (taux et périodicité)','json','json',null,'low',12,true,'rent.escalation_pct|rent.escalation_every_years'),
 ('operating.electricity_tariff','local','operating','city','Electricity tariff (professional)','Tarif électricité (professionnel)','currency','number',null,'low',12,false,null),
 ('operating.gas_tariff',        'local','operating','city','Gas price (professional)','Prix du gaz (professionnel)','currency','number',null,'low',12,false,null),
 ('operating.water_tariff',      'local','operating','city','Water tariff (professional)','Tarif eau (professionnel)','currency','number',null,'low',12,false,null),
 ('operating.insurance_annual',  'local','operating','country','Business insurance (annual, small restaurant)','Assurance multirisque (annuelle, petit restaurant)','currency','number',null,'low',12,false,'opex[insurance].fixed_monthly'),
 ('operating.card_fee_pct',      'local','operating','country','Card payment fees','Commissions sur paiement carte','pct','number',null,'low',12,false,'opex[card_fees].pct_of_revenue'),
 ('finance.sme_lending_rate',    'local','finance','country','SME bank lending rate','Taux de crédit bancaire PME','pct','number',null,'low',6,false,'funding.loans[].annual_rate'),
 ('finance.loan_term_months',    'local','finance','country','Typical loan term','Durée de crédit usuelle','months','number',null,'high',6,false,'funding.loans[].term_months'),
 ('finance.collateral_practice', 'local','finance','country','Collateral and personal guarantee practice','Pratique des garanties et cautions','text','text',null,null,6,false,null),
 ('finance.inflation_pct',       'local','finance','country','Inflation (annual)','Inflation (annuelle)','pct','number',null,'low',6,false,'growth.cost_pct'),
 ('regulation.alcohol_licence',  'local','regulation','country','Alcohol licence regime and typical cost','Régime et coût usuel de la licence d''alcool','json','json',null,'low',12,true,'investment[licence]'),
 ('regulation.food_safety',      'local','regulation','country','Food-safety permits','Autorisations sanitaires','text','text',null,null,12,true,null),
 ('regulation.opening_permits',  'local','regulation','city','Opening permits and lead times','Autorisations d''ouverture et délais','json','json',null,'low',12,true,null),
 ('calendar.dated_factors',      'local','calendar','country','Dated trading factors (e.g. Ramadan) by month','Facteurs datés (ex. Ramadan) par mois','json','json',null,null,12,false,'calendar.dated_factors'),
 ('calendar.seasonality',        'local','calendar','city','Monthly seasonality index (Jan–Dec)','Saisonnalité mensuelle (janv.–déc.)','json','json',null,null,12,false,'calendar.seasonality'),
 ('market.average_ticket',       'local','market','district','Average ticket by format and service','Ticket moyen par format et service','currency','number','format',null,12,false,'services[].ticket'),
 ('benchmark.food_cost_pct',     'format','benchmark',null,'Food cost (% of food revenue)','Coût matière cuisine (% du CA cuisine)','pct','number',null,'low',24,false,'cogs.food_pct'),
 ('benchmark.beverage_cost_pct', 'format','benchmark',null,'Beverage cost (% of beverage revenue)','Coût matière boissons (% du CA boissons)','pct','number',null,'low',24,false,'cogs.beverage_pct'),
 ('benchmark.turns',             'format','benchmark',null,'Turns per service','Rotations par service','factor','number','service','high',24,false,'services[].turns'),
 ('benchmark.cruise_occupancy',  'format','benchmark',null,'Cruise seat occupancy per service','Taux de remplissage en croisière par service','pct','number','service','high',24,false,'services[].occupancy'),
 ('benchmark.ramp_months',       'format','benchmark',null,'Months to cruise','Mois jusqu''à la croisière','months','number',null,'low',24,false,'ramp.months_to_cruise'),
 ('benchmark.ramp_start_factor', 'format','benchmark',null,'Opening-month level vs cruise','Niveau du premier mois vs croisière','factor','number',null,'high',24,false,'ramp.start_factor'),
 ('benchmark.payroll_pct',       'format','benchmark',null,'Payroll band (% of revenue), check only','Fourchette masse salariale (% du CA), contrôle','pct','number',null,'low',24,false,null),
 ('benchmark.beverage_share',    'format','benchmark',null,'Beverage share of ticket by service','Part boissons du ticket par service','pct','number','service','high',24,false,'services[].bev_share'),
 ('benchmark.utilities_pct',     'format','benchmark',null,'Utilities (% of revenue)','Énergie & fluides (% du CA)','pct','number',null,'low',24,false,'opex[utilities].pct_of_revenue')
on conflict (key) do nothing;
