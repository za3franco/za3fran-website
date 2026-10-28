/* Dev tool: builds the Canaille workbook, recalculates it with LibreOffice and compares with the engine. */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const S = require('./canaille-sample.js');
const { buildWorkbook } = require('../../lib/bp-workbook.js');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const facts = S.make(process.argv[3] || 'fr', '2026-10-28');
  const buf = await buildWorkbook({ facts, engine: { inputs: S.res.inputs, base: S.sc.base, conservative: S.sc.conservative, optimistic: S.sc.optimistic }, contact: { name: 'Gauthier D', email: 'a@b.co' } });
  const f = path.join(out, 'wb.xlsx'); fs.writeFileSync(f, buf);
  fs.mkdirSync(path.join(out, 'lo'), { recursive: true });
  cp.execSync(`soffice --headless --convert-to xlsx --outdir ${path.join(out, 'lo')} ${f}`, { stdio: 'ignore', timeout: 120000 });
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(out, 'lo', 'wb.xlsx'));
  const get = (sheet, a1) => { const v = wb.getWorksheet(sheet).getCell(a1).value; return v && typeof v === 'object' && 'result' in v ? v.result : v; };
  let bad = 0;
  const eq = (label, a, b, tol = 1) => { const ok = Math.abs(Number(a) - Number(b)) <= tol; if (!ok) { bad++; console.log('MISMATCH', label, a, b); } };
  const names = wb.worksheets.map((w) => w.name); console.log(names.join(' | '));
  const B = S.sc.base; const pl = names[6];
  // find rows by label in the income statement
  const P = wb.getWorksheet(pl); const find = (re) => { let row = null; P.eachRow((r, n) => { if (!row && typeof r.getCell(1).value === 'string' && re.test(r.getCell(1).value)) row = n; }); return row; };
  const map = [[/^Chiffre d.affaires HT/, 'revenue'], [/^Marge brute/, 'gross_margin'], [/^Excédent brut/, 'ebitda'], [/^Résultat d.exploitation/, 'ebit'], [/^Charges d.intérêts/, 'interest'], [/^Résultat avant impôt/, 'profit_before_tax'], [/^Résultat net/, 'net_result'], [/^Service de la dette \(/, 'debt_service'], [/^DSCR/, 'dscr'], [/^Capital remboursé/, 'principal']];
  for (const [re, key] of map) { const row = find(re); [0, 1, 2].forEach((y) => eq(`${key} y${y + 1}`, P.getCell(row, 2 + y * 2).result !== undefined ? P.getCell(row, 2 + y * 2).result : P.getCell(row, 2 + y * 2).value, B.annual[y][key], key === 'dscr' ? 0.005 : 2)); }
  const C = wb.getWorksheet(names[7]);
  B.cash_plan.forEach((x, i) => eq('cash ' + x.month, get(names[7], 'I' + (5 + i)), x.balance, 3));
  const Y = wb.getWorksheet(names[0]); Y.eachRow((r) => { const a = r.getCell(1).value, b = r.getCell(2).value; if (a && b !== null && b !== undefined) console.log(String(a).padEnd(48), typeof b === 'object' && 'result' in b ? b.result : b); });
  console.log(bad ? `${bad} MISMATCHES` : 'ALL MATCH');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
