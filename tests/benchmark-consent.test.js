'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const BC = require('../lib/benchmark-consent.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('only an explicit true stores a consent date', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  assert.deepStrictEqual(BC.consentFields(true, now), { benchmark_consent_at: '2026-11-12T10:00:00.000Z' });
  for (const v of [false, undefined, null, 'true', 1, 'on', '']) assert.deepStrictEqual(BC.consentFields(v, now), {});
});

test('consent box is present, unticked by default, on both forms', () => {
  for (const [f, id] of [['validator.html', 'benchmark-consent'], ['bp-intake.html', 'benchmarkConsent']]) {
    const h = read(f);
    const m = h.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
    assert.ok(m, f + ': checkbox missing');
    assert.ok(!/checked/.test(m[0]), f + ': must be unticked by default');
    assert.ok(/data-en/.test(h.slice(h.indexOf(id) - 200, h.indexOf(id) + 800)) && /data-fr/.test(h.slice(h.indexOf(id), h.indexOf(id) + 800)), f + ': EN+FR text');
    assert.ok(h.includes('/privacy#benchmarks'), f + ': link to privacy line');
  }
});

test('privacy page carries the line in FR and EN', () => {
  const h = read('privacy.html');
  assert.ok(h.includes('id="benchmarks"'));
  assert.ok(/anonymised and aggregated/.test(h) && /anonymisés et agrégés/.test(h));
});

test('validator sends the flag; submit stores it only through consentFields; webhook copies it to the project', () => {
  assert.ok(/data\.benchmark_consent\s*=\s*!!document\.getElementById\('benchmark-consent'\)\.checked/.test(read('validator.html')));
  assert.ok(/BC\.consentFields\(data\.benchmark_consent\)/.test(read('api/submit-validator.js')));
  const w = read('api/webhook-validator.js');
  assert.ok(/submission\.benchmark_consent_at/.test(w) && /\.is\('benchmark_consent_at', null\)/.test(w));
});

test('intake: consent stored on the project, withdrawn when unticked, ignored when absent', () => {
  const a = read('api/bp-intake.js');
  assert.ok(/typeof body\.benchmark_consent === 'boolean'/.test(a));
  assert.ok(/wanted \? new Date\(\)\.toISOString\(\) : null/.test(a));
  assert.ok(/\$\('benchmarkConsent'\)\.checked/.test(read('bp-intake.html')));
});
