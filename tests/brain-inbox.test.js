// Brain Inbox (lib/brain-inbox.js, lib/brain-inbox-run.js — bi-1.0.0): access, checks on the model's output,
// review payloads, and the extraction flow on an in-memory database.
const test = require('node:test');
const assert = require('node:assert');
const BI = require('../lib/brain-inbox');
const RUN = require('../lib/brain-inbox-run');

const PARAMS = [
  { key: 'labour.salary_monthly', scope: 'local', unit: 'currency_per_month', value_type: 'number', qualifier_kind: 'role', label_fr: 'Salaire', regulatory: false },
  { key: 'property.rent_m2_month', scope: 'local', unit: 'currency_per_m2_month', value_type: 'number', qualifier_kind: 'district', label_fr: 'Loyer' },
  { key: 'benchmark.food_cost_pct', scope: 'format', unit: 'pct', value_type: 'number', qualifier_kind: null, label_fr: 'Coût matière' },
  { key: 'benchmark.turns', scope: 'format', unit: 'factor', value_type: 'number', qualifier_kind: 'service', label_fr: 'Rotations' },
  { key: 'labour.payroll_rules', scope: 'local', unit: 'json', value_type: 'json', qualifier_kind: null, label_fr: 'Paie' },
  { key: 'regulation.food_safety', scope: 'local', unit: 'text', value_type: 'text', qualifier_kind: null, label_fr: 'Sanitaire' },
];
const BY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

test('personal code and signed session cookie', () => {
  assert.ok(BI.codeMatches(' ab12cd34 ', 'AB12CD34'));
  assert.ok(!BI.codeMatches('AB12CD35', 'AB12CD34'));
  assert.ok(!BI.codeMatches('', ''));
  const t = Date.parse('2026-10-29T20:00:00Z');
  const s = BI.makeSession('secret', t);
  assert.ok(BI.sessionValid(s, 'secret', t + 364 * 86400000));
  assert.ok(!BI.sessionValid(s, 'secret', t + 366 * 86400000), 'one year, renewed at every opening of the app');
  assert.ok(!BI.sessionValid(s, 'other', t), 'other secret');
  const [exp, sig] = s.split('.');
  assert.ok(!BI.sessionValid((Number(exp) + 1e9) + '.' + sig, 'secret', t), 'tampered expiry');
  assert.match(BI.sessionCookie(s), /HttpOnly; Secure; SameSite=Lax; Max-Age=31536000/);
});

test('lockout: 5 failures lock for 30 minutes, then the count restarts', () => {
  const t = Date.parse('2026-10-29T20:00:00Z');
  let row = null;
  for (let i = 0; i < 5; i++) row = BI.afterFailure(row, t + i * 1000);
  assert.strictEqual(row.n, 5);
  assert.ok(row.locked_at);
  assert.ok(BI.lockState(row, t + 10 * 60000).locked);
  assert.strictEqual(BI.lockState(row, t + 10 * 60000).retryInMin, 21, 'locked at the 5th failure (t + 4 s)');
  assert.ok(!BI.lockState(row, t + 31 * 60000).locked);
  assert.strictEqual(BI.afterFailure(row, t + 31 * 60000).n, 1);
  assert.strictEqual(BI.afterFailure({ n: 3, updated_at: new Date(t).toISOString() }, t + 40 * 60000).n, 1, 'old failures expire');
  assert.strictEqual(BI.afterFailure({ n: 3, updated_at: new Date(t).toISOString() }, t + 60000, 20).locked_at, null);
});

test('only the listed senders reach the inbox', () => {
  const list = 'arnaudhebrard@gmail.com, hello@za3fran.io';
  assert.ok(BI.senderAllowed('Arnaud Hébrard <ArnaudHebrard@gmail.com>', list));
  assert.ok(BI.senderAllowed('hello@za3fran.io', list));
  assert.ok(!BI.senderAllowed('someone@gmail.com', list));
  assert.ok(!BI.senderAllowed('arnaudhebrard@gmail.com.evil.com', list));
  assert.ok(!BI.senderAllowed('', list));
});

