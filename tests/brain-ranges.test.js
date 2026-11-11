'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const R = require('../lib/brain-ranges.js');

test('12 formats, every one a catalogue slug', () => {
  assert.strictEqual(R.FORMATS.length, 12);
  assert.strictEqual(new Set(R.FORMATS).size, 12);
});

test('payloads: estimate class, low confidence, researched, midpoint inside the range', () => {
  const { payloads, errors } = R.buildPayloads('bistro-brasserie', {
    ticket_dinner: { low: '300', high: '500' }, ticket_lunch: { low: '', high: '' }, seats: { low: '60', high: '' },
  }, new Date('2026-11-12T08:00:00Z'));
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(payloads.length, 2);   // the empty lunch field writes nothing
  const d = payloads.find((p) => p.qualifier === 'dinner');
  assert.strictEqual(d.parameter_key, 'concept.ticket');
  assert.strictEqual(d.value_num, 400); assert.strictEqual(d.low, 300); assert.strictEqual(d.high, 500);
  assert.strictEqual(d.currency, 'MAD'); assert.strictEqual(d.source_class, 'estimate');
  assert.strictEqual(d.status, 'researched'); assert.strictEqual(d.confidence, 'low'); assert.strictEqual(d.format_key, 'bistro-brasserie');
  const s = payloads.find((p) => p.parameter_key === 'concept.seats');
  assert.strictEqual(s.low, 60); assert.strictEqual(s.high, 60); assert.strictEqual(s.currency, null);
});

test('swapped bounds are put right; nonsense and unknown formats are refused', () => {
  const ok = R.buildPayloads('burger', { surface_m2: { low: '120', high: '80' } });
  assert.strictEqual(ok.payloads[0].low, 80); assert.strictEqual(ok.payloads[0].high, 120);
  assert.strictEqual(R.buildPayloads('burger', { seats: { low: 'abc', high: '' } }).errors[0].error, 'not_a_number');
  assert.strictEqual(R.buildPayloads('burger', { ticket_lunch: { low: '1', high: '2' } }).errors[0].error, 'out_of_bounds');
  assert.strictEqual(R.buildPayloads('nope', {}).errors[0].error, 'unknown_format');
});

test('app and API are wired, migration declares the three parameters', () => {
  const h = fs.readFileSync(__dirname + '/../brain.html', 'utf8');
  assert.ok(h.includes('data-v="ranges"') && h.includes('id="v-ranges"'));
  const a = fs.readFileSync(__dirname + '/../api/brain-inbox.js', 'utf8');
  assert.ok(/action === 'ranges'/.test(a) && /case 'range':/.test(a));
  const m = fs.readFileSync(__dirname + '/../supabase/migrations/20261111c_concept_ranges_params.sql', 'utf8');
  ['concept.ticket', 'concept.seats', 'concept.surface_m2'].forEach((k) => assert.ok(m.includes("'" + k + "'")));
});
