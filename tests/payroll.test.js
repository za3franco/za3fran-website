// Payroll conversions (lib/payroll.js, pr-1.0.0) on the Morocco 2026 rules, the intake's net salary (bpi-1.6.0),
// and the intake page's inline copy of the calculation.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../lib/payroll');
const I = require('../lib/bp-intake');
const R = require('./fixtures/payroll-rules-ma-2026');

test('gross -> net, hand-checked cases (Morocco 2026)', () => {
  // 10,000 gross: CNSS 6,000 x 4.48% = 268.80; AMO 226; prof. expenses 25% x 120,000 = 30,000;
  // taxable 120,000 - 30,000 - 3,225.60 - 2,712 = 84,062.40 -> IR 30% - 18,000 = 7,218.72 a year = 601.56 a month.
  const a = P.grossToNet(10000, R);
  assert.strictEqual(a.social_total, 494.8);
  assert.strictEqual(a.income_tax, 601.56);
  assert.strictEqual(a.net, 8903.64);
  // 6,000 gross: prof. expenses 35% (72,000 <= 78,000); taxable 41,947.20 -> IR 194.72 a year.
  assert.strictEqual(P.grossToNet(6000, R).income_tax, 16.23);
  // Below the exemption threshold: no income tax.
  assert.strictEqual(P.grossToNet(3422.72, R).income_tax, 0);
  // Professional expenses capped at 35,000 a year.
  assert.strictEqual(P.grossToNet(20000, R).prof_expenses_annual, 35000);
});

test('net -> gross is the inverse of gross -> net (rounded up to the unit)', () => {
  for (const n of [3000, 4200, 5600, 8000, 8903.64, 12000, 25000]) {
    const c = P.netToGross(n, R);
    assert.ok(c.net >= n - 0.01, `net ${c.net} >= ${n}`);
    assert.ok(P.grossToNet(c.gross - 1, R).net < n, `gross ${c.gross} is the smallest unit giving ${n}`);
  }
  assert.strictEqual(P.netToGross(8903.64, R).gross, 10000);
});

test('dependents lower the tax, capped', () => {
  const none = P.grossToNet(15000, R).income_tax;
  assert.ok(Math.abs((none - P.grossToNet(15000, R, { dependents: 2 }).income_tax) - 1000 / 12) < 0.011);
  assert.strictEqual(P.grossToNet(15000, R, { dependents: 9 }).income_tax, P.grossToNet(15000, R, { dependents: 6 }).income_tax);
});

test('intake: a salary entered net reaches the engine as gross, with the conversion noted', () => {
  const { intake, errors } = I.normalizeIntake({ founder_works: 'yes', founder_salary: '8 000', founder_salary_basis: 'net', roster_mode: 'founder', roster: [] }, { payroll: R });
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(intake.ui.founder_salary, 8000);
  assert.strictEqual(intake.ui.founder_salary_basis, 'net');
  assert.strictEqual(intake.founder.monthly_gross, P.netToGross(8000, R).gross);
  const row = intake.roster.find((x) => x.role === 'founder');
  assert.strictEqual(row.monthly_gross, intake.founder.monthly_gross);
  assert.match(row.note, /entered net 8000, gross \d+/);
});

test('intake: gross stays as entered; net without payroll rules is refused', () => {
  const g = I.normalizeIntake({ founder_works: 'yes', founder_salary: '9000', roster_mode: 'founder', roster: [] });
  assert.strictEqual(g.intake.founder.monthly_gross, 9000);
  assert.strictEqual(g.intake.ui.founder_salary_basis, 'gross');
  const n = I.normalizeIntake({ founder_works: 'yes', founder_salary: '9000', founder_salary_basis: 'net', roster_mode: 'founder', roster: [] });
  assert.ok(n.errors.some((e) => e.path === 'founder_salary' && e.code === 'net_not_available'));
  assert.strictEqual(n.intake.founder.monthly_gross, undefined);
});

test('intake page: inline calculation equals lib/payroll.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'bp-intake.html'), 'utf8');
  const m = html.match(/\/\* payroll:start \*\/([\s\S]*?)\/\* payroll:end \*\//);
  assert.ok(m, 'payroll block present in bp-intake.html');
  const f = new Function(`${m[1]}; return { payGrossToNet, payNetToGross };`)();
  for (const g of [3422.72, 6000, 7999, 10000, 14498, 30000]) assert.strictEqual(f.payGrossToNet(g, R), P.grossToNet(g, R).net, `gross ${g}`);
  for (const n of [4200, 8000, 12000, 20000]) assert.strictEqual(f.payNetToGross(n, R), P.netToGross(n, R).gross, `net ${n}`);
});