test('file names, readable types, HTML to text', () => {
  assert.strictEqual(BI.safeName('Carte été 2026 (Gauthier).JPG'), 'Carte-ete-2026-Gauthier.JPG');
  assert.strictEqual(BI.readableAs('image/jpeg', 'x'), 'image');
  assert.strictEqual(BI.readableAs('', 'menu.PNG'), 'image');
  assert.strictEqual(BI.readableAs('application/pdf', 'x'), 'pdf');
  assert.strictEqual(BI.readableAs('image/heic', 'IMG.HEIC'), null);
  assert.strictEqual(BI.readableAs('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx'), null);
  const t = BI.htmlToText('<html><head><title>Loyers &amp; prix</title><script>x()</script></head><body><nav>menu</nav><p>Loyer&nbsp;: 150 MAD</p><p>Fin</p></body></html>');
  assert.match(t, /Loyer : 150 MAD\s+Fin/);
  assert.ok(!/x\(\)|menu/.test(t));
  assert.strictEqual(BI.pageTitle('<title>Loyers &amp; prix</title>'), 'Loyers & prix');
  assert.ok(BI.authorised({ subject: 'Fwd: note interne (autorisé)' }));
  assert.ok(!BI.authorised({ subject: 'autorisation de terrasse' }));
});

test('a fact fits a parameter exactly, or is kept as knowledge only', () => {
  const salary = BI.checkFact({ statement: 'Serveur 3 500-5 500 MAD net', parameter_key: 'labour.salary_monthly', country_code: 'ma', qualifier: 'server', low: 3500, high: 5500, unit: 'currency_per_month', currency: 'mad', basis: 'net' }, BY);
  assert.strictEqual(salary.parameter_key, 'labour.salary_monthly');
  assert.strictEqual(salary.country_code, 'MA');
  assert.strictEqual(salary.currency, 'MAD');
  const pct = BI.checkFact({ statement: 'Coût matière 30 %', parameter_key: 'benchmark.food_cost_pct', format_key: 'restaurant', value: 30, low: 28, high: 35, unit: 'pct' }, BY);
  assert.deepStrictEqual([pct.value_num, pct.low, pct.high], [0.3, 0.28, 0.35]);
  assert.strictEqual(pct.qualifier, '');
  const yearly = BI.checkFact({ statement: 'Loyer 1 800 MAD/m²/an', parameter_key: 'property.rent_m2_month', country_code: 'MA', value: 1800, unit: 'currency_per_m2_year', currency: 'MAD' }, BY);
  assert.strictEqual(yearly.parameter_key, null);
  assert.strictEqual(yearly.unmapped, 'unit_mismatch');
  assert.strictEqual(BI.checkFact({ statement: 'x', parameter_key: 'labour.payroll_rules', country_code: 'MA', value: 1 }, BY).unmapped, 'method_parameter');
  assert.strictEqual(BI.checkFact({ statement: 'x', parameter_key: 'nope', value: 1 }, BY).unmapped, 'unknown_parameter');
  assert.strictEqual(BI.checkFact({ statement: 'x', parameter_key: 'benchmark.food_cost_pct', value: 0.3, unit: 'pct' }, BY).unmapped, 'no_format');
  assert.strictEqual(BI.checkFact({ statement: 'x', parameter_key: 'benchmark.turns', format_key: 'restaurant', qualifier: 'brunch', value: 1.2, unit: 'factor' }, BY).unmapped, 'no_service');
  assert.strictEqual(BI.checkFact({ statement: 'x', parameter_key: 'labour.salary_monthly', country_code: 'MA', qualifier: 'server', value: 4000, unit: 'currency_per_month' }, BY).unmapped, 'no_currency');
  const district = BI.checkFact({ statement: 'Loyer Maârif', parameter_key: 'property.rent_m2_month', country_code: 'MA', city: 'Casablanca', district: 'Maârif', qualifier: 'Maârif', value: 150, unit: 'currency_per_m2_month', currency: 'MAD' }, BY);
  assert.strictEqual(district.qualifier, '', 'districts live in the market, not the qualifier');
  const text = BI.checkFact({ statement: 'Autorisation ONSSA requise', parameter_key: 'regulation.food_safety', country_code: 'MA' }, BY);
  assert.strictEqual(text.value_text, 'Autorisation ONSSA requise');
  assert.strictEqual(BI.checkFact({ statement: '' }, BY), null);
  const swapped = BI.checkFact({ statement: 'x', low: 9, high: 3 }, BY);
  assert.deepStrictEqual([swapped.low, swapped.high], [3, 9]);
});

