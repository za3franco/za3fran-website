-- Concept Studio knowledge foundation (Phase B, 30 Oct 2026, Handoff Brief #20 task 3)
--
-- 1. brain_district_notes: one row per line of a district card (character, audiences, footfall drivers,
--    venue landscape, signals for concepts, urban works to watch, gaps). Every line carries its own source
--    and date; a line the research inferred is flagged `inference`. Rents are NOT here: they stay in
--    brain_parameter_values (property.rent_m2_month, district market).
-- 2. brain_venues: the venue census. A venue enters only with a dated source less than ~18 months old
--    at the time it is observed (checked by the table). Generated « Top N » lists and undated aggregators
--    are not sources. Google Places content is never stored. OpenStreetMap rows (ODbL) carry their OSM id
--    and are printed with « © OpenStreetMap contributors ».
-- Both tables: RLS enabled, no policies (service key only).

create table if not exists public.brain_district_notes (
  id                  uuid primary key default gen_random_uuid(),
  market_id           uuid not null references public.brain_markets(id),
  section             text not null check (section in
                        ('character','audiences','footfall','venue_landscape','signals','urban_works','gaps')),
  position            integer not null default 0,
  body_fr             text not null,
  body_en             text,
  inference           boolean not null default false,
  source_class        text not null default 'published' check (source_class in ('published','za3fran_verified','estimate')),
  source_name         text,
  source_url          text,
  source_published_at date,
  observed_at         date not null default current_date,
  confidence          text not null default 'medium' check (confidence in ('low','medium','high')),
  status              text not null default 'researched' check (status in ('researched','verified','superseded')),
  researched_by       text not null default 'claude',
  reviewer            text,
  reviewed_at         timestamptz,
  supersedes_id       uuid references public.brain_district_notes(id),
  created_at          timestamptz not null default now(),
  -- every line but a gap names its source
  constraint district_note_sourced check (section = 'gaps' or source_name is not null)
);
create index if not exists brain_district_notes_market_idx
  on public.brain_district_notes (market_id, section, position) where status <> 'superseded';
alter table public.brain_district_notes enable row level security;

create table if not exists public.brain_venues (
  id                  uuid primary key default gen_random_uuid(),
  market_id           uuid not null references public.brain_markets(id),   -- the district
  name                text not null,
  street_hint         text,                                                 -- street or landmark only, never a full address
  venue_type          text,                                                 -- Validator establishment type (lib/formats.js) or bakery / ice_cream / other
  family              text check (family is null or family in
                        ('bistro_wine_bar','restaurant','cafe_brunch','fast_casual','bar_lounge')),
  cuisine             text,
  price_band          text check (price_band is null or price_band in ('budget','mid','upscale','premium')),
  alcohol             boolean,
  services            text[],                                               -- breakfast / lunch / dinner when the source says so
  opened_on           date,                                                 -- month precision (1st of the month)
  venue_status        text not null default 'open' check (venue_status in ('open','opening_soon','closed','unknown')),
  source_class        text not null check (source_class in ('published','za3fran_verified','osm')),
  source_name         text not null,
  source_url          text,
  source_published_at date not null,
  observed_at         date not null default current_date,
  osm_id              text,                                                 -- e.g. node/123456 (ODbL attribution required)
  note                text,
  status              text not null default 'researched' check (status in ('researched','verified','superseded')),
  researched_by       text not null default 'claude',
  reviewer            text,
  reviewed_at         timestamptz,
  supersedes_id       uuid references public.brain_venues(id),
  created_at          timestamptz not null default now(),
  -- census rule: a dated source less than ~18 months old when observed
  constraint venue_source_recent check (source_published_at >= observed_at - interval '18 months')
);
create unique index if not exists brain_venues_live_name_idx
  on public.brain_venues (market_id, lower(name)) where status <> 'superseded';
create unique index if not exists brain_venues_osm_idx
  on public.brain_venues (osm_id) where osm_id is not null and status <> 'superseded';
create index if not exists brain_venues_family_idx
  on public.brain_venues (market_id, family) where status <> 'superseded';
alter table public.brain_venues enable row level security;
