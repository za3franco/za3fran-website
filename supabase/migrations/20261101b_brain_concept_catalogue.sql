-- Concept catalogue (Concept Studio K3), structure validated by Arnaud on 1 Nov 2026
-- (claude/catalogue-concepts-structure.md). Three tables + the starting list of 29 formats.
-- Numbers (capex, team, covers, ticket) stay in the engine's family methods; these tables hold
-- qualitative lines with a source and a date, and sourced examples. RLS on, no policies.

create table if not exists public.brain_concept_formats (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name_fr       text not null,
  name_en       text not null,
  family        text check (family is null or family in ('bistro_wine_bar','restaurant','cafe_brunch','fast_casual','bar_lounge')),
  seat_based    boolean not null default true,       -- false: no seats to model (dark kitchen, caterer)
  definition_fr text,
  priority      smallint not null default 2 check (priority in (1,2,3)),   -- 1 = first research lots
  status        text not null default 'listed' check (status in ('listed','researched','verified')),
  researched_by text not null default 'claude',
  reviewer      text,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.brain_concept_formats enable row level security;

create table if not exists public.brain_concept_lines (
  id                  uuid primary key default gen_random_uuid(),
  format_id           uuid not null references public.brain_concept_formats(id) on delete cascade,
  block               text not null check (block in
                        ('promise','economics','operations','success','pitfalls','profile_fit',
                         'district_types','casablanca','regulatory','gaps')),
  position            integer not null default 0,
  body_fr             text not null,
  body_en             text,
  inference           boolean not null default false,
  source_class        text not null default 'published' check (source_class in ('published','za3fran_verified','estimate')),
  source_name         text,
  source_url          text,
  source_published_at date,                          -- null = the source carries no date (say so in source_name)
  source_country      text,                          -- ISO code; differs from MA = another country, never a Casablanca figure
  observed_at         date not null default current_date,
  confidence          text not null default 'medium' check (confidence in ('low','medium','high')),
  status              text not null default 'researched' check (status in ('researched','verified','superseded')),
  researched_by       text not null default 'claude',
  reviewer            text,
  reviewed_at         timestamptz,
  supersedes_id       uuid references public.brain_concept_lines(id),
  created_at          timestamptz not null default now(),
  constraint concept_line_sourced check (block = 'gaps' or inference or source_name is not null)
);
create index if not exists brain_concept_lines_format_idx
  on public.brain_concept_lines (format_id, block, position) where status <> 'superseded';
alter table public.brain_concept_lines enable row level security;

create table if not exists public.brain_concept_examples (
  id                  uuid primary key default gen_random_uuid(),
  format_id           uuid not null references public.brain_concept_formats(id) on delete cascade,
  venue_name          text not null,
  city                text not null,
  country             text not null,                 -- ISO code
  opened_text         text,                          -- as the source gives it (« août 2023 », « non indiqué »)
  what_fr             text not null,
  proof_fr            text,                          -- what shows that it works (or what was adjusted)
  source_name         text not null,
  source_url          text,
  source_published_at date,                          -- null = undated source (said in source_name)
  observed_at         date not null default current_date,
  status              text not null default 'researched' check (status in ('researched','verified','superseded')),
  researched_by       text not null default 'claude',
  reviewer            text,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);
create unique index if not exists brain_concept_examples_live_idx
  on public.brain_concept_examples (format_id, lower(venue_name), lower(city)) where status <> 'superseded';
alter table public.brain_concept_examples enable row level security;

insert into public.brain_concept_formats (slug, name_fr, name_en, family, seat_based, priority) values
 ('bar-a-vin','Bar à vin','Wine bar','bistro_wine_bar',true,1),
 ('bistro-brasserie','Bistro-brasserie de quartier','Neighbourhood bistro / brasserie','bistro_wine_bar',true,1),
 ('table-marocaine-contemporaine','Table marocaine contemporaine','Contemporary Moroccan table','restaurant',true,2),
 ('trattoria-pizzeria-napolitaine','Trattoria / pizzeria napolitaine','Trattoria / Neapolitan pizzeria','restaurant',true,2),
 ('comptoir-japonais-sushi','Comptoir japonais / sushi','Japanese counter / sushi','restaurant',true,1),
 ('libanais-mediterraneen','Cuisine libanaise et méditerranéenne','Lebanese and Mediterranean','restaurant',true,2),
 ('grill-viande','Grill et viande','Grill and steakhouse','restaurant',true,2),
 ('poissons-fruits-de-mer','Poissons et fruits de mer','Fish and seafood','restaurant',true,2),
 ('tapas-iberiques','Tapas ibériques','Iberian tapas','restaurant',true,2),
 ('supper-club','Supper club / table d''hôtes','Supper club / chef''s table','restaurant',true,3),
 ('cafe-de-specialite','Café de spécialité','Specialty coffee shop','cafe_brunch',true,1),
 ('cafe-resto-brunch','Café-resto de quartier / brunch','Neighbourhood café-restaurant / brunch','cafe_brunch',true,2),
 ('boulangerie-patisserie-cafe','Boulangerie-pâtisserie-café','Bakery-pastry-café','cafe_brunch',true,1),
 ('salon-de-the-patisserie','Salon de thé et pâtisserie','Tea room and pastry','cafe_brunch',true,2),
 ('creperie','Crêperie','Crêperie','cafe_brunch',true,3),
 ('glacier-gelato','Glacier et gelato','Ice cream and gelato','cafe_brunch',true,3),
 ('jus-bowls','Jus et bowls','Juice and bowls','cafe_brunch',true,3),
 ('burger','Burger','Burger','fast_casual',true,2),
 ('poulet','Poulet','Chicken','fast_casual',true,3),
 ('tacos-street-food','Tacos et street food','Tacos and street food','fast_casual',true,3),
 ('bowls-poke','Bowls / poke','Bowls / poke','fast_casual',true,3),
 ('sandwich-shawarma-premium','Sandwich et shawarma premium','Premium sandwich and shawarma','fast_casual',true,2),
 ('food-hall','Food hall / comptoirs','Food hall / counters','fast_casual',true,3),
 ('bar-a-cocktails','Bar à cocktails','Cocktail bar','bar_lounge',true,1),
 ('rooftop-lounge','Rooftop / lounge','Rooftop / lounge','bar_lounge',true,2),
 ('bar-de-quartier','Bar de quartier','Neighbourhood bar','bar_lounge',true,3),
 ('beach-club','Beach club','Beach club','bar_lounge',true,3),
 ('dark-kitchen','Dark kitchen / livraison','Dark kitchen / delivery-first',null,false,2),
 ('traiteur','Traiteur','Caterer',null,false,3)
on conflict (slug) do nothing;
