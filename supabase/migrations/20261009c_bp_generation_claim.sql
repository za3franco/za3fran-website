-- Business Plan v14: atomic claim of a generation run (compare-and-set on this column).
-- api/generate-bp.js writes a fresh token when it starts a run; a concurrent call whose
-- expected token no longer matches updates no row and backs off.
alter table public.business_plan_essentials_runs add column if not exists generation_claim text;
