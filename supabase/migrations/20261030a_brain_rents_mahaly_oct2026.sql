-- Mahaly.ma commercial rents, October 2026 calculation (applied 30 Oct 2026 through brain_add_value()).
-- Supersedes Anfa, Bourgogne, Californie, Gauthier, Maârif (Sept 2026 rows); adds Aïn Diab, Sidi Maârouf,
-- Casa Finance City and Sidi Belyout (Mahaly's own label; not mapped to « Centre-ville » until confirmed).
-- Mahaly's 10 hidden districts (Racine, CIL, Palmier, Oasis may be among them) were not readable.
select brain_add_value(jsonb_build_object(
  'parameter_key','property.rent_m2_month','country_code','MA','city','Casablanca','district',d,
  'value_num',v,'low',lo,'high',hi,'unit','currency_per_m2_month','currency','MAD',
  'source_class','published','status','researched',
  'source_name','Mahaly.ma, Prix de l''immobilier commercial à Casablanca (calcul d''octobre 2026, relevés des 24 derniers mois, médiane et écart interquartile ; nombre de relevés par quartier non publié)',
  'source_url','https://mahaly.ma/prix-immobilier-commercial-casablanca/',
  'source_published_at','2026-10-01','observed_at','2026-10-30','confidence','medium',
  'review_note','ASKING rents for all commercial premises (not restaurants only), weighted towards signed transactions where available; listings often add 20% VAT on top, recoverable. A fitted-out restaurant unit in a prime street may price above the district median.'))
from (values ('Anfa',173,133,225),('Bourgogne',145,118,184),('Californie',167,126,200),('Gauthier',150,120,182),
             ('Maârif',140,104,173),('Aïn Diab',174,139,203),('Sidi Maârouf',134,100,159),
             ('Casa Finance City',211,186,254),('Sidi Belyout',175,103,195)) r(d,v,lo,hi);
update brain_parameter_values set researched_by='claude', refresh_due_at='2027-10-30'
 where parameter_key='property.rent_m2_month' and observed_at='2026-10-30' and status='researched';