test('employer and guest documents keep identification only; menus get a date and a stale flag', () => {
  const raw = { title: 'Note interne', kind: 'other', summary_fr: 'Document interne.', rights: { status: 'employer' }, facts: [{ statement: 'x', value: 1 }], menu: { venue: 'A', items: [{ dish: 'b', price: 1 }] } };
  const blocked = BI.normalizeExtraction(raw, PARAMS, {});
  assert.ok(blocked.blocked);
  assert.strictEqual(blocked.facts.length, 0);
  assert.strictEqual(blocked.menu, null);
  assert.strictEqual(blocked.destination, 'discard');
  const ok = BI.normalizeExtraction(raw, PARAMS, { authorised: true });
  assert.ok(!ok.blocked);
  assert.strictEqual(ok.rights, 'ok');
  assert.strictEqual(ok.facts.length, 1);
  assert.ok(BI.normalizeExtraction(Object.assign({}, raw, { rights: { status: 'guest_data' } }), PARAMS, { authorised: true }).blocked, 'guest data is never authorised');

  const menu = BI.normalizeExtraction({ kind: 'menu', rights: { status: 'ok' }, menu: { venue: 'Le Petit Bistro', city: 'Casablanca', country_code: 'ma', currency: 'mad', menu_date: '2024-11-01', menu_date_source: 'photo',
    items: [{ section: 'Plats', dish: 'Entrecôte', price: 185 }, { dish: 'Sans prix', price: null }, { dish: '', price: 3 }] } }, PARAMS, { now: '2026-10-29' });
  assert.strictEqual(menu.menu.items.length, 1);
  assert.strictEqual(menu.menu.currency, 'MAD');
  assert.ok(menu.menu.stale, '23 months old');
  const fresh = BI.normalizeExtraction({ rights: { status: 'ok' }, menu: { venue: 'X', items: [{ dish: 'Café', price: 18 }] } }, PARAMS, { now: '2026-10-29', senderDate: '2026-10-29' });
  assert.strictEqual(fresh.menu.menu_date, '2026-10-29');
  assert.strictEqual(fresh.menu.menu_date_source, 'sender');
  assert.ok(!fresh.menu.stale);
  assert.strictEqual(BI.normalizeExtraction({ rights: { status: 'weird' } }, PARAMS).rights, 'unclear');
});

