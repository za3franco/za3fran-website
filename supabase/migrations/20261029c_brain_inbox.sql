-- Brain Inbox (Phase A, step 7) — 29 Oct 2026, design docs/brain-inbox-design.md
-- Items captured by e-mail (brain@za3fran.io, Cloudflare Email Worker) or by the private app (/brain),
-- read by Claude (api/brain-extract.js), reviewed by Arnaud. New tables: RLS on, no policies (service key only).

-- 1. One captured item ---------------------------------------------------------------------------------------
create table if not exists public.brain_inbox_items (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null check (source in ('email', 'app', 'share')),
  status              text not null default 'received'
                      check (status in ('uploading', 'received', 'extracting', 'ready', 'reviewed', 'rejected', 'refused', 'error')),
  title               text,
  from_address        text,
  subject             text,
  body_text           text,                         -- e-mail body or the note typed/dictated in the app
  url                 text,                         -- a link sent for reading
  files               jsonb not null default '[]',  -- [{path, name, type, size, deleted_at, deleted_reason}]
  raw_path            text,                         -- the raw e-mail (.eml) in the brain-inbox bucket
  user_tags           text[] not null default '{}',
  -- what Claude made of it
  extraction          jsonb,
  summary             text,
  kind                text,                         -- article, menu, price_list, regulation, study, note, quote, other
  tags                jsonb not null default '{}',  -- {markets:[], formats:[], topics:[]}
  destination         text,                         -- benchmark, method, document, discard
  rights              text check (rights in ('ok', 'unclear', 'employer', 'guest_data', 'third_party')),
  rights_question     text,
  source_name         text,
  source_url          text,
  source_published_at date,
  contributor         text not null default 'arnaud',
  model               text,
  usage               jsonb,
  attempts            int not null default 0,
  extract_claim       timestamptz,                  -- atomic claim of the extraction job
  error               text,
  received_at         timestamptz not null default now(),
  extracted_at        timestamptz,
  reviewed_at         timestamptz,
  review_note         text,
  search              tsvector generated always as (
                        to_tsvector('french', coalesce(title, '') || ' ' || coalesce(subject, '') || ' ' || coalesce(summary, '') || ' ' ||
                                              coalesce(source_name, '') || ' ' || coalesce(left(body_text, 20000), ''))) stored
);
create index if not exists brain_inbox_items_status_idx on public.brain_inbox_items (status, received_at desc);
create index if not exists brain_inbox_items_search_idx on public.brain_inbox_items using gin (search);
alter table public.brain_inbox_items enable row level security;

-- 2. One fact extracted from an item -------------------------------------------------------------------------
create table if not exists public.brain_inbox_facts (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.brain_inbox_items(id) on delete cascade,
  position      int not null default 0,
  statement     text not null,
  parameter_key text references public.brain_parameters(key),
  country_code  text,
  city          text,
  district      text,
  format_key    text,
  qualifier     text not null default '',
  value_num     numeric,
  low           numeric,
  high          numeric,
  unit          text,
  currency      text,
  value_text    text,
  basis         text check (basis in ('net', 'gross')),
  observed_at   date,
  quote         text,
  confidence    text check (confidence in ('high', 'medium', 'low')),
  status        text not null default 'proposed' check (status in ('proposed', 'added', 'verified', 'rejected')),
  value_id      uuid references public.brain_parameter_values(id),
  edited        boolean not null default false,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  search        tsvector generated always as (to_tsvector('french', coalesce(statement, '') || ' ' || coalesce(city, '') || ' ' || coalesce(quote, ''))) stored
);
create index if not exists brain_inbox_facts_item_idx on public.brain_inbox_facts (item_id, position);
create index if not exists brain_inbox_facts_search_idx on public.brain_inbox_facts using gin (search);
alter table public.brain_inbox_facts enable row level security;

