-- Business Plan intake (Phase A, task 4) — one intake per project.
-- The intake object is the contract documented at the top of lib/assumption-resolver.js (ar-1.4.x).
-- RLS enabled, no policies: service key only (project rule for new tables).

create table if not exists public.bp_intakes (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null unique references public.za3fran_projects(id) on delete cascade,
  intake           jsonb not null default '{}'::jsonb,
  status           text not null default 'draft'
                   check (status in ('draft', 'submitted', 'awaiting_estimates')),
  -- what the founder was shown at the last "check my figures" (engine output summary)
  preview          jsonb,
  resolver_version text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  submitted_at     timestamptz
);

alter table public.bp_intakes enable row level security;

comment on table public.bp_intakes is
  'BP intake per project (resolver contract). status: draft | submitted | awaiting_estimates (founder asked Za3fran for roster/investment estimates).';
