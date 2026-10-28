-- Per-run snapshot of the figures behind a Business Plan run (Phase A, step 5).
-- Lets the designed deliverables (plan PDF, teaser, deck, Excel workbook) be produced after generation from exactly
-- the same facts and engine output as the viewer, without re-running the engine or the model.
-- RLS enabled, no policies: service key only (project rule for new tables).

create table if not exists public.bp_run_snapshots (
  run_id      text primary key references public.business_plan_essentials_runs(id) on delete cascade,
  project_id  uuid not null,
  facts       jsonb not null,            -- lib/bp-facts.js buildFacts() output (F values, tables, chart, bankRisks, meta)
  engine      jsonb not null,            -- { inputs, base, conservative, optimistic } from lib/financial-engine.js
  contact     jsonb,                     -- founder contact printed on the teaser and the deck (from the intake)
  versions    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists bp_run_snapshots_project_idx on public.bp_run_snapshots (project_id);

alter table public.bp_run_snapshots enable row level security;

comment on table public.bp_run_snapshots is
  'Frozen facts + engine output of one business plan run; source of the PDF, teaser, deck and workbook. Written by api/generate-bp.js.';
