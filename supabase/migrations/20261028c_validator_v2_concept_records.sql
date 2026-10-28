-- 20261028c_validator_v2_concept_records.sql — Concept Validator v2 (val-2.0.0)
-- 1. concept_records: the single concept record per project (master strategy v1.6 §16), versioned.
--    Written by the Validator form (webhook), read by the Validator, the readiness review re-assessment and the BP intake.
--    RLS enabled, no policies (service key only).
-- 2. validator_submissions.concept_v2: the structured answers of the v2 form (lib/concept-record.js normalizeForm).
-- 3. validator_reports.generation_claim: atomic claim for api/generate-validator.js (previews, recovery runs).

begin;

create table if not exists concept_records (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references za3fran_projects(id) on delete cascade,
  version     integer not null check (version >= 1),
  data        jsonb not null,
  source      text not null check (source in ('validator_form', 'readiness_review', 'migration', 'bp_intake')),
  schema      text not null,
  note        text,
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);
create index if not exists concept_records_project_idx on concept_records (project_id, version desc);
alter table concept_records enable row level security;

alter table validator_submissions add column if not exists concept_v2 jsonb;
alter table validator_reports add column if not exists generation_claim text;

commit;

-- Applied separately the same day (validator_reports_html_nullable): a v2 report row may exist before its HTML
-- (api/generate-validator.js previews and recovery runs); the viewer shows a "being prepared" page meanwhile.
alter table validator_reports alter column report_html drop not null;
