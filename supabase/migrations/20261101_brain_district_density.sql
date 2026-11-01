-- District density summaries (Concept Studio K2, OpenStreetMap test of 1 Nov 2026).
-- One row per district and survey. OSM gives no date per venue, so it never feeds brain_venues:
-- only counts by type are stored, with the method and its limits. Data: ODbL,
-- attribution « © OpenStreetMap contributors ». RLS on, no policies (service key only).
create table if not exists public.brain_district_density (
  id               uuid primary key default gen_random_uuid(),
  market_id        uuid not null references public.brain_markets(id),
  method           text not null default 'osm_overpass_radius',
  source_name      text not null,
  source_url       text,
  attribution      text not null default '© OpenStreetMap contributors (ODbL)',
  observed_at      date not null,
  centre_lat       numeric(9,6),
  centre_lon       numeric(9,6),
  radius_m         integer,
  total            integer not null,
  by_amenity       jsonb not null,            -- {restaurant, cafe, fast_food, bar, ice_cream, pub}
  with_name        integer,
  with_cuisine     integer,
  restaurants_with_cuisine integer,
  chains_heuristic integer,                   -- our own name list, indicative only
  checks           jsonb,                     -- press openings looked for: found / not found
  limits           text not null,
  status           text not null default 'researched' check (status in ('researched','verified','superseded')),
  researched_by    text not null default 'claude',
  reviewer         text,
  reviewed_at      timestamptz,
  supersedes_id    uuid references public.brain_district_density(id),
  created_at       timestamptz not null default now()
);
create index if not exists brain_district_density_market_idx
  on public.brain_district_density (market_id, observed_at desc) where status <> 'superseded';
alter table public.brain_district_density enable row level security;

insert into public.brain_district_density
 (market_id, source_name, source_url, observed_at, centre_lat, centre_lon, radius_m, total, by_amenity,
  with_name, with_cuisine, restaurants_with_cuisine, chains_heuristic, checks, limits)
select m.id,
  'OpenStreetMap via Overpass (overpass-turbo.eu), amenity = restaurant | cafe | bar | pub | fast_food | ice_cream, relevé du 1 nov. 2026',
  'https://www.openstreetmap.org/copyright', date '2026-11-01', v.lat, v.lon, 650, v.total, v.by_amenity::jsonb,
  v.named, v.cuisine, v.rest_cuisine, v.chains, v.checks::jsonb,
  'Cercle de 650 m autour d''un centre approximatif, pas les limites administratives ; les zones Maârif et Gauthier se chevauchent (23 lieux communs). Pas de date par lieu : couverture des ouvertures récentes faible, aucun lieu du côté du vin ou des cocktails repéré, cuisine renseignée pour moins de 40 % des lieux. Indicateur de densité et de mélange de types, pas un recensement.'
from (values
  ('Maârif',   33.5850, -7.6355, 131, '{"restaurant":58,"cafe":39,"fast_food":23,"bar":5,"ice_cream":6}', 120, 38, 21, 12,
     '{"looked_for":["Mila Supper Club","Casa Galicia"],"found":[],"not_found":["Mila Supper Club","Casa Galicia"]}'),
  ('Gauthier', 33.5915, -7.6285, 115, '{"restaurant":56,"cafe":37,"fast_food":13,"bar":9,"ice_cream":0}',  99, 39, 23,  7,
     '{"looked_for":["Monsieur Moutarde","Braise","L''Octave"],"found":["Braise"],"not_found":["Monsieur Moutarde","L''Octave"]}')
) v(d, lat, lon, total, by_amenity, named, cuisine, rest_cuisine, chains, checks)
join public.brain_markets c on c.country_code = 'MA' and c.city = 'Casablanca' and c.district is null
join public.brain_markets m on m.parent_id = c.id and lower(m.district) = lower(v.d);
