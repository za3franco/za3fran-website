-- 20261028_places_lookup_cap.sql — our own cap on Google Places lookups (lib/places.js pl-1.1.0).
-- Google's free trial does not allow lowering the Places quota (7,500/day), so the cap lives here:
-- at most 20 lookups per project per day and 300 in total per day. Only counters are stored, never
-- any Google content.
create table if not exists places_lookups (
  day date not null default (now() at time zone 'utc')::date,
  project_id uuid not null,
  count int not null default 0,
  primary key (day, project_id)
);
alter table places_lookups enable row level security;   -- service key only, no policies

-- Atomic claim: true when the lookup is allowed (and counted), false when a cap is reached.
create or replace function places_lookup_claim(p_project uuid, p_per_project int default 20, p_per_day int default 300)
returns boolean language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; total int; mine int;
begin
  perform pg_advisory_xact_lock(hashtext('places_lookup_claim'));
  select coalesce(sum(count), 0) into total from places_lookups where day = d;
  select coalesce(count, 0) into mine from places_lookups where day = d and project_id = p_project;
  if total >= p_per_day or coalesce(mine, 0) >= p_per_project then return false; end if;
  insert into places_lookups (day, project_id, count) values (d, p_project, 1)
    on conflict (day, project_id) do update set count = places_lookups.count + 1;
  return true;
end $$;
revoke all on function places_lookup_claim(uuid, int, int) from public, anon, authenticated;