test('approved fact -> Brain value: source class, status and the checks before writing', () => {
  const item = { id: 'i1', source_name: 'jobsquare.ma', url: 'https://jobsquare.ma/x', source_published_at: '2026-06-01', received_at: '2026-10-29T10:00:00Z' };
  const fact = { statement: 'Serveur', country_code: 'MA', qualifier: 'server', value_num: null, low: 3500, high: 5500, currency: 'MAD', basis: 'net', confidence: 'medium' };
  const a = BI.valuePayload(fact, item, BY['labour.salary_monthly'], 'add');
  assert.strictEqual(a.payload.source_class, 'published');
  assert.strictEqual(a.payload.status, 'researched');
  assert.strictEqual(a.payload.value_num, 4500, 'middle of the source range');
  assert.deepStrictEqual(a.payload.value_json, { basis: 'net' });
  assert.strictEqual(a.payload.reviewer, null);
  assert.strictEqual(a.payload.observed_at, '2026-06-01');
  const v = BI.valuePayload(fact, item, BY['labour.salary_monthly'], 'verify', 'arnaud');
  assert.strictEqual(v.payload.status, 'verified');
  assert.strictEqual(v.payload.reviewer, 'arnaud');
  assert.strictEqual(BI.valuePayload(Object.assign({}, fact, { basis: null }), item, BY['labour.salary_monthly'], 'add').error, 'no_basis');

  const note = { id: 'i2', received_at: '2026-10-29T10:00:00Z' };
  const own = { statement: 'Coût matière 31 %', format_key: 'restaurant', value_num: 0.31, low: null, high: null, qualifier: '' };
  assert.strictEqual(BI.valuePayload(own, note, BY['benchmark.food_cost_pct'], 'add').error, 'range_required');
  const mine = BI.valuePayload(own, note, BY['benchmark.food_cost_pct'], 'verify');
  assert.strictEqual(mine.payload.source_class, 'za3fran_verified');
  assert.strictEqual(mine.payload.observed_at, '2026-10-29');
  const est = BI.valuePayload(Object.assign({}, own, { low: 0.28, high: 0.34 }), note, BY['benchmark.food_cost_pct'], 'add');
  assert.strictEqual(est.payload.source_class, 'estimate');
  assert.strictEqual(est.payload.source_name, 'Arnaud (Brain Inbox note)');
  assert.strictEqual(BI.valuePayload(Object.assign({}, own, { value_num: 0.4, low: 0.28, high: 0.34 }), note, BY['benchmark.food_cost_pct'], 'verify').error, 'value_outside_range');
  assert.strictEqual(BI.valuePayload(own, note, BY['labour.payroll_rules'], 'add').error, 'method_parameter');
  assert.strictEqual(BI.valuePayload(own, note, null, 'add').error, 'no_parameter');
  Object.keys(BI.ERROR_FR).forEach((k) => assert.ok(BI.ERROR_FR[k].length > 10));
});

test('edits are checked like the model output', () => {
  const fact = { statement: 'Serveur 4 000', parameter_key: null, country_code: 'MA', qualifier: '', value_num: 4000, low: null, high: null, currency: 'MAD', quote: 'q', confidence: 'low' };
  const e = BI.applyEdits(fact, { parameter_key: 'labour.salary_monthly', qualifier: 'server', basis: 'net', unit: 'ignored' }, BY);
  assert.strictEqual(e.parameter_key, 'labour.salary_monthly');
  assert.strictEqual(e.unit, 'currency_per_month');
  assert.strictEqual(e.basis, 'net');
  assert.strictEqual(e.quote, 'q');
});

test('prompt lists the scalar parameters and the rules; model choice', () => {
  const s = BI.systemPrompt(PARAMS.map((p) => Object.assign({ qualifiers: p.key === 'labour.salary_monthly' ? ['chef', 'server'] : [] }, p)));
  assert.match(s, /labour\.salary_monthly .*known: chef, server/);
  assert.ok(!/labour\.payroll_rules/.test(s), 'method parameters are not offered');
  assert.match(s, /Never compute, convert/);
  const c = BI.userContent({ item: { source: 'email', received_at: '2026-10-29T10:00:00Z', subject: 'S', body_text: 'B', user_tags: [] }, files: [{ as: 'image', media_type: 'image/jpeg', data: 'AA' }, { as: 'pdf', name: 'a.pdf', data: 'BB' }, { as: null, name: 'a.docx' }] });
  assert.deepStrictEqual(c.map((b) => b.type), ['text', 'text', 'image', 'document', 'text', 'text']);
  const m = { fast: 'haiku', strong: 'sonnet' };
  assert.strictEqual(BI.chooseModel({}, m), 'haiku');
  assert.strictEqual(BI.chooseModel({ hasImages: true }, m), 'sonnet');
  assert.strictEqual(BI.chooseModel({ failedOnce: true }, m), 'sonnet');
  assert.deepStrictEqual(BI.parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => BI.parseJson('nothing'));
});

