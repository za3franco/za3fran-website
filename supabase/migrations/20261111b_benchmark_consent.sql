-- D9: founders' own figures as anonymised benchmarks — consent recorded with its date.
-- Unticked by default (null). Stored on the submission (Validator path) and on the project (copied by the webhooks; set by the BP intake).
alter table public.validator_submissions add column if not exists benchmark_consent_at timestamptz;
alter table public.za3fran_projects     add column if not exists benchmark_consent_at timestamptz;
comment on column public.za3fran_projects.benchmark_consent_at is 'D9: date the founder agreed that his figures, anonymised and aggregated, serve as a benchmark. Null = no consent. Test projects are excluded from any aggregation.';
