# Assumption resolver — ar-1.0.0

`lib/assumption-resolver.js` · tests: `tests/assumption-resolver.test.js` (Brain data in `tests/fixtures/resolver-brain-test.js` is TEST DATA) · status: **built, not yet wired to any tool**

## Contract
`resolveAssumptions({ concept, intake, market, format, brain })` is pure. It returns `status` ('ready' | 'blocked'),
`inputs` (ranged, for `runScenarios()`; null when blocked), `assumptions` (appendix rows), `review` (queue rows),
`flags`, `gaps` and `impact`. Database helpers take the Supabase client from the caller: `findMarketChain()`,
`loadBrainContext()`, `persistResolution()` (writes `project_assumptions`, adds only review items not already open).

## Resolution
Founder figure (intake, then effective concept) → Za3fran verified → published → estimate. Within one class the most
specific market wins (district → city → country). A lapsed verification arrives as published (`brain_values_effective`).
A founder figure is a plain number; a Brain value is a range `{base, low, high, fav}` so it reaches the scenarios.
A founder figure outside the Brain's range is used, and raised as `founder_evidence` (never overwrites the profile).
A Brain value outside hard plausibility bounds is not used: `out_of_range` review item, and a blocking gap if required.

## Founder covers
Converted to occupancy per service with `checkClaimedCovers()` (equal split over the week's services). Capped at the
85% cruise rule in **every** scenario; the claim is kept in the flag and the appendix note. Without a founder figure,
occupancy comes from the format benchmark per service.

## Review queue (only the recommended list)
`regulatory` (unverified regulatory value used) · `impact_over_5pct` (moving that value alone to its unfavourable end
shifts total investment, or year-2 operating break-even in revenue or covers, by more than 5%) · `out_of_range` ·
`founder_evidence`. One open item per value and reason.

## Blocking gaps (plan cannot be generated)
Opening month, seats, services, roster, investment lines, rent (offer or surface), equity, and any required tax or
benchmark with no source. Roster and investment are founder-only until staffing and pre-opening benchmarks exist.

## Pending
Depreciation lives by category (`DEPRECIATION_YEARS`) are proposals awaiting Arnaud's review.