// ── In-memory Supabase (only what lib/brain-inbox-run.js uses) ─────────────────────────────────────────
function fakeDb(tables) {
  const db = JSON.parse(JSON.stringify(tables));
  const removed = [];
  let seq = 0;
  function q(name) {
    const st = { name, op: 'select', filters: [], patch: null, rows: null, single: false, head: false, count: false, limit: null };
    const rowsOf = () => (db[st.name] = db[st.name] || []);
    const match = (r) => st.filters.every((f) => f(r));
    const run = () => {
      let data;
      if (st.op === 'insert') { const ins = st.rows.map((r) => Object.assign({ id: 'id' + (++seq), status: r.status || 'proposed' }, r)); rowsOf().push(...ins); data = ins; }
      else if (st.op === 'update') { data = rowsOf().filter(match); data.forEach((r) => Object.assign(r, st.patch)); }
      else if (st.op === 'delete') { data = rowsOf().filter(match); db[st.name] = rowsOf().filter((r) => !match(r)); }
      else data = rowsOf().filter(match);
      if (st.limit) data = data.slice(0, st.limit);
      if (st.head) return { data: null, count: data.length, error: null };
      return { data: st.single ? (data[0] || null) : data.map((r) => Object.assign({}, r)), count: data.length, error: null };
    };
    const b = {
      select(_c, o) { if (st.op === 'select') st.op = 'select'; if (o && o.head) st.head = true; return b; },
      insert(rows) { st.op = 'insert'; st.rows = Array.isArray(rows) ? rows : [rows]; return b; },
      update(p) { st.op = 'update'; st.patch = p; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(k, v) { st.filters.push((r) => r[k] === v); return b; },
      neq(k, v) { st.filters.push((r) => r[k] !== v); return b; },
      in(k, v) { st.filters.push((r) => v.includes(r[k])); return b; },
      lt(k, v) { st.filters.push((r) => r[k] < v); return b; },
      is(k, v) { st.filters.push((r) => (r[k] ?? null) === v); return b; },
      order() { return b; }, limit(n) { st.limit = n; return b; },
      maybeSingle() { st.single = true; return b; },
      then(res, rej) { try { res(run()); } catch (e) { rej(e); } },
    };
    return b;
  }
  const storage = {
    from() {
      return {
        download: async (p) => (tables.__files && tables.__files[p] ? { data: { arrayBuffer: async () => tables.__files[p] } } : { error: { message: 'missing' } }),
        remove: async (paths) => { removed.push(...paths); return { data: paths }; },
      };
    },
  };
  return { client: { from: q, storage }, db, removed };
}

const BASE = () => ({
  brain_parameters: PARAMS,
  brain_parameter_values: [{ parameter_key: 'labour.salary_monthly', qualifier: 'server', status: 'researched' }],
  brain_inbox_facts: [], brain_menu_prices: [],
});

test('extraction flow: claim, model, facts stored, menu prices stored, item ready', async () => {
  const t = BASE();
  t.brain_inbox_items = [{ id: 'it1', source: 'email', status: 'received', attempts: 0, subject: 'Salaires', body_text: 'Serveur 3 500 à 5 500 MAD net', files: [], received_at: '2026-10-29T10:00:00Z', user_tags: [] }];
  const F = fakeDb(t);
  const calls = [];
  const callModel = async (model, system, content) => {
    calls.push(model);
    return { text: JSON.stringify({ title: 'Salaires HCR', kind: 'article', summary_fr: 'Résumé.', source: { name: 'jobsquare.ma', published_at: '2026-06-01' }, rights: { status: 'ok' }, tags: { markets: ['MA/Casablanca'], formats: ['restaurant', 'zz'], topics: ['salaires'] }, destination: 'benchmark',
      facts: [{ statement: 'Serveur 3 500-5 500 MAD net', parameter_key: 'labour.salary_monthly', country_code: 'MA', qualifier: 'server', low: 3500, high: 5500, unit: 'currency_per_month', currency: 'MAD', basis: 'net', confidence: 'medium' }],
      menu: { venue: 'Café X', currency: 'MAD', items: [{ dish: 'Espresso', price: 15 }] } }), usage: { input_tokens: 10 } };
  };
  const r = await RUN.processItem({ supabase: F.client, callModel, models: { fast: 'haiku', strong: 'sonnet' }, now: Date.parse('2026-10-29T10:01:00Z') }, 'it1');
  assert.deepStrictEqual(r, { ok: true, status: 'ready', model: 'haiku', facts: 1, menu: 1 });
  assert.deepStrictEqual(calls, ['haiku']);
  const it = F.db.brain_inbox_items[0];
  assert.strictEqual(it.status, 'ready');
  assert.strictEqual(it.attempts, 1);
  assert.strictEqual(it.source_name, 'jobsquare.ma');
  assert.deepStrictEqual(it.tags.formats, ['restaurant']);
  assert.strictEqual(F.db.brain_inbox_facts.length, 1);
  assert.strictEqual(F.db.brain_inbox_facts[0].basis, 'net');
  assert.strictEqual(F.db.brain_menu_prices[0].menu_date, '2026-10-29');
  // A second run is refused: the item is no longer waiting.
  assert.strictEqual((await RUN.processItem({ supabase: F.client, callModel, models: { fast: 'haiku', strong: 'sonnet' } }, 'it1')).status, 'not_claimed');
});

test('extraction flow: unusable fast answer escalates; employer document is reduced to its identification', async () => {
  const t = BASE();
  t.brain_inbox_items = [{ id: 'it2', source: 'email', status: 'received', attempts: 0, subject: 'Procédure interne', body_text: 'CONFIDENTIEL', files: [{ path: 'email/it2/1-a.docx', name: 'a.docx', type: 'application/msword' }], raw_path: 'email/it2/message.eml', received_at: '2026-10-29T10:00:00Z', user_tags: [] }];
  const F = fakeDb(t);
  const calls = [];
  const callModel = async (model) => {
    calls.push(model);
    if (model === 'haiku') return { text: 'Sorry, I cannot', usage: {} };
    return { text: JSON.stringify({ title: 'Procédure interne', kind: 'other', summary_fr: 'Document interne d\'entreprise.', rights: { status: 'employer' } }), usage: {} };
  };
  const r = await RUN.processItem({ supabase: F.client, callModel, models: { fast: 'haiku', strong: 'sonnet' } }, 'it2');
  assert.strictEqual(r.status, 'refused');
  assert.deepStrictEqual(calls, ['haiku', 'sonnet']);
  const it = F.db.brain_inbox_items[0];
  assert.strictEqual(it.body_text, null);
  assert.strictEqual(it.raw_path, null);
  assert.ok(it.files[0].deleted_at);
  assert.deepStrictEqual(F.removed.sort(), ['email/it2/1-a.docx', 'email/it2/message.eml']);
  assert.strictEqual(F.db.brain_inbox_facts.length, 0);
});

test('extraction flow: a model failure leaves the item in error for the scheduled retry', async () => {
  const t = BASE();
  t.brain_inbox_items = [{ id: 'it3', source: 'app', status: 'received', attempts: 0, body_text: 'note', files: [], received_at: '2026-10-29T10:00:00Z', user_tags: [] }];
  const F = fakeDb(t);
  const r = await RUN.processItem({ supabase: F.client, callModel: async () => { throw new Error('overloaded'); }, models: { fast: 'haiku', strong: 'sonnet' } }, 'it3');
  assert.strictEqual(r.status, 'error');
  assert.strictEqual(F.db.brain_inbox_items[0].status, 'error');
  assert.deepStrictEqual(await RUN.pendingIds(F.client), ['it3']);
  F.db.brain_inbox_items[0].attempts = 3;
  assert.deepStrictEqual(await RUN.pendingIds(F.client), [], 'three tries at most');
});

test('menu photos are deleted once their prices are reviewed, not before', async () => {
  const t = BASE();
  t.brain_inbox_items = [{ id: 'm1', kind: 'menu', status: 'ready', files: [{ path: 'app/m1/1-carte.jpg', name: 'carte.jpg', type: 'image/jpeg' }, { path: 'app/m1/2-a.pdf', name: 'a.pdf', type: 'application/pdf' }] }];
  t.brain_menu_prices = [{ id: 'p1', item_id: 'm1', status: 'proposed' }];
  const F = fakeDb(t);
  assert.strictEqual(await RUN.sweepMenuPhotos(F.client, 'm1'), 0);
  F.db.brain_menu_prices[0].status = 'added';
  assert.strictEqual(await RUN.sweepMenuPhotos(F.client, 'm1'), 1);
  assert.deepStrictEqual(F.removed, ['app/m1/1-carte.jpg']);
  assert.ok(F.db.brain_inbox_items[0].files[0].deleted_at);
  assert.ok(!F.db.brain_inbox_items[0].files[1].deleted_at, 'only the photos');
});

// ── Monthly regulatory watch (lib/brain-watch.js, bw-1.0.0) ───────────────────────────────────────────
const BW = require('../lib/brain-watch');
const REGS = [
  { key: 'labour.minimum_wage_monthly', label_fr: 'Salaire minimum (mensuel)', unit: 'currency_per_month', value_type: 'number', value_num: 3422.72, currency: 'MAD', observed_at: '2026-10-03', source_name: 'BO 7469' },
  { key: 'tax.vat_food_service', label_fr: 'TVA sur la restauration', unit: 'pct', value_type: 'number', value_num: 0.1, currency: null, observed_at: '2026-10-03', source_name: 'CGI' },
  { key: 'tax.corporate_brackets', label_fr: 'Barème IS', unit: 'json', value_type: 'json', value_num: null, observed_at: '2026-10-03', source_name: 'CGI' },
];

test('watch: only sourced, real changes become items; figures copied, never computed', () => {
  const p = BW.prompts(REGS, 'Morocco', '2026-11-01');
  assert.match(p.user, /labour\.minimum_wage_monthly .* current value 3422\.72 MAD/);
  assert.match(p.system, /Never guess, never compute/);
  const raw = BW.parse('Here: {"changes":[' +
    '{"key":"labour.minimum_wage_monthly","new_value":3600,"effective_date":"2027-01-01","source_name":"BO n° 7600","source_url":"https://www.sgg.gov.ma/x","summary_fr":"Le SMIG passe à 3 600 MAD au 1er janvier 2027.","confidence":"high"},' +
    '{"key":"tax.vat_food_service","new_value":10,"source_name":"DGI","source_url":"https://tax.gov.ma"},' +
    '{"key":"tax.corporate_brackets","new_value":null,"source_name":"LF 2027","source_url":"https://x.ma","summary_fr":"Nouveau barème IS."},' +
    '{"key":"unknown","new_value":1,"source_name":"x","source_url":"https://x"},' +
    '{"key":"labour.minimum_wage_monthly","new_value":3700,"source_name":"blog"}' +
    '],"notes_fr":"ok"}');
  const ch = BW.checkChanges(raw, REGS);
  assert.deepStrictEqual(ch.map((c) => c.reg.key), ['labour.minimum_wage_monthly', 'tax.corporate_brackets'], 'VAT 10 % unchanged, unknown key and unsourced change dropped');
  const { item, fact } = BW.itemFor(ch[0], 'MA', '2026-11-01');
  assert.strictEqual(item.status, 'ready');
  assert.strictEqual(item.contributor, 'veille-claude');
  assert.strictEqual(item.source_name, 'BO n° 7600');
  assert.match(item.summary, /Valeur actuelle du Brain : 3[\s ]422,72 MAD/);
  assert.match(item.summary, /En vigueur le 2027-01-01/);
  assert.strictEqual(fact.parameter_key, 'labour.minimum_wage_monthly');
  assert.strictEqual(fact.value_num, 3600);
  assert.strictEqual(fact.currency, 'MAD');
  assert.strictEqual(fact.observed_at, '2027-01-01');
  const rules = BW.itemFor(ch[1], 'MA', '2026-11-01');
  assert.strictEqual(rules.fact.parameter_key, null, 'structured rules: kept as knowledge, updated by Claude in a chat');
  assert.strictEqual(rules.item.destination, 'method');
  // The fact passes the same review path as any inbox fact.
  const pay = BI.valuePayload(Object.assign({}, fact), Object.assign({ id: 'w1' }, item), { key: 'labour.minimum_wage_monthly', scope: 'local', unit: 'currency_per_month', value_type: 'number' }, 'verify', 'arnaud');
  assert.strictEqual(pay.payload.source_class, 'published');
  assert.strictEqual(pay.payload.status, 'verified');
  assert.strictEqual(BW.answerText([{ type: 'server_tool_use' }, { type: 'text', text: '{"a":' }, { type: 'web_search_tool_result' }, { type: 'text', text: '1}' }]), '{"a":1}');
});
