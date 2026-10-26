// Run with: node tests/engine.test.js
'use strict';
const assert = require('assert');
const E = require('../engine.js')();

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('2026 single brackets', () => {
  // $100k ordinary income, under 65: taxable 83,900.
  const c = E.prepare({ filing: 'single', state: 'TX', retireState: 'TX' });
  const out = {};
  E.retireTax(c, 100000, 0, 0, 0, 0, 50, 2030, 1, out);
  near(out.fed, 1240 + 38000 * 0.12 + 33500 * 0.22, 0.01);
  assert.strictEqual(out.state, 0);
});

test('2026 MFJ brackets and standard deduction', () => {
  const c = E.prepare({ filing: 'mfj' });
  const out = {};
  E.retireTax(c, 132200, 0, 0, 0, 0, 50, 2030, 1, out);
  near(out.taxable, 100000, 0.01);
  near(out.fed, 2480 + 75200 * 0.12 + 0, 0.01); // 24,800@10% + (100,000-24,800)@12%
});

test('LTCG stacks on top of ordinary income at 0%/15%', () => {
  const c = E.prepare({ filing: 'single' });
  const out = {};
  // 40k ordinary (taxable 23,900) + 40k gains: 25,550 at 0%, 14,450 at 15%.
  E.retireTax(c, 40000, 40000, 0, 0, 0, 50, 2030, 1, out);
  const ord = 1240 + (23900 - 12400) * 0.12;
  near(out.fed, ord + 14450 * 0.15, 0.01);
});

test('Social Security taxation formula', () => {
  const c = E.prepare({ filing: 'single' });
  const out = {};
  // SS 30k, other 30k: provisional 45k > 34k.
  // taxable = min(25.5k, 0.85*(11k) + min(15k, 4.5k)) = 9,350 + 4,500 = 13,850
  E.retireTax(c, 30000, 0, 30000, 0, 0, 66, 2035, 1, out);
  near(out.taxSS, 13850, 0.01);
  // Low income: no SS taxable.
  E.retireTax(c, 5000, 0, 20000, 0, 0, 66, 2035, 1, out);
  near(out.taxSS, 0, 0.01);
});

test('SS thresholds are not indexed (more taxable as prices rise)', () => {
  const c = E.prepare({ filing: 'single' });
  const a = {}, b = {};
  E.retireTax(c, 20000, 0, 24000, 0, 0, 70, 2040, 1, a);
  E.retireTax(c, 20000, 0, 24000, 0, 0, 70, 2040, 1.6, b);
  assert.ok(b.taxSS > a.taxSS);
});

test('Senior bonus deduction applies through 2028 only', () => {
  const c = E.prepare({ filing: 'single' });
  const a = {}, b = {};
  E.retireTax(c, 50000, 0, 0, 0, 0, 66, 2027, 1, a);
  E.retireTax(c, 50000, 0, 0, 0, 0, 66, 2029, 1, b);
  near(b.taxable - a.taxable, 6000, 0.01);
});

test('Early-withdrawal penalty is 10%', () => {
  const c = E.prepare({ filing: 'single' });
  const out = {};
  E.retireTax(c, 20000, 0, 0, 0, 20000, 50, 2030, 1, out);
  near(out.penalty, 2000, 0.01);
});

test('Social Security claim factors (FRA 67)', () => {
  const fra = E.fraMonths(1970);
  assert.strictEqual(fra, 67 * 12);
  near(E.claimFactor(62, fra), 0.70, 1e-9);
  near(E.claimFactor(67, fra), 1.00, 1e-9);
  near(E.claimFactor(70, fra), 1.24, 1e-9);
  near(E.spousalFactor(62, fra), 0.325 / 0.5, 1e-9); // 32.5% of PIA at 62 with FRA 67
});

test('PIA bend points (2026)', () => {
  near(E.piaFromAime(1286), 1157.4, 0.01);
  near(E.piaFromAime(7749), 1157.4 + 0.32 * (7749 - 1286), 0.01);
  near(E.piaFromAime(10000), 1157.4 + 0.32 * (7749 - 1286) + 0.15 * 2251, 0.01);
});

