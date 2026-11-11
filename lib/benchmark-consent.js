// lib/benchmark-consent.js — D9 consent box (benchmark-1.0.0)
// The box is unticked by default; only an explicit `true` records a consent date. Anything else stores nothing.
'use strict';

/** ISO date to store for a submitted flag: only boolean true counts. */
function consentDate(flag, now = new Date()) {
  return flag === true ? now.toISOString() : null;
}

/** Fields to spread into an insert: nothing at all when not ticked (so a missing column never blocks an unticked purchase). */
function consentFields(flag, now) {
  const d = consentDate(flag, now);
  return d ? { benchmark_consent_at: d } : {};
}

module.exports = { consentDate, consentFields };