-- 3. Prices read on dated menus (menu-price rule: prices only, never the photo) ------------------------------
create table if not exists public.brain_menu_prices (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references public.brain_inbox_items(id) on delete set null,
  venue         text not null,
  country_code  text,
  city          text,
  district      text,
  format_key    text,
  section       text,
  dish          text not null,
  price         numeric not null check (price >= 0),
  currency      text,
  menu_date     date,
  menu_date_source text check (menu_date_source in ('menu', 'photo', 'sender', 'website')),
  stale         boolean not null default false,  -- menu older than about 18 months
  status        text not null default 'proposed' check (status in ('proposed', 'added', 'rejected')),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists brain_menu_prices_item_idx on public.brain_menu_prices (item_id);
create index if not exists brain_menu_prices_venue_idx on public.brain_menu_prices (city, venue);
alter table public.brain_menu_prices enable row level security;

-- 4. Lockout of the app's personal code (persistent, not in memory) ------------------------------------------
create table if not exists public.brain_auth_attempts (
  key        text primary key,
  n          int not null default 0,
  locked_at  timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.brain_auth_attempts enable row level security;

-- 5. Private bucket for files and raw e-mails (25 MB per file, Cloudflare's own e-mail limit) ---------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('brain-inbox', 'brain-inbox', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 6. Add a value to the Brain from an approved fact: one live row per parameter, market, format and qualifier.
--    The previous live row is marked superseded and the new one points to it, in one transaction.
--    A market (city, district) that does not exist yet is created under its parent (cities are built on demand).
create or replace function public.brain_add_value(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  prm      brain_parameters%rowtype;
  country  brain_markets%rowtype;
  mk       uuid := null;
  city_id  uuid;
  old_id   uuid;
  new_id   uuid;
  q        text := coalesce(p->>'qualifier', '');
  fmt      text := nullif(p->>'format_key', '');
begin
  select * into prm from brain_parameters where key = p->>'parameter_key';
  if not found then raise exception 'unknown parameter %', p->>'parameter_key'; end if;
  if prm.scope = 'local' then
    select * into country from brain_markets where country_code = upper(p->>'country_code') and city is null and district is null limit 1;
    if not found then raise exception 'market % not in the Brain', p->>'country_code'; end if;
    mk := country.id;
    if nullif(p->>'city', '') is not null then
      select id into city_id from brain_markets where country_code = country.country_code and lower(city) = lower(p->>'city') and district is null limit 1;
      if city_id is null then
        insert into brain_markets (country_code, city, parent_id, currency, coverage)
        values (country.country_code, p->>'city', country.id, country.currency, 'researched') returning id into city_id;
      end if;
      mk := city_id;
      if nullif(p->>'district', '') is not null then
        select id into mk from brain_markets where parent_id = city_id and lower(district) = lower(p->>'district') limit 1;
        if mk is null then
          insert into brain_markets (country_code, city, district, parent_id, currency, coverage)
          values (country.country_code, p->>'city', p->>'district', city_id, country.currency, 'researched') returning id into mk;
        end if;
      end if;
    end if;
  else
    mk := null;
  end if;

  select id into old_id from brain_parameter_values
   where parameter_key = prm.key and coalesce(market_id::text, '') = coalesce(mk::text, '')
     and coalesce(format_key, '') = coalesce(fmt, '') and qualifier = q and status in ('researched', 'verified')
   for update;
  if old_id is not null then update brain_parameter_values set status = 'superseded' where id = old_id; end if;

  insert into brain_parameter_values (
    parameter_key, market_id, format_key, qualifier, value_num, low, high, value_json, value_text, unit, currency,
    source_class, status, source_name, source_url, source_published_at, observed_at, confidence,
    researched_by, reviewer, reviewed_at, review_note, supersedes_id)
  values (
    prm.key, mk, fmt, q, (p->>'value_num')::numeric, (p->>'low')::numeric, (p->>'high')::numeric,
    case when p ? 'value_json' and p->'value_json' <> 'null'::jsonb then p->'value_json' else null end,
    nullif(p->>'value_text', ''), coalesce(nullif(p->>'unit', ''), prm.unit), nullif(upper(p->>'currency'), ''),
    p->>'source_class', p->>'status', nullif(p->>'source_name', ''), nullif(p->>'source_url', ''),
    (nullif(p->>'source_published_at', ''))::date, coalesce((nullif(p->>'observed_at', ''))::date, current_date),
    coalesce(nullif(p->>'confidence', ''), 'medium'), 'brain_inbox',
    nullif(p->>'reviewer', ''), case when p->>'status' = 'verified' then now() else null end,
    nullif(p->>'review_note', ''), old_id)
  returning id into new_id;

  -- A regulatory value added without validation joins Arnaud's review list (Brain rule 8).
  if prm.regulatory and p->>'status' = 'researched' then
    insert into brain_review_queue (value_id, parameter_key, reason, detail, status)
    values (new_id, prm.key, 'regulatory', jsonb_build_object('from', 'brain_inbox', 'item_id', p->>'item_id'), 'open');
  end if;
  return new_id;
end $$;
revoke all on function public.brain_add_value(jsonb) from public, anon, authenticated;
