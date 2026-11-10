-- Payments taken outside Stripe (YouCan Pay, payments in MAD) — lib/payments.js, lib/payment-fulfil.js.
-- One row per checkout; id = our order id at YouCan Pay. status: pending → paid (atomic claim) | failed.
create table if not exists public.payments (
  id              text primary key,
  provider        text not null check (provider in ('youcanpay')),
  kind            text not null check (kind in ('validator', 'business_plan', 'menu_engineer')),
  product         text not null,
  amount_minor    bigint not null check (amount_minor > 0),
  currency        text not null,
  email           text,
  meta            jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  sandbox         boolean not null default false,
  provider_token  text,
  provider_tx_id  text,
  confirmed_by    text,
  versions        jsonb,
  fulfil_error    text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  fulfilled_at    timestamptz
);
create index if not exists payments_status_created_idx on public.payments (status, created_at desc);
alter table public.payments enable row level security;  -- service key only, no policies
