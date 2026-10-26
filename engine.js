/*
 * Retirement projection engine.
 *
 * Everything is modelled in real (today's) dollars. Inflation is simulated
 * explicitly so that the things the law does NOT index (Social Security
 * taxation thresholds, the NIIT threshold, non-COLA pensions, a fixed-rate
 * mortgage payment) lose real value the way they do in practice.
 *
 * The whole engine lives inside one factory function with no outside
 * references, so the UI can rebuild it inside a Web Worker from
 * RetirementEngineFactory.toString() — that works even when the page is
 * opened straight from disk.
 */
(function (root) {
  function RetirementEngineFactory() {
    'use strict';

    var BASE_YEAR = 2026;

    // ---------------------------------------------------------------------
    // 2026 tax law (IRS Rev. Proc. 2025-32, SSA 2026 fact sheet, OBBBA).
    // Brackets, deductions and contribution limits are inflation-indexed, so
    // in a real-dollar model they stay constant.
    // ---------------------------------------------------------------------
    var LAW = {
      brackets: {
        single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
        mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]]
      },
      stdDed: { single: 16100, mfj: 32200 },
      addl65: { single: 2050, mfj: 1650 },          // per person aged 65+
      seniorBonus: 6000,                            // per person 65+, tax years 2025-2028
      seniorBonusLastYear: 2028,
      seniorBonusPhase: { single: 75000, mfj: 150000 },
      ltcg: { single: [49450, 545500], mfj: [98900, 613700] },
      niit: { single: 200000, mfj: 250000 },        // NOT indexed
      ssThresh: { single: [25000, 34000], mfj: [32000, 44000] }, // NOT indexed
      limits: {
        k401: 24500, k401Catch50: 8000, k401Catch60: 11250,
        ira: 7500, iraCatch: 1100,
        hsaSelf: 4400, hsaFamily: 8750, hsaCatch: 1000
      },
      ss: { wageBase: 184500, bend1: 1286, bend2: 7749 },
      fica: { ss: 0.062, med: 0.0145, addl: 0.009, addlThresh: { single: 200000, mfj: 250000 } },
      earlyPenalty: 0.10
    };

    // IRS Uniform Lifetime Table (2022+), ages 72..120.
    var ULT = [27.4, 26.5, 25.5, 24.6, 23.7, 22.9, 22.0, 21.1, 20.2, 19.4, 18.5, 17.7, 16.8, 16.0, 15.2, 14.4,
      13.7, 12.9, 12.2, 11.5, 10.8, 10.1, 9.5, 8.9, 8.4, 7.8, 7.3, 6.8, 6.4, 6.0, 5.6, 5.2, 4.9, 4.6, 4.3,
      4.1, 3.9, 3.7, 3.5, 3.4, 3.3, 3.1, 3.0, 2.9, 2.8, 2.7, 2.5, 2.3, 2.0];

    // State table. rate = approximate effective rate on income above the
    // federal standard deduction for a middle-income retiree (includes the
    // typical local income tax where it applies to retirement income).
    // ss = taxes some Social Security for typical incomes.
    // allRet = exempts pensions/IRA/401(k) (and SS) from this age.
    // excl = [[age, per-person exclusion of retirement income], ...].
    // col = cost-of-living index, US = 100 (approx. 2024 MERIC data).
    var STATES = {
      AL: { n: 'Alabama', rate: 4.5, col: 88, excl: [[65, 6000]] },
      AK: { n: 'Alaska', rate: 0, col: 125 },
      AZ: { n: 'Arizona', rate: 2.5, col: 107 },
      AR: { n: 'Arkansas', rate: 3.5, col: 89, excl: [[59, 6000]] },
      CA: { n: 'California', rate: 6.0, col: 139 },
      CO: { n: 'Colorado', rate: 4.4, col: 103, excl: [[55, 20000], [65, 24000]] },
      CT: { n: 'Connecticut', rate: 5.0, col: 113 },
      DE: { n: 'Delaware', rate: 5.0, col: 101, excl: [[60, 12500]] },
      DC: { n: 'District of Columbia', rate: 6.5, col: 141 },
      FL: { n: 'Florida', rate: 0, col: 102 },
      GA: { n: 'Georgia', rate: 5.1, col: 93, excl: [[62, 35000], [65, 65000]] },
      HI: { n: 'Hawaii', rate: 7.2, col: 186 },
      ID: { n: 'Idaho', rate: 5.3, col: 103 },
      IL: { n: 'Illinois', rate: 4.95, col: 93, allRet: 0 },
      IN: { n: 'Indiana', rate: 4.5, col: 91 },
      IA: { n: 'Iowa', rate: 3.8, col: 89, allRet: 55 },
      KS: { n: 'Kansas', rate: 5.2, col: 88 },
      KY: { n: 'Kentucky', rate: 3.5, col: 93, excl: [[0, 31110]] },
      LA: { n: 'Louisiana', rate: 3.0, col: 91, excl: [[65, 12000]] },
      ME: { n: 'Maine', rate: 6.0, col: 112, excl: [[0, 35000]] },
      MD: { n: 'Maryland', rate: 7.0, col: 115, excl: [[65, 41000]] },
      MA: { n: 'Massachusetts', rate: 5.0, col: 145 },
      MI: { n: 'Michigan', rate: 4.25, col: 91, excl: [[60, 65000]] },
      MN: { n: 'Minnesota', rate: 6.8, col: 95, ss: true },
      MS: { n: 'Mississippi', rate: 4.0, col: 86, allRet: 0 },
      MO: { n: 'Missouri', rate: 4.7, col: 89 },
      MT: { n: 'Montana', rate: 5.9, col: 101, ss: true, excl: [[65, 5500]] },
      NE: { n: 'Nebraska', rate: 4.55, col: 91 },
      NV: { n: 'Nevada', rate: 0, col: 101 },
      NH: { n: 'New Hampshire', rate: 0, col: 113 },
      NJ: { n: 'New Jersey', rate: 5.5, col: 113, excl: [[62, 50000]] },
      NM: { n: 'New Mexico', rate: 4.5, col: 94 },
      NY: { n: 'New York', rate: 6.0, col: 125, excl: [[60, 20000]] },
      NC: { n: 'North Carolina', rate: 3.99, col: 96 },
      ND: { n: 'North Dakota', rate: 1.95, col: 92 },
      OH: { n: 'Ohio', rate: 2.75, col: 93 },
      OK: { n: 'Oklahoma', rate: 4.5, col: 87, excl: [[0, 10000]] },
      OR: { n: 'Oregon', rate: 8.0, col: 115 },
      PA: { n: 'Pennsylvania', rate: 3.07, col: 97, allRet: 60 },
      RI: { n: 'Rhode Island', rate: 4.75, col: 111, excl: [[67, 50000]] },
      SC: { n: 'South Carolina', rate: 6.0, col: 95, excl: [[65, 25000]] },
      SD: { n: 'South Dakota', rate: 0, col: 96 },
      TN: { n: 'Tennessee', rate: 0, col: 90 },
      TX: { n: 'Texas', rate: 0, col: 93 },
      UT: { n: 'Utah', rate: 4.5, col: 101, ss: true },
      VT: { n: 'Vermont', rate: 6.0, col: 115, ss: true },
      VA: { n: 'Virginia', rate: 5.0, col: 101, excl: [[65, 12000]] },
      WA: { n: 'Washington', rate: 0, col: 113 },
      WV: { n: 'West Virginia', rate: 4.8, col: 86, excl: [[65, 8000]] },
      WI: { n: 'Wisconsin', rate: 5.3, col: 95 },
      WY: { n: 'Wyoming', rate: 0, col: 93 }
    };

    // Gompertz mortality: modal age of death M with dispersion BETA. Calibrated
    // so that a 65-year-old's life expectancy matches SSA cohort tables
    // (about 84.6 for men, 87.1 for women).
    var MORT_BETA = 9.5;
    var MORT_M = { male: 87.5, female: 90.5, unspecified: 89 };
    var HEALTH_SHIFT = { poor: -5, fair: -2, average: 0, good: 2, excellent: 4 };

    function defaults() {
      return {
        age: 35, sex: 'unspecified', health: 'average', planToAge: 95,
        filing: 'single', partnerSex: 'unspecified', partnerHealth: 'average',
        state: 'TX', retireState: 'TX', adjustCOL: true, stateRateOverride: null,
        careerStartAge: 22,
        salary: 95000, partnerSalary: 0, raiseReal: 1.0,
        k401Pct: 10, k401RothPct: 0, matchRate: 50, matchUpToPct: 6, partner401kPct: 0,
        iraTrad: 0, iraRoth: 7000, hsaContrib: 0, hsaFamily: false, taxableSavings: 6000,
        trad: 85000, roth: 25000, rothBasisPct: 60, taxable: 30000, taxableBasisPct: 70, hsa: 0, cash: 15000,
        targetAge: 60,
        spendingMode: 'fixed', spending: 60000, replacementPct: 75, spendingSmile: true,
        healthPre65: 9000, healthPost65: 7000, healthInflation: 1.5,
        mortgagePayment: 0, mortgageEndAge: 0,
        ssMode: 'estimate', ssPia: 0, ssClaimAge: 67, partnerSsPia: 0, partnerClaimAge: 67,
        ssCutPct: 19, ssCutYear: 2034,
        pensionMonthly: 0, pensionStartAge: 65, pensionCola: false,
        partTimeIncome: 0, partTimeUntil: 0,
        events: [],
        legacy: 0,
        stockReturn: 8.5, stockVol: 17, bondReturn: 4.6, bondVol: 6.5, cashReturn: 3.3,
        inflation: 2.5, inflationVol: 1.3, fees: 0.15, taxDrag: 0.3,
        stockPctNow: 90, stockPctRetire: 60, stockPctEnd: 40,
        withdrawalOrder: 'conventional', guardrails: false, guardrailFloor: 80,
        rothConversionBracket: 0, rule55: true,
        mcRuns: 2000, mcSeed: 42, successTarget: 85, fatTails: true,
        stress: null
      };
    }

    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------
    function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
    function num(x, d) { x = +x; return isFinite(x) ? x : d; }

    function bracketTax(income, br) {
      var tax = 0, prev = 0;
      for (var i = 0; i < br.length; i++) {
        var top = br[i][0];
        if (income <= top) { tax += (income - prev) * br[i][1]; return tax; }
        tax += (top - prev) * br[i][1];
        prev = top;
      }
      return tax;
    }
    function marginalRate(income, br) {
      for (var i = 0; i < br.length; i++) if (income < br[i][0]) return br[i][1];
      return br[br.length - 1][1];
    }

    function fraMonths(birthYear) {
      if (birthYear <= 1954) return 66 * 12;
      if (birthYear >= 1960) return 67 * 12;
      return 66 * 12 + (birthYear - 1954) * 2;
    }
    function rmdStartAge(birthYear) {
      if (birthYear <= 1950) return 72;
      if (birthYear <= 1959) return 73;
      return 75;
    }

    // Benefit as a fraction of PIA when claiming at claimAge (years).
    function claimFactor(claimAge, fraM) {
      var m = Math.round(claimAge * 12) - fraM;
      if (m < 0) {
        var e = -m;
        return 1 - Math.min(e, 36) * (5 / 900) - Math.max(0, e - 36) * (5 / 1200);
      }
      return 1 + Math.min(m, 70 * 12 - fraM) * (8 / 1200);
    }
    // Spousal benefit fraction (of the 50% spousal amount); no delayed credits.
    function spousalFactor(claimAge, fraM) {
      var m = Math.round(claimAge * 12) - fraM;
      if (m >= 0) return 1;
      var e = -m;
      return 1 - Math.min(e, 36) * (25 / 3600) - Math.max(0, e - 36) * (5 / 1200);
    }

    function piaFromAime(aime) {
      var b1 = LAW.ss.bend1, b2 = LAW.ss.bend2;
      return 0.9 * Math.min(aime, b1) + 0.32 * clamp(aime - b1, 0, b2 - b1) + 0.15 * Math.max(0, aime - b2);
    }

    // Relative earnings by age, shaped on SSA's scaled-earner profiles:
    // pay climbs steeply through the twenties and flattens by the late forties.
    var CAREER = [[22, 0.40], [25, 0.58], [30, 0.82], [35, 0.97], [40, 1.07], [45, 1.13], [50, 1.16], [55, 1.15], [60, 1.10], [70, 1.00]];
    function careerShape(a) {
      if (a <= CAREER[0][0]) return CAREER[0][1];
      for (var i = 1; i < CAREER.length; i++) {
        if (a <= CAREER[i][0]) {
          var t = (a - CAREER[i - 1][0]) / (CAREER[i][0] - CAREER[i - 1][0]);
          return CAREER[i - 1][1] + t * (CAREER[i][1] - CAREER[i - 1][1]);
        }
      }
      return CAREER[CAREER.length - 1][1];
    }

    // Estimate the monthly PIA (today's dollars) from a salary history that
    // is reconstructed from the current salary. Past earnings (wage-indexed)
    // follow the typical career shape above; future earnings grow at
    // raiseReal against prices, i.e. raiseReal - 1% against average wages.
    // Earnings stop at retirement.
    var REAL_WAGE_GROWTH = 0.01;
    function estimatePia(salary, age, retireAge, careerStart, raiseReal) {
      if (salary <= 0) return 0;
      var years = [];
      for (var a = careerStart; a < Math.min(retireAge, 70); a++) {
        var e;
        if (a < age) e = salary * careerShape(a) / careerShape(age);
        else e = salary * Math.pow((1 + raiseReal) / (1 + REAL_WAGE_GROWTH), a - age);
        years.push(Math.min(e, LAW.ss.wageBase));
      }
      years.sort(function (x, y) { return y - x; });
      var sum = 0;
      for (var i = 0; i < Math.min(35, years.length); i++) sum += years[i];
      var pia = piaFromAime(sum / 420);
      // Bend points and the earnings index both follow wages until 62, so
      // younger workers' benefits grow in real terms until then.
      return pia * Math.pow(1 + REAL_WAGE_GROWTH, Math.max(0, 62 - age));
    }

    // Lognormal parameters from an arithmetic mean and standard deviation.
    function lnParams(mean, sd) {
      var v = Math.log(1 + (sd * sd) / ((1 + mean) * (1 + mean)));
      return { mu: Math.log(1 + mean) - v / 2, sigma: Math.sqrt(v) };
    }

    // ---------------------------------------------------------------------
    // Seeded PRNG (sfc32) + normal / Student-t draws
    // ---------------------------------------------------------------------
    function makeRng(seed) {
      var a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = (seed >>> 0) ^ 0xdeadbeef;
      function next() {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        var t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
      }
      for (var i = 0; i < 15; i++) next();
      var spare = null;
      function normal() {
        if (spare !== null) { var s = spare; spare = null; return s; }
        var u, v, r;
        do { u = next() * 2 - 1; v = next() * 2 - 1; r = u * u + v * v; } while (r >= 1 || r === 0);
        var f = Math.sqrt(-2 * Math.log(r) / r);
        spare = v * f;
        return u * f;
      }
      // Student-t with 5 degrees of freedom scaled to unit variance.
      function t5() {
        var z = normal(), chi = 0;
        for (var i = 0; i < 5; i++) { var n = normal(); chi += n * n; }
        return z / Math.sqrt(chi / 5) * Math.sqrt(3 / 5);
      }
      return { next: next, normal: normal, t5: t5 };
    }

    // ---------------------------------------------------------------------
    // Preparation: everything that depends on the inputs but not on the
    // retirement age or the market path.
    // ---------------------------------------------------------------------
    function prepare(raw) {
      var d = defaults();
      var p = {};
      for (var k in d) p[k] = raw && raw[k] !== undefined && raw[k] !== null && raw[k] !== '' ? raw[k] : d[k];
      if (raw && raw.stateRateOverride === null) p.stateRateOverride = null;

      var c = {};
      c.p = p;
      c.age = Math.round(clamp(num(p.age, 35), 18, 90));
      c.planTo = Math.round(clamp(num(p.planToAge, 95), c.age + 1, 120));
      c.years = c.planTo - c.age + 1;
      c.birthYear = BASE_YEAR - c.age;
      c.fraM = fraMonths(c.birthYear);
      c.rmdAge = rmdStartAge(c.birthYear);
      c.filing = p.filing === 'mfj' ? 'mfj' : 'single';
      c.persons = c.filing === 'mfj' ? 2 : 1;
      c.br = LAW.brackets[c.filing];
      c.std = LAW.stdDed[c.filing];

      c.stateNow = STATES[p.state] || STATES.TX;
      c.stateRet = STATES[p.retireState] || c.stateNow;
      c.stateRate = (p.stateRateOverride !== null && p.stateRateOverride !== undefined && p.stateRateOverride !== ''
        ? num(p.stateRateOverride, c.stateRet.rate) : c.stateRet.rate) / 100;
      c.colFactor = p.adjustCOL ? c.stateRet.col / c.stateNow.col : 1;

      c.salary = Math.max(0, num(p.salary, 0));
      c.partnerSalary = c.filing === 'mfj' ? Math.max(0, num(p.partnerSalary, 0)) : 0;
      c.raise = num(p.raiseReal, 0) / 100;

      // Market assumptions
      c.mS = num(p.stockReturn, 8.5) / 100; c.sS = Math.max(0, num(p.stockVol, 17)) / 100;
      c.mB = num(p.bondReturn, 4.6) / 100; c.sB = Math.max(0, num(p.bondVol, 6.5)) / 100;
      c.mI = num(p.inflation, 2.5) / 100; c.sI = Math.max(0, num(p.inflationVol, 1.3)) / 100;
      c.cashSpread = num(p.cashReturn, 3.3) / 100 - c.mI;
      c.fee = num(p.fees, 0) / 100;
      c.taxDrag = num(p.taxDrag, 0) / 100;
      c.lnS = lnParams(c.mS, c.sS);
      c.lnB = lnParams(c.mB, c.sB);
      // Correlations: stock/bond, stock/inflation, bond/inflation shocks.
      var rSB = 0.1, rSI = -0.1, rBI = -0.35;
      var l11 = 1, l21 = rSB, l22 = Math.sqrt(1 - rSB * rSB);
      var l31 = rSI, l32 = (rBI - l31 * l21) / l22, l33 = Math.sqrt(Math.max(0, 1 - l31 * l31 - l32 * l32));
      c.chol = [l11, l21, l22, l31, l32, l33];
      c.inflPhi = 0.6;

      c.wNow = clamp(num(p.stockPctNow, 90), 0, 100) / 100;
      c.wRet = clamp(num(p.stockPctRetire, 60), 0, 100) / 100;
      c.wEnd = clamp(num(p.stockPctEnd, 40), 0, 100) / 100;

      // Mortality
      var shift = HEALTH_SHIFT[p.health] || 0;
      c.mortM = (MORT_M[p.sex] || MORT_M.unspecified) + shift;
      c.mortMp = (MORT_M[p.partnerSex] || MORT_M.unspecified) + (HEALTH_SHIFT[p.partnerHealth] || 0);

      // Events (today's dollars)
      c.events = (p.events || []).map(function (e) {
        return { age: Math.round(num(e.age, 0)), amount: num(e.amount, 0), years: Math.max(1, Math.round(num(e.years, 1))), label: e.label || '' };
      });

      c.piaCache = {};
      return c;
    }

    function ssBenefits(c, R) {
      var key = R;
      if (c.piaCache[key]) return c.piaCache[key];
      var p = c.p;
      var piaU, piaP;
      if (p.ssMode === 'manual') {
        piaU = Math.max(0, num(p.ssPia, 0));
        piaP = c.filing === 'mfj' ? Math.max(0, num(p.partnerSsPia, 0)) : 0;
      } else {
        piaU = estimatePia(c.salary, c.age, R, num(p.careerStartAge, 22), c.raise);
        piaP = c.filing === 'mfj' ? estimatePia(c.partnerSalary, c.age, R, num(p.careerStartAge, 22), c.raise) : 0;
      }
      var claimU = clamp(num(p.ssClaimAge, 67), 62, 70);
      var claimP = clamp(num(p.partnerClaimAge, 67), 62, 70);
      var ownU = piaU * claimFactor(claimU, c.fraM) * 12;
      var ownP = piaP * claimFactor(claimP, c.fraM) * 12;
      var spouseTopP = c.filing === 'mfj' ? Math.max(0, 0.5 * piaU - piaP) * spousalFactor(claimP, c.fraM) * 12 : 0;
      var spouseTopU = c.filing === 'mfj' ? Math.max(0, 0.5 * piaP - piaU) * spousalFactor(claimU, c.fraM) * 12 : 0;
      var r = { piaU: piaU, piaP: piaP, claimU: claimU, claimP: claimP, ownU: ownU, ownP: ownP, topU: spouseTopU, topP: spouseTopP };
      c.piaCache[key] = r;
      return r;
    }

    // Annual household Social Security (real) at a given age.
    function ssAt(c, ss, a, year) {
      var u = 0, pp = 0;
      var uOn = a >= ss.claimU, pOn = c.filing === 'mfj' && a >= ss.claimP;
      if (uOn) u = ss.ownU + (pOn ? ss.topU : 0);
      if (pOn) pp = ss.ownP + (uOn ? ss.topP : 0);
      var total = u + pp;
      var cut = num(c.p.ssCutPct, 0) / 100;
      if (cut > 0 && year >= num(c.p.ssCutYear, 2034)) total *= 1 - cut;
      return total;
    }

    // ---------------------------------------------------------------------
    // Taxes for one retirement-phase year, in real dollars.
    // P = price level relative to today (for non-indexed thresholds).
    // ---------------------------------------------------------------------
    function retireTax(c, ordinary, ltcg, ss, retIncome, penaltyBase, a, year, P, out) {
      var f = c.filing;
      var t = LAW.ssThresh[f];
      var b1 = t[0] / P, b2 = t[1] / P;
      var prov = ordinary + ltcg + 0.5 * ss;
      var taxSS;
      if (prov <= b1) taxSS = 0;
      else if (prov <= b2) taxSS = Math.min(0.5 * ss, 0.5 * (prov - b1));
      else taxSS = Math.min(0.85 * ss, 0.85 * (prov - b2) + Math.min(0.5 * ss, 0.5 * (b2 - b1)));
      var agi = ordinary + ltcg + taxSS;
      var n65 = a >= 65 ? c.persons : 0;
      var ded = c.std + n65 * LAW.addl65[f];
      if (n65 && year <= LAW.seniorBonusLastYear) {
        var bonus = LAW.seniorBonus * n65 - 0.06 * Math.max(0, agi - LAW.seniorBonusPhase[f] / P);
        if (bonus > 0) ded += bonus;
      }
      var taxable = Math.max(0, agi - ded);
      var ordTaxable = Math.max(0, taxable - ltcg);
      var gains = taxable - ordTaxable;
      var fed = bracketTax(ordTaxable, c.br);
      if (gains > 0) {
        var lt = LAW.ltcg[f];
        var in0 = clamp(lt[0] - ordTaxable, 0, gains);
        var in15 = clamp(lt[1] - ordTaxable - in0, 0, gains - in0);
        fed += in15 * 0.15 + (gains - in0 - in15) * 0.20;
      }
      var niitT = LAW.niit[f] / P;
      if (agi > niitT && ltcg > 0) fed += 0.038 * Math.min(ltcg, agi - niitT);
      var pen = penaltyBase * LAW.earlyPenalty;

      // State
      var s = c.stateRet, st = 0;
      if (c.stateRate > 0) {
        var base = ordinary + ltcg + (s.ss ? taxSS : 0);
        if (s.allRet !== undefined && a >= s.allRet) {
          base -= retIncome + (s.ss ? taxSS : 0);
        } else if (s.excl) {
          var ex = 0;
          for (var i = 0; i < s.excl.length; i++) if (a >= s.excl[i][0]) ex = s.excl[i][1];
          base -= Math.min(retIncome, ex * c.persons);
        }
        st = c.stateRate * Math.max(0, base - c.std);
      }
      if (out) { out.fed = fed; out.state = st; out.penalty = pen; out.taxSS = taxSS; out.agi = agi; out.taxable = taxable; }
      return fed + st + pen;
    }

    // Taxes on a working year (for the take-home / current spending estimate).
    function workTax(c, wages, pretax) {
      var f = c.filing;
      var agi = Math.max(0, wages - pretax);
      var fed = bracketTax(Math.max(0, agi - c.std), c.br);
      var fica = 0;
      var each = [c.salary, c.partnerSalary];
      for (var i = 0; i < each.length; i++) fica += Math.min(each[i], LAW.ss.wageBase) * LAW.fica.ss;
      fica += wages * LAW.fica.med + Math.max(0, wages - LAW.fica.addlThresh[f]) * LAW.fica.addl;
      var srate = (c.p.stateRateOverride !== null && c.p.stateRateOverride !== undefined && c.p.stateRateOverride !== '' && c.stateNow === c.stateRet
        ? c.stateRate : c.stateNow.rate / 100);
      var st = srate * Math.max(0, agi - c.std);
      return { fed: fed, fica: fica, state: st, total: fed + fica + st, marginal: marginalRate(Math.max(0, agi - c.std), c.br) + srate };
    }

    function contribLimits(c, a) {
      var L = LAW.limits;
      var k = L.k401 + (a >= 60 && a <= 63 ? L.k401Catch60 : a >= 50 ? L.k401Catch50 : 0);
      var ira = (L.ira + (a >= 50 ? L.iraCatch : 0)) * c.persons;
      var hsa = (c.p.hsaFamily || c.filing === 'mfj' ? L.hsaFamily : L.hsaSelf) + (a >= 55 ? L.hsaCatch : 0);
      return { k401: k, ira: ira, hsa: hsa };
    }

    // Contributions for a working year (real dollars).
    function contributions(c, a, y) {
      var p = c.p;
      var g = Math.pow(1 + c.raise, y);
      var sal = c.salary * g, psal = c.partnerSalary * g;
      var lim = contribLimits(c, a);
      var empU = Math.min(sal * num(p.k401Pct, 0) / 100, lim.k401);
      var empP = Math.min(psal * num(p.partner401kPct, 0) / 100, lim.k401);
      var rothShare = clamp(num(p.k401RothPct, 0), 0, 100) / 100;
      var mr = num(p.matchRate, 0) / 100, mu = num(p.matchUpToPct, 0) / 100;
      var match = mr * (Math.min(sal * mu, empU) + Math.min(psal * mu, empP));
      var iraT = Math.max(0, num(p.iraTrad, 0)), iraR = Math.max(0, num(p.iraRoth, 0));
      var irs = iraT + iraR;
      var overflow = 0;
      if (irs > lim.ira) { var sc = lim.ira / irs; overflow += irs - lim.ira; iraT *= sc; iraR *= sc; }
      var hsa = Math.max(0, num(p.hsaContrib, 0));
      if (hsa > lim.hsa) { overflow += hsa - lim.hsa; hsa = lim.hsa; }
      var emp = empU + empP;
      return {
        salary: sal + psal,
        trad: emp * (1 - rothShare) + match + iraT,
        roth: emp * rothShare + iraR,
        rothBasis: emp * rothShare + iraR,
        hsa: hsa,
        taxable: Math.max(0, num(p.taxableSavings, 0)) + overflow,
        match: match,
        employee: emp + iraT + iraR + hsa + Math.max(0, num(p.taxableSavings, 0)),
        pretax: emp * (1 - rothShare) + iraT + hsa,
        capped: (sal * num(p.k401Pct, 0) / 100 > lim.k401 + 0.5) || (psal * num(p.partner401kPct, 0) / 100 > lim.k401 + 0.5),
        overflow: overflow
      };
    }

    function stockWeight(c, a, R) {
      if (a <= c.age) return c.wNow;
      if (a < R) return c.wNow + (c.wRet - c.wNow) * (a - c.age) / Math.max(1, R - c.age);
      var span = Math.max(1, c.planTo - R);
      // Glide from the retirement mix to the end mix over the first 15 years.
      var k = Math.min(1, (a - R) / Math.min(15, span));
      return c.wRet + (c.wEnd - c.wRet) * k;
    }

    // Base (pre-health, pre-mortgage) retirement spending in real dollars.
    function baseSpending(c, R) {
      var p = c.p;
      var s;
      if (p.spendingMode === 'replacement') {
        var finalSal = (c.salary + c.partnerSalary) * Math.pow(1 + c.raise, Math.max(0, R - c.age - 1));
        s = finalSal * num(p.replacementPct, 75) / 100;
      } else if (p.spendingMode === 'current') {
        s = currentBudget(c).lifestyle;
      } else {
        s = Math.max(0, num(p.spending, 0));
      }
      return s * c.colFactor;
    }

    function smile(c, a) {
      if (!c.p.spendingSmile) return 1;
      // Real discretionary spending tends to fall ~1.5%/yr from 70 to 85.
      if (a <= 70) return 1;
      return Math.pow(0.985, Math.min(a, 85) - 70);
    }

    function currentBudget(c) {
      var con = contributions(c, c.age, 0);
      var wages = c.salary + c.partnerSalary;
      var tx = workTax(c, wages, con.pretax);
      var mort = Math.max(0, num(c.p.mortgagePayment, 0)) * 12;
      var takeHome = wages - tx.total - con.pretax;
      var savingsAfterTax = con.employee - con.pretax;
      var spend = takeHome - savingsAfterTax;
      return {
        wages: wages, tax: tx, contributions: con, takeHome: takeHome, spending: spend,
        mortgage: mort, lifestyle: Math.max(0, spend - mort),
        savingsRate: wages > 0 ? (con.employee + con.match) / wages : 0
      };
    }

    // ---------------------------------------------------------------------
    // Market paths. Each year: [stockNominal, bondNominal, cashNominal, inflation]
    // ---------------------------------------------------------------------
    function deterministicPath(c) {
      var n = c.years, out = new Float64Array(n * 4);
      for (var y = 0; y < n; y++) {
        out[y * 4] = c.mS; out[y * 4 + 1] = c.mB; out[y * 4 + 2] = c.mI + c.cashSpread; out[y * 4 + 3] = c.mI;
      }
      return out;
    }

    function randomPath(c, rng, out) {
      var n = c.years, ch = c.chol, fat = !!c.p.fatTails;
      var infl = c.mI;
      var sdShock = c.sI * Math.sqrt(1 - c.inflPhi * c.inflPhi);
      for (var y = 0; y < n; y++) {
        var z1 = fat ? rng.t5() : rng.normal(), z2 = rng.normal(), z3 = rng.normal();
        var e1 = ch[0] * z1;
        var e2 = ch[1] * z1 + ch[2] * z2;
        var e3 = ch[3] * z1 + ch[4] * z2 + ch[5] * z3;
        infl = c.mI + c.inflPhi * (infl - c.mI) + sdShock * e3;
        if (infl < -0.04) infl = -0.04;
        var rs = Math.exp(c.lnS.mu + c.lnS.sigma * e1) - 1;
        var rb = Math.exp(c.lnB.mu + c.lnB.sigma * e2) - 1;
        var rc = Math.max(0, infl + c.cashSpread);
        out[y * 4] = rs; out[y * 4 + 1] = rb; out[y * 4 + 2] = rc; out[y * 4 + 3] = infl;
      }
      return out;
    }

    // Stylised stress sequences applied from the first retirement year.
    var STRESS = {
      crash: { label: 'Market crash at retirement', apply: function (m, ri, n) {
        var seq = [[-0.35, 0.05], [-0.12, 0.03], [0.18, 0.02]];
        for (var k = 0; k < seq.length && ri + k < n; k++) { m[(ri + k) * 4] = seq[k][0]; m[(ri + k) * 4 + 1] = seq[k][1]; }
      } },
      stagflation: { label: '1970s-style stagflation', apply: function (m, ri, n) {
        for (var k = 0; k < 10 && ri + k < n; k++) {
          m[(ri + k) * 4] = 0.05; m[(ri + k) * 4 + 1] = 0.03; m[(ri + k) * 4 + 2] = 0.06; m[(ri + k) * 4 + 3] = 0.08;
        }
      } },
      lostDecade: { label: 'Lost decade for stocks', apply: function (m, ri, n) {
        for (var k = 0; k < 10 && ri + k < n; k++) m[(ri + k) * 4] = 0.0;
      } }
    };

    // ---------------------------------------------------------------------
    // One path. Returns summary; fills rows when detail is requested.
    // ---------------------------------------------------------------------
    var taxScratch = {};
    function simulate(c, R, market, opts) {
      opts = opts || {};
      var p = c.p;
      var detail = !!opts.detail;
      var useDrag = !!opts.medianPath;
      var rows = detail ? [] : null;
      var track = opts.track; // Float32Array slice for totals, or null
      var trackSpend = opts.trackSpend;

      var trad = Math.max(0, num(p.trad, 0));
      var roth = Math.max(0, num(p.roth, 0));
      var rothBasis = roth * clamp(num(p.rothBasisPct, 60), 0, 100) / 100;
      var taxable = Math.max(0, num(p.taxable, 0));
      var basis = taxable * clamp(num(p.taxableBasisPct, 70), 0, 100) / 100;
      var hsa = Math.max(0, num(p.hsa, 0));
      var cash = Math.max(0, num(p.cash, 0));
      var conversions = []; // [availableAge, amount]

      var ss = ssBenefits(c, R);
      var base = baseSpending(c, R);
      var P = 1;
      var failedAt = -1, shortfall = 0;
      var spendFactor = 1, initWR = -1;
      var minSpendRatio = 1;
      var totalTax = 0, totalSpend = 0;
      var legacyTarget = Math.max(0, num(p.legacy, 0));
      var pensionStartP = 0;
      var hx = num(p.healthInflation, 0) / 100;
      var mortgage = Math.max(0, num(p.mortgagePayment, 0)) * 12;
      var mortEnd = num(p.mortgageEndAge, 0);
      var convTop = num(p.rothConversionBracket, 0);
      var convLimit = 0;
      if (convTop > 0) for (var bi = 0; bi < c.br.length; bi++) if (Math.abs(c.br[bi][1] * 100 - convTop) < 0.01) convLimit = c.br[bi][0];
      var pensionAnnual = Math.max(0, num(p.pensionMonthly, 0)) * 12;
      var pensionStart = num(p.pensionStartAge, 65);
      var ptIncome = Math.max(0, num(p.partTimeIncome, 0));
      var ptUntil = num(p.partTimeUntil, 0);
      var order = p.withdrawalOrder;

      for (var y = 0; y < c.years; y++) {
        var a = c.age + y, year = BASE_YEAR + y;
        var rs = market[y * 4], rb = market[y * 4 + 1], rc = market[y * 4 + 2], inf = market[y * 4 + 3];
        var w = stockWeight(c, a, R);
        var nominal = w * rs + (1 - w) * rb;
        var stressed = c.p.stress && STRESS[c.p.stress] && y >= R - c.age && y < R - c.age + 10;
        if (useDrag && !stressed) {
          var varP = w * w * c.sS * c.sS + (1 - w) * (1 - w) * c.sB * c.sB + 2 * w * (1 - w) * 0.1 * c.sS * c.sB;
          nominal -= varP / (2 * (1 + nominal));
        }
        var rInv = (1 + nominal - c.fee) / (1 + inf) - 1;
        var rTax = (1 + nominal - c.fee - c.taxDrag) / (1 + inf) - 1;
        var rCash = (1 + rc) / (1 + inf) - 1;

        var row = detail ? { age: a, year: year, phase: a < R ? 'work' : 'retired', stockPct: w } : null;
        var startTotal = trad + roth + taxable + hsa + cash;

        // Life events
        var evIn = 0, evOut = 0;
        for (var ei = 0; ei < c.events.length; ei++) {
          var ev = c.events[ei];
          if (a >= ev.age && a < ev.age + ev.years) { if (ev.amount >= 0) evIn += ev.amount; else evOut -= ev.amount; }
        }
        if (evIn > 0) { taxable += evIn; basis += evIn; }

        if (a < R) {
          // ---------------- Working year ----------------
          var con = contributions(c, a, y);
          // Contributions arrive through the year: half a year of growth.
          var hTrad = con.trad, hRoth = con.roth, hHsa = con.hsa, hTax = con.taxable;
          if (evOut > 0) {
            // Pay a one-off expense from cash, then taxable, then Roth basis.
            var need = evOut;
            var fromCash = Math.min(cash, need); cash -= fromCash; need -= fromCash;
            var fromNew = Math.min(hTax, need); hTax -= fromNew; need -= fromNew;
            if (need > 0 && taxable > 0) {
              var gfrac = Math.max(0, 1 - basis / taxable);
              var gross = Math.min(taxable, need / (1 - 0.15 * gfrac));
              basis -= basis * gross / taxable; taxable -= gross; need -= gross * (1 - 0.15 * gfrac);
            }
            if (need > 0 && rothBasis > 0) { var rb2 = Math.min(rothBasis, roth, need); roth -= rb2; rothBasis -= rb2; need -= rb2; }
            if (need > 0 && trad > 0) {
              var mrate = workTax(c, con.salary, con.pretax).marginal + (a < 60 ? 0.1 : 0);
              var g2 = Math.min(trad, need / (1 - mrate)); trad -= g2; need -= g2 * (1 - mrate);
            }
            if (need > 0 && roth > 0) { var r3 = Math.min(roth, need / 0.75); roth -= r3; need -= r3 * 0.75; }
            if (need > 1) { shortfall += need; if (failedAt < 0) failedAt = a; }
          }
          trad = trad * (1 + rInv) + hTrad * Math.sqrt(1 + rInv);
          roth = roth * (1 + rInv) + hRoth * Math.sqrt(1 + rInv);
          rothBasis += con.rothBasis;
          hsa = hsa * (1 + rInv) + hHsa * Math.sqrt(1 + rInv);
          taxable = taxable * (1 + rTax) + hTax * Math.sqrt(1 + rTax);
          basis += hTax;
          cash = cash * (1 + rCash);
          if (detail) {
            row.salary = con.salary; row.contrib = con.trad + con.roth + con.hsa + con.taxable; row.match = con.match;
            row.capped = con.capped; row.eventIn = evIn; row.eventOut = evOut;
            row.ss = 0; row.pension = 0; row.other = 0; row.rmd = 0; row.conversion = 0;
            row.wdTaxable = 0; row.wdTrad = 0; row.wdRoth = 0; row.wdCash = 0; row.wdHsa = 0;
            row.fedTax = 0; row.stateTax = 0; row.penalty = 0; row.spending = 0; row.health = 0; row.mortgage = 0;
          }
        } else {
          // ---------------- Retirement year ----------------
          if (a === R) pensionStartP = 0;
          for (var ci = conversions.length - 1; ci >= 0; ci--) {
            if (a >= conversions[ci][0]) { rothBasis += conversions[ci][1]; conversions.splice(ci, 1); }
          }
          var ssInc = ssAt(c, ss, a, year);
          var pension = 0;
          if (pensionAnnual > 0 && a >= pensionStart) {
            if (!pensionStartP) pensionStartP = P;
            pension = p.pensionCola ? pensionAnnual / pensionStartP : pensionAnnual / P;
          }
          var other = a < ptUntil ? ptIncome : 0;
          var otherTax = other * 0.0765;

          // Spending need
          var health = (a < 65 ? num(p.healthPre65, 0) : num(p.healthPost65, 0)) * Math.pow(1 + hx, y);
          var mort = a < mortEnd ? mortgage / P : 0;
          var core = base * smile(c, a);
          var spend = core * spendFactor + health + mort + evOut;

          var penaltyFree = a >= 60 || (p.rule55 && R >= 55 && a >= 55);

          // RMD (forced)
          var rmd = 0;
          if (a >= c.rmdAge && trad > 0) { rmd = trad / ULT[Math.min(a, 120) - 72]; }
          trad -= rmd;

          // Withdrawal solve -------------------------------------------
          var fixedCash = ssInc + pension + other + rmd - otherTax;
          var hsaForHealth = Math.min(hsa, health);
          var tax = 0, wdC = 0, wdT = 0, wdTr = 0, wdRb = 0, wdRe = 0, gain = 0, conv = 0;
          var gfr = taxable > 0 ? Math.max(0, 1 - basis / taxable) : 0;
          var retIncomeFixed = pension + rmd;
          var fillHeadroom = 0;
          if (order === 'bracket') {
            // Fill the 12% bracket with traditional withdrawals.
            var topFill = c.br[1][0] + c.std + (a >= 65 ? c.persons * LAW.addl65[c.filing] : 0);
            fillHeadroom = Math.max(0, topFill - (pension + other + rmd + 0.85 * ssInc));
          }
          for (var it = 0; it < 12; it++) {
            var gap = spend + tax - fixedCash - hsaForHealth;
            wdC = wdT = wdTr = wdRb = wdRe = 0;
            var rem = gap;
            if (rem > 0) {
              // 1. Fill-the-bracket from traditional, if chosen and penalty-free
              if (order === 'bracket' && penaltyFree) { wdTr = Math.max(0, Math.min(trad - conv, fillHeadroom, rem)); rem -= wdTr; }
              // 2. Cash
              var x = Math.min(cash, rem); wdC = x; rem -= x;
              if (order === 'proportional' && rem > 0) {
                var tradAvail = Math.max(0, trad - conv), pool = taxable + tradAvail + roth;
                if (pool > 0) {
                  var take = Math.min(rem, pool);
                  wdT = take * taxable / pool; wdTr += take * tradAvail / pool;
                  var rr = take * roth / pool; wdRb = Math.min(rr, rothBasis); wdRe = rr - wdRb;
                  rem -= take;
                }
              } else if (rem > 0) {
                // 3. Taxable
                x = Math.min(taxable, rem); wdT = x; rem -= x;
                if (penaltyFree) {
                  x = Math.max(0, Math.min(trad - conv - wdTr, rem)); wdTr += x; rem -= x;
                  x = Math.min(roth, rem); wdRb = Math.min(x, rothBasis); wdRe = x - wdRb; rem -= x;
                } else {
                  x = Math.min(rothBasis, roth, rem); wdRb = x; rem -= x;
                  x = Math.max(0, Math.min(trad - conv - wdTr, rem)); wdTr += x; rem -= x;
                  x = Math.min(roth - wdRb, rem); wdRe = x; rem -= x;
                }
              }
            }
            gain = wdT * gfr;
            var ordinary = pension + other + rmd + wdTr + conv + (penaltyFree ? 0 : wdRe);
            var penBase = penaltyFree ? 0 : wdTr + wdRe;
            var newTax = retireTax(c, ordinary, gain, ssInc, retIncomeFixed + wdTr + conv, penBase, a, year, P, null);
            // Roth conversion: fill the chosen bracket during the low-income years.
            if (convLimit > 0 && it === 0 && a < c.rmdAge && trad - wdTr > 0) {
              retireTax(c, ordinary, gain, ssInc, retIncomeFixed + wdTr, 0, a, year, P, taxScratch);
              var ordTaxable = Math.max(0, taxScratch.taxable - gain);
              conv = Math.max(0, Math.min(trad - wdTr, convLimit - ordTaxable));
              if (conv > 0) { tax = newTax; continue; }
            }
            if (Math.abs(newTax - tax) < 0.5) { tax = newTax; break; }
            tax = newTax;
          }
          var gapFinal = spend + tax - fixedCash - hsaForHealth;
          var covered = wdC + wdT + wdTr + wdRb + wdRe;
          var short = gapFinal - covered;
          // Apply
          cash -= wdC;
          if (wdT > 0) { basis -= basis * wdT / taxable; taxable -= wdT; }
          trad -= wdTr + conv;
          roth -= wdRb + wdRe; rothBasis -= wdRb;
          if (rothBasis > roth) rothBasis = roth;
          hsa -= hsaForHealth;
          if (conv > 0) { roth += conv; conversions.push([a + 5, conv]); }
          if (short > 1) {
            shortfall += short;
            if (failedAt < 0) failedAt = a;
            if (trackSpend) trackSpend[y] = Math.max(0, spend - short);
          } else {
            if (short < -1) { taxable += -short; basis += -short; } // surplus (RMD > need) gets reinvested
            if (trackSpend) trackSpend[y] = spend;
          }
          totalTax += tax; totalSpend += spend;

          // Guardrails (Guyton-Klinger style) on the core spending.
          if (p.guardrails) {
            var port = trad + roth + taxable + cash;
            var wdNeed = Math.max(0, spend + tax - fixedCash);
            var wr = port > 0 ? wdNeed / port : 1;
            if (initWR < 0) initWR = wr;
            else if (wr > initWR * 1.2) spendFactor = Math.max(spendFactor * 0.9, num(p.guardrailFloor, 80) / 100);
            else if (wr < initWR * 0.8 && spendFactor < 1.5) spendFactor = Math.min(1.5, spendFactor * 1.1);
            if (spendFactor < minSpendRatio) minSpendRatio = spendFactor;
          }

          if (detail) {
            retireTax(c, pension + other + rmd + wdTr + conv + (penaltyFree ? 0 : wdRe), gain, ssInc, retIncomeFixed + wdTr + conv, penaltyFree ? 0 : wdTr + wdRe, a, year, P, taxScratch);
            row.salary = other; row.contrib = 0; row.match = 0; row.eventIn = evIn; row.eventOut = evOut;
            row.ss = ssInc; row.pension = pension; row.other = other; row.rmd = rmd; row.conversion = conv;
            row.wdTaxable = wdT; row.wdTrad = wdTr; row.wdRoth = wdRb + wdRe; row.wdCash = wdC; row.wdHsa = hsaForHealth;
            row.fedTax = taxScratch.fed; row.stateTax = taxScratch.state; row.penalty = taxScratch.penalty; row.ficaTax = otherTax;
            row.agi = taxScratch.agi; row.taxableSS = taxScratch.taxSS;
            row.spending = spend; row.core = core * spendFactor; row.health = health; row.mortgage = mort; row.shortfall = Math.max(0, short);
            row.spendFactor = spendFactor;
            var portStart = startTotal;
            row.withdrawalRate = portStart > 0 ? (covered + hsaForHealth) / portStart : 0;
          }

          // Growth for the remainder of the year (withdrawals at start of year).
          trad = Math.max(0, trad) * (1 + rInv);
          roth = Math.max(0, roth) * (1 + rInv);
          hsa = Math.max(0, hsa) * (1 + rInv);
          taxable = Math.max(0, taxable) * (1 + rTax);
          cash = Math.max(0, cash) * (1 + rCash);
        }

        P *= 1 + inf;
        var total = trad + roth + taxable + hsa + cash;
        if (track) track[y] = total;
        if (detail) {
          row.trad = trad; row.roth = roth; row.taxable = taxable; row.hsa = hsa; row.cash = cash; row.total = total;
          row.inflation = inf; row.realReturn = rInv; row.priceLevel = P;
          rows.push(row);
        }
      }
      var end = trad + roth + taxable + hsa + cash;
      var success = failedAt < 0 && end >= legacyTarget;
      return {
        success: success, failedAt: failedAt, shortfall: shortfall, end: end, rows: rows,
        ss: ss, baseSpending: base, totalTax: totalTax, totalSpend: totalSpend, minSpendRatio: minSpendRatio
      };
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------
    function marketFor(c, R) {
      var m = deterministicPath(c);
      var st = c.p.stress && STRESS[c.p.stress];
      if (st) st.apply(m, Math.max(0, R - c.age), c.years);
      return m;
    }

    function deterministic(raw, R) {
      var c = raw && raw.__prepared ? raw : prepare(raw);
      if (R === undefined || R === null) R = Math.round(num(c.p.targetAge, 65));
      return simulate(c, R, marketFor(c, R), { detail: true, medianPath: true });
    }

    // Earliest age at which the median path lasts to the plan age.
    function earliestDeterministic(raw, maxAge) {
      var c = prepare(raw);
      var hi = Math.min(maxAge || 80, c.planTo);
      for (var R = c.age; R <= hi; R++) {
        if (simulate(c, R, marketFor(c, R), { medianPath: true }).success) return R;
      }
      return null;
    }

    function survivalProb(M, fromAge, toAge) {
      return Math.exp(Math.exp((fromAge - M) / MORT_BETA) - Math.exp((toAge - M) / MORT_BETA));
    }
    function drawDeath(M, fromAge, u) {
      return M + MORT_BETA * Math.log(Math.exp((fromAge - M) / MORT_BETA) - Math.log(u));
    }

    // Monte Carlo at a fixed retirement age.
    function monteCarlo(raw, R, runs, opts) {
      opts = opts || {};
      var c = raw && raw.__c ? raw.__c : prepare(raw);
      runs = runs || Math.round(num(c.p.mcRuns, 2000));
      var rng = makeRng(num(c.p.mcSeed, 42) + (opts.seedOffset || 0));
      var mortRng = makeRng(num(c.p.mcSeed, 42) * 7 + 1);
      var market = new Float64Array(c.years * 4);
      var full = !!opts.full;
      var totals = full ? new Float32Array(runs * c.years) : null;
      var spends = full ? new Float32Array(runs * c.years) : null;
      var ends = full ? new Float64Array(runs) : null;
      var fails = full ? new Int16Array(runs) : null;
      var wins = 0, aliveFail = 0, minSpend = full ? new Float64Array(runs) : null;
      var st = c.p.stress && STRESS[c.p.stress];
      for (var r = 0; r < runs; r++) {
        randomPath(c, rng, market);
        if (st) st.apply(market, Math.max(0, R - c.age), c.years);
        var res = simulate(c, R, market, {
          track: full ? totals.subarray(r * c.years, (r + 1) * c.years) : null,
          trackSpend: full ? spends.subarray(r * c.years, (r + 1) * c.years) : null
        });
        if (res.success) wins++;
        // Longevity-aware: did the money run out while someone was alive?
        var death = drawDeath(c.mortM, c.age, Math.max(1e-12, mortRng.next()));
        if (c.filing === 'mfj') death = Math.max(death, drawDeath(c.mortMp, c.age, Math.max(1e-12, mortRng.next())));
        if (res.failedAt >= 0 && res.failedAt <= death) aliveFail++;
        if (full) { ends[r] = res.end; fails[r] = res.failedAt; minSpend[r] = res.minSpendRatio; }
      }
      var out = { R: R, runs: runs, success: wins / runs, aliveSuccess: 1 - aliveFail / runs };
      if (full) {
        var pcts = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
        var bands = pcts.map(function () { return new Float64Array(c.years); });
        var spendBands = [0.1, 0.5, 0.9].map(function () { return new Float64Array(c.years); });
        var col = new Float64Array(runs);
        for (var y = 0; y < c.years; y++) {
          for (var k = 0; k < runs; k++) col[k] = totals[k * c.years + y];
          col.sort();
          for (var j = 0; j < pcts.length; j++) bands[j][y] = col[Math.min(runs - 1, Math.floor(pcts[j] * runs))];
          for (k = 0; k < runs; k++) col[k] = spends[k * c.years + y];
          col.sort();
          spendBands[0][y] = col[Math.floor(0.1 * runs)]; spendBands[1][y] = col[Math.floor(0.5 * runs)]; spendBands[2][y] = col[Math.min(runs - 1, Math.floor(0.9 * runs))];
        }
        // Probability portfolio still funded, by age
        var fundedByAge = new Float64Array(c.years);
        var depletionHist = {};
        for (k = 0; k < runs; k++) if (fails[k] >= 0) depletionHist[fails[k]] = (depletionHist[fails[k]] || 0) + 1;
        var cum = 0;
        for (y = 0; y < c.years; y++) { cum += depletionHist[c.age + y] || 0; fundedByAge[y] = 1 - cum / runs; }
        var sortedEnds = Array.prototype.slice.call(ends).sort(function (a, b) { return a - b; });
        out.bands = { pcts: pcts, values: bands.map(function (b) { return Array.prototype.slice.call(b); }) };
        out.spendBands = spendBands.map(function (b) { return Array.prototype.slice.call(b); });
        out.fundedByAge = Array.prototype.slice.call(fundedByAge);
        out.depletionHist = depletionHist;
        out.ends = sortedEnds;
        out.endPct = { p10: sortedEnds[Math.floor(0.1 * runs)], p50: sortedEnds[Math.floor(0.5 * runs)], p90: sortedEnds[Math.floor(0.9 * runs)] };
        var ms = Array.prototype.slice.call(minSpend).sort(function (a, b) { return a - b; });
        out.minSpendP10 = ms[Math.floor(0.1 * runs)];
        out.ages = []; for (y = 0; y < c.years; y++) out.ages.push(c.age + y);
      }
      return out;
    }

    // Probability of success for each candidate retirement age (common
    // random numbers: every age sees the same market paths).
    function successByAge(raw, runs, fromAge, toAge) {
      var c = prepare(raw);
      var list = [];
      for (var R = Math.max(c.age, fromAge); R <= Math.min(toAge, c.planTo - 1); R++) {
        list.push({ age: R, success: monteCarlo({ __c: c }, R, runs).success });
      }
      return list;
    }

    // Earliest age whose success rate meets the target (binary search; the
    // success rate rises with retirement age under common random numbers).
    function earliestMC(raw, runs, target, maxAge) {
      var c = prepare(raw);
      target = target !== undefined ? target : num(c.p.successTarget, 85) / 100;
      var lo = c.age, hi = Math.min(maxAge || 80, c.planTo - 1);
      var cache = {};
      function ok(R) { if (!(R in cache)) cache[R] = monteCarlo({ __c: c }, R, runs).success; return cache[R] >= target; }
      if (!ok(hi)) return { age: null, cache: cache };
      if (ok(lo)) return { age: lo, cache: cache };
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ok(mid)) hi = mid; else lo = mid; }
      return { age: hi, cache: cache };
    }

    function clone(o) {
      var r = {};
      for (var k in o) r[k] = Array.isArray(o[k]) ? o[k].map(function (e) { return typeof e === 'object' ? clone(e) : e; }) : o[k];
      return r;
    }

    // Solve a single lever so the plan reaches the target success rate at age R.
    function solveLever(raw, R, runs, target, lever) {
      var base = clone(raw);
      function succ(x) {
        var q = clone(base);
        lever.apply(q, x);
        return monteCarlo(q, R, runs).success;
      }
      var lo = lever.lo, hi = lever.hi;
      var sLo = succ(lever.dir > 0 ? lo : hi);
      if (sLo >= target) return { value: lever.dir > 0 ? lo : hi, success: sLo, already: true };
      var sHi = succ(lever.dir > 0 ? hi : lo);
      if (sHi < target) return { value: null, success: sHi };
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2;
        var s = succ(mid);
        if ((s >= target) === (lever.dir > 0)) hi = mid; else lo = mid;
        if (hi - lo < lever.tol) break;
      }
      var v = lever.dir > 0 ? hi : lo;
      return { value: v, success: succ(v) };
    }

    function levers(raw, R, runs, target) {
      var c = prepare(raw);
      var base = baseSpending(c, R) / c.colFactor;
      var defs = {
        savings: { lo: 0, hi: 150000, tol: 250, dir: 1, apply: function (q, x) { q.taxableSavings = num(q.taxableSavings, 0) + x; } },
        spending: { lo: 0.2, hi: 2, tol: 0.004, dir: -1, apply: function (q, x) {
          q.spendingMode = 'fixed'; q.spending = base * x;
        } },
        returns: { lo: 0, hi: 6, tol: 0.05, dir: 1, apply: function (q, x) {
          q.stockReturn = num(q.stockReturn, 8.5) + x; q.bondReturn = num(q.bondReturn, 4.6) + x;
        } },
        partTime: { lo: 0, hi: 200000, tol: 250, dir: 1, apply: function (q, x) {
          q.partTimeIncome = x; q.partTimeUntil = Math.max(R + 1, Math.min(R + 10, 70));
        } }
      };
      var out = {};
      for (var k in defs) out[k] = solveLever(raw, R, runs, target, defs[k]);
      out.spending.base = base;
      out.partTime.until = Math.max(R + 1, Math.min(R + 10, 70));
      var ea = earliestMC(raw, runs, target, Math.min(c.planTo - 1, 85));
      out.workLonger = { value: ea.age };
      return out;
    }

    return {
      BASE_YEAR: BASE_YEAR, LAW: LAW, STATES: STATES, STRESS: STRESS, ULT: ULT,
      defaults: defaults, prepare: prepare, deterministic: deterministic,
      earliestDeterministic: earliestDeterministic, monteCarlo: monteCarlo,
      successByAge: successByAge, earliestMC: earliestMC, levers: levers,
      estimatePia: estimatePia, piaFromAime: piaFromAime, claimFactor: claimFactor, spousalFactor: spousalFactor,
      fraMonths: fraMonths, rmdStartAge: rmdStartAge, ssBenefits: ssBenefits,
      retireTax: retireTax, workTax: workTax, bracketTax: bracketTax, currentBudget: currentBudget,
      contributions: contributions, contribLimits: contribLimits, baseSpending: baseSpending,
      survivalProb: survivalProb, mortality: { beta: MORT_BETA, M: MORT_M, shift: HEALTH_SHIFT },
      makeRng: makeRng, lnParams: lnParams, clone: clone
    };
  }

  if (typeof module === 'object' && module.exports) module.exports = RetirementEngineFactory;
  else { root.RetirementEngineFactory = RetirementEngineFactory; root.RetirementEngine = RetirementEngineFactory(); }
})(typeof self !== 'undefined' ? self : this);
