/* Canaille intake after the ar-1.6.0 decisions (illustrative, for tests): the submitted intake of 9 Oct 2026
 * plus the licence cost (the founder's own 350,000 MAD cap) and funding raised so the cash reserve meets the
 * target (3 months of fixed costs). The investor amount is a test value, not Arnaud's answer. */
'use strict';
const base = require('./canaille-intake-submitted-2026-10-09.js');
module.exports = {
  ...base,
  licence: { amount: 350000, note: 'Reprise de licence, plafond du porteur de projet' },
  shareholders: [{ label: 'Founder', amount: 400000 }, { label: 'Shareholder investor', amount: 1319000 }],
  reserve_choice: 'include', capital_choice: 'face',
};
