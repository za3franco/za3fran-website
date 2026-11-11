-- Sales entered by hand in /pilotage (accompaniment, consulting, mystery guest, design…), so the
-- dashboard shows the whole revenue, not only the online payments. RLS on, no policies (service key).
create table if not exists public.offline_sales (
  id           uuid primary key default gen_random_uuid(),
  sold_on      date not null,
  kind         text not null check (kind in ('accompagnement', 'conseil', 'client_mystere', 'design', 'autre')),
  client       text,
  email        text,
  amount_minor bigint not null check (amount_minor > 0),
  currency     text not null default 'MAD' check (currency in ('MAD', 'EUR', 'USD')),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists offline_sales_sold_on_idx on public.offline_sales (sold_on desc);
alter table public.offline_sales enable row level security;