test('Max earner PIA is in a plausible range', () => {
  // A 61-year-old who always earned above the wage base, retiring at 67.
  const pia = E.estimatePia(400000, 61, 67, 22, 0);
  assert.ok(pia > 4000 && pia < 4600, 'pia ' + pia);
});

test('RMD start ages by birth year', () => {
  assert.strictEqual(E.rmdStartAge(1955), 73);
  assert.strictEqual(E.rmdStartAge(1960), 75);
});

test('Contribution limits with age catch-ups', () => {
  const c = E.prepare({ filing: 'single' });
  assert.strictEqual(E.contribLimits(c, 40).k401, 24500);
  assert.strictEqual(E.contribLimits(c, 55).k401, 32500);
  assert.strictEqual(E.contribLimits(c, 61).k401, 35750);
  assert.strictEqual(E.contribLimits(c, 64).k401, 32500);
});

test('401(k) contributions are capped at the limit', () => {
  const c = E.prepare({ salary: 400000, k401Pct: 20 });
  const con = E.contributions(c, 35, 0);
  assert.ok(con.capped);
  near(con.trad - con.match, 24500, 0.01);
});

test('No-growth, no-tax sanity: spending drains exactly', () => {
  // 0% real returns, no taxes (TX, Roth only), no SS: 1M / 50k = 20 years.
  const inp = {
    age: 60, planToAge: 79, targetAge: 60, salary: 0, trad: 0, taxable: 0, cash: 0, hsa: 0,
    roth: 1000000, rothBasisPct: 100, spending: 50000, spendingSmile: false, healthPre65: 0, healthPost65: 0,
    ssMode: 'manual', ssPia: 0, stockReturn: 2.5, bondReturn: 2.5, stockVol: 0, bondVol: 0, inflation: 2.5,
    fees: 0, k401Pct: 0, iraRoth: 0, taxableSavings: 0, cashReturn: 2.5
  };
  const r = E.deterministic(inp, 60);
  assert.ok(r.success, 'should just last 20 years');
  near(r.end, 0, 1);
  const r2 = E.deterministic(Object.assign({}, inp, { planToAge: 80 }), 60);
  assert.ok(!r2.success);
  assert.strictEqual(r2.failedAt, 80);
});

test('Withdrawals gross up for taxes', () => {
  const inp = {
    age: 66, planToAge: 67, targetAge: 66, salary: 0, roth: 0, taxable: 0, cash: 0, trad: 2000000,
    spending: 60000, spendingSmile: false, healthPre65: 0, healthPost65: 0, ssMode: 'manual', ssPia: 0,
    state: 'TX', retireState: 'TX', iraRoth: 0, taxableSavings: 0, k401Pct: 0
  };
  const r = E.deterministic(inp, 66);
  const row = r.rows[0];
  near(row.wdTrad - row.fedTax - row.stateTax, 60000, 1);
});

test('More savings never makes the median plan worse', () => {
  const a = E.deterministic({ taxableSavings: 0 }, 60).end;
  const b = E.deterministic({ taxableSavings: 20000 }, 60).end;
  assert.ok(b > a);
});

test('Monte Carlo is reproducible with a seed and success rises with retirement age', () => {
  const inp = { mcRuns: 300 };
  const a = E.monteCarlo(inp, 55, 300).success;
  const b = E.monteCarlo(inp, 55, 300).success;
  assert.strictEqual(a, b);
  const late = E.monteCarlo(inp, 67, 300).success;
  assert.ok(late >= a);
});

test('Monte Carlo median roughly tracks the deterministic median path', () => {
  const inp = { fatTails: false };
  const det = E.deterministic(inp, 65).rows;
  const mc = E.monteCarlo(inp, 65, 2000, { full: true });
  const y = 65 - 35; // at retirement
  const ratio = mc.bands.values[3][y] / det[y].total;
  assert.ok(ratio > 0.85 && ratio < 1.15, 'ratio ' + ratio);
});

test('Gompertz mortality matches SSA life expectancy at 65', () => {
  let e = 0; const M = E.mortality.M.male;
  for (let x = 65; x < 125; x += 0.01) e += E.survivalProb(M, 65, x) * 0.01;
  near(65 + e, 84.6, 0.4);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log('\nall passing');
