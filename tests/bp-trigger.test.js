/* Run: node --test tests/*.test.js
 * lib/bp-trigger.js: the plan starts only when the review is cleared AND the figures are submitted.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeSupabase(db) {
  return {
    from(table) {
      const q = { _t: table,
        select() { return q; }, eq() { return q; }, order() { return q; },
        limit() { return Promise.resolve({ data: db[table] ? [].concat(db[table]) : [] }); },
        maybeSingle() { return Promise.resolve({ data: db[table] || null }); } };
      return q;
    },
  };
}

test('waits for the review, then for the figures, then starts', async () => {
  const { triggerBpIfReady } = await import('../lib/bp-trigger.js');
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return { status: 200 }; };
  const base = { business_plan_essentials_runs: { id: 'bp_1', output_html: null, output_json: { status: 'pending' } } };

  let r = await triggerBpIfReady(fakeSupabase({ ...base, za3fran_projects: { id: 'p', access_code: 'ABC', crr_status: 'pending' }, bp_intakes: { status: 'submitted' } }), 'p');
  assert.equal(r.reason, 'review_pending');
  r = await triggerBpIfReady(fakeSupabase({ ...base, za3fran_projects: { id: 'p', access_code: 'ABC', crr_status: 'cleared' }, bp_intakes: { status: 'draft' } }), 'p');
  assert.equal(r.reason, 'figures_pending');
  assert.equal(calls.length, 0);
  r = await triggerBpIfReady(fakeSupabase({ ...base, za3fran_projects: { id: 'p', access_code: 'ABC', crr_status: 'cleared' }, bp_intakes: { status: 'submitted' } }), 'p');
  assert.equal(r.triggered, true);
  await new Promise((ok) => setTimeout(ok, 10));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/generate-bp\?id=bp_1&code=ABC$/);
});

test('never starts a plan already generated or generating', async () => {
  const { triggerBpIfReady } = await import('../lib/bp-trigger.js');
  global.fetch = async () => { throw new Error('should not be called'); };
  const ok = { za3fran_projects: { id: 'p', access_code: 'ABC', crr_status: 'cleared' }, bp_intakes: { status: 'submitted' } };
  let r = await triggerBpIfReady(fakeSupabase({ ...ok, business_plan_essentials_runs: { id: 'b', output_html: '<html>', output_json: {} } }), 'p');
  assert.equal(r.reason, 'already_generated');
  r = await triggerBpIfReady(fakeSupabase({ ...ok, business_plan_essentials_runs: { id: 'b', output_html: null, output_json: { status: 'generating' } } }), 'p');
  assert.equal(r.reason, 'generating');
});
