/* Run: node --test tests/*.test.js
 * Readiness review (29 Oct 2026): required points by verdict; amended opening hours reach the services.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CR = require('../lib/concept-record.js');

const items = [
  { risk_key: 'r1', category: 'risk', rank: 2 }, { risk_key: 'r2', category: 'risk', rank: 1 },
  { risk_key: 'r3', category: 'risk', rank: 3 }, { risk_key: 'r4', category: 'risk', rank: 4 },
  { risk_key: 'a1', category: 'financial_alert', severity: 'HIGH' }, { risk_key: 'a2', category: 'financial_alert', severity: 'MEDIUM' },
];

test('required points follow the verdict', async () => {
  const { requiredItemKeys } = await import('../lib/crr-review.js');
  assert.deepEqual([...requiredItemKeys(items, 'STRONG')], []);
  assert.deepEqual([...requiredItemKeys(items, 'VIABLE')].sort(), ['a1', 'r2']);
  assert.deepEqual([...requiredItemKeys(items, 'FRAGILE')].sort(), ['a1', 'r1', 'r2', 'r3']);
  assert.equal(requiredItemKeys(items, 'HIGH_RISK').size, items.length);
  assert.equal(requiredItemKeys(items, 'something else').size, items.length);
});

test('amended opening hours change the days of the existing services only', () => {
  const rec = { services: [{ id: 'lunch', days: [2, 3, 4, 5, 6], ticket: 160, covers: 40 }, { id: 'dinner', days: [2, 3, 4, 5, 6], ticket: 320, covers: 45 }] };
  const r = CR.applyAmendments(rec, [{ field_key: 'opening_hours', amendment_status: 'active',
    amended_value: 'Matin : lun ; Déjeuner : lun, mar, mer, jeu, ven, sam ; Soir : mer, jeu, ven, sam' }]);
  assert.deepEqual(r.services.map((s) => s.id), ['lunch', 'dinner']);
  assert.deepEqual(r.services[0].days, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(r.services[1].days, [3, 4, 5, 6]);
  assert.equal(r.services[0].ticket, 160);
});
