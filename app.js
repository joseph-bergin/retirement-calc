/* Retirement Runway — UI. Depends on engine.js (window.RetirementEngine). */
(function () {
  'use strict';

  var E = window.RetirementEngine;
  var STORE_KEY = 'runway.inputs.v1';
  var TAB_KEY = 'runway.tab.v1';

  // ---------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------
  function money(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e7) return s + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return s + '$' + Math.round(a / 1e3) + 'k';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'k';
    return s + '$' + Math.round(a);
  }
  function full(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var r = Math.round(v);
    if (r === 0) return '$0';
    return (r < 0 ? '−' : '') + '$' + Math.abs(r).toLocaleString('en-US');
  }
  function pct(v, d) { return v === null || v === undefined || !isFinite(v) ? '—' : (v * 100).toFixed(d === undefined ? 0 : d) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function statusPill(p, target) {
    if (p === null || p === undefined) return '';
    var cls = p >= target ? 'good' : p >= target - 0.15 ? 'warn' : 'bad';
    var word = p >= target ? 'On track' : p >= target - 0.15 ? 'Close' : 'Off track';
    return '<span class="pill ' + cls + '">' + word + '</span>';
  }

  // ---------------------------------------------------------------------
  // Input schema
  // ---------------------------------------------------------------------
  var isMfj = function (i) { return i.filing === 'mfj'; };
  var stateOpts = Object.keys(E.STATES).map(function (k) { return [k, E.STATES[k].n]; })
    .sort(function (a, b) { return a[1].localeCompare(b[1]); });

  var GROUPS = [
    { id: 'you', title: 'You', open: true, fields: [
      { k: 'age', l: 'Current age', t: 'int', min: 18, max: 85 },
      { k: 'targetAge', l: 'Target retirement age', t: 'int', min: 25, max: 85 },
      { k: 'planToAge', l: 'Plan until age', t: 'int', min: 70, max: 115, hint: 'Money has to last this long.' },
      { k: 'filing', l: 'Household', t: 'select', opts: [['single', 'Single'], ['mfj', 'Married, filing jointly']] },
      { k: 'sex', l: 'Sex (for longevity)', t: 'select', opts: [['unspecified', 'Prefer not to say'], ['female', 'Female'], ['male', 'Male']] },
      { k: 'health', l: 'Your health', t: 'select', opts: [['excellent', 'Excellent'], ['good', 'Good'], ['average', 'Average'], ['fair', 'Fair'], ['poor', 'Poor']] },
      { k: 'partnerSex', l: 'Partner sex', t: 'select', show: isMfj, opts: [['unspecified', 'Prefer not to say'], ['female', 'Female'], ['male', 'Male']] },
      { k: 'partnerHealth', l: 'Partner health', t: 'select', show: isMfj, opts: [['excellent', 'Excellent'], ['good', 'Good'], ['average', 'Average'], ['fair', 'Fair'], ['poor', 'Poor']] }
    ], derived: 'you' },
    { id: 'location', title: 'Location', fields: [
      { k: 'state', l: 'Where you live now', t: 'select', opts: stateOpts },
      { k: 'retireState', l: 'Where you will retire', t: 'select', opts: stateOpts },
      { k: 'adjustCOL', l: 'Scale retirement spending by the cost-of-living difference between the two', t: 'check' },
      { k: 'stateRateOverride', l: 'State tax rate override', t: 'pct', nullable: true, step: 0.1, hint: 'Blank uses our estimate for the retirement state.' }
    ], derived: 'location' },
    { id: 'income', title: 'Income and saving', open: true, fields: [
      { k: 'salary', l: 'Your salary', t: 'money', step: 1000 },
      { k: 'partnerSalary', l: 'Partner salary', t: 'money', step: 1000, show: isMfj },
      { k: 'raiseReal', l: 'Raises above inflation', t: 'pct', step: 0.1, hint: 'Per year, on top of inflation.' },
      { k: 'careerStartAge', l: 'Started working at', t: 'int', min: 14, max: 40, hint: 'Used for the Social Security estimate.' },
      { k: 'k401Pct', l: '401(k) contribution', t: 'pct', step: 0.5, hint: 'Your share, % of salary.' },
      { k: 'k401RothPct', l: 'Of which Roth 401(k)', t: 'pct', step: 5 },
      { k: 'matchRate', l: 'Employer match rate', t: 'pct', step: 5, hint: 'e.g. 50% of what you put in…' },
      { k: 'matchUpToPct', l: '…on contributions up to', t: 'pct', step: 0.5, hint: '% of salary.' },
      { k: 'partner401kPct', l: 'Partner 401(k)', t: 'pct', step: 0.5, show: isMfj },
      { k: 'iraRoth', l: 'Roth IRA / year', t: 'money', step: 500 },
      { k: 'iraTrad', l: 'Traditional IRA / year', t: 'money', step: 500 },
      { k: 'hsaContrib', l: 'HSA / year', t: 'money', step: 100 },
      { k: 'taxableSavings', l: 'Brokerage savings / year', t: 'money', step: 500 },
      { k: 'hsaFamily', l: 'HSA has family coverage', t: 'check' }
    ], derived: 'income' },
    { id: 'balances', title: 'What you have saved', open: true, fields: [
      { k: 'trad', l: '401(k) / traditional IRA', t: 'money', step: 1000 },
      { k: 'roth', l: 'Roth 401(k) / Roth IRA', t: 'money', step: 1000 },
      { k: 'taxable', l: 'Brokerage (taxable)', t: 'money', step: 1000 },
      { k: 'cash', l: 'Cash & savings', t: 'money', step: 1000 },
      { k: 'hsa', l: 'HSA', t: 'money', step: 500 },
      { k: 'rothBasisPct', l: 'Roth: contributions share', t: 'pct', step: 5, hint: 'Contributions can come out early tax-free.' },
      { k: 'taxableBasisPct', l: 'Brokerage cost basis', t: 'pct', step: 5, hint: 'What you paid, as % of value.' }
    ], derived: 'balances' },
    { id: 'spending', title: 'Retirement spending', open: true, fields: [
      { k: 'spendingMode', l: 'How to set it', t: 'select', wide: true, opts: [['fixed', 'A yearly amount'], ['replacement', 'A share of final pay'], ['current', 'Same lifestyle as now']] },
      { k: 'spending', l: 'Yearly spending', t: 'money', step: 1000, show: function (i) { return i.spendingMode === 'fixed'; }, hint: 'Today\'s dollars, excluding healthcare and mortgage.' },
      { k: 'replacementPct', l: 'Share of final pay', t: 'pct', step: 5, show: function (i) { return i.spendingMode === 'replacement'; } },
      { k: 'healthPre65', l: 'Healthcare before 65', t: 'money', step: 500, hint: 'Per year: premiums plus out-of-pocket.' },
      { k: 'healthPost65', l: 'Healthcare from 65', t: 'money', step: 500, hint: 'Medicare B/D, Medigap, out-of-pocket.' },
      { k: 'healthInflation', l: 'Healthcare cost growth', t: 'pct', step: 0.25, hint: 'Above general inflation.' },
      { k: 'legacy', l: 'Leave behind at least', t: 'money', step: 10000, hint: 'Today\'s dollars at the plan age.' },
      { k: 'mortgagePayment', l: 'Mortgage payment', t: 'money', post: '/mo', step: 50, hint: 'Fixed payment; inflation erodes it.' },
      { k: 'mortgageEndAge', l: 'Paid off at age', t: 'int', min: 0, max: 110 },
      { k: 'spendingSmile', l: 'Spending eases with age (about 1.5% a year less from 70 to 85, as observed in retirees)', t: 'check' }
    ], derived: 'spending' },
    { id: 'ss', title: 'Social Security and pensions', fields: [
      { k: 'ssMode', l: 'Social Security benefit', t: 'select', wide: true, opts: [['estimate', 'Estimate it from my salary'], ['manual', 'I\'ll enter my ssa.gov figure']] },
      { k: 'ssPia', l: 'Your benefit at full retirement age', t: 'money', post: '/mo', step: 50, show: function (i) { return i.ssMode === 'manual'; } },
      { k: 'partnerSsPia', l: 'Partner benefit at FRA', t: 'money', post: '/mo', step: 50, show: function (i) { return i.ssMode === 'manual' && isMfj(i); } },
      { k: 'ssClaimAge', l: 'You claim at', t: 'int', min: 62, max: 70 },
      { k: 'partnerClaimAge', l: 'Partner claims at', t: 'int', min: 62, max: 70, show: isMfj },
      { k: 'ssCutPct', l: 'Benefit cut if trust fund runs dry', t: 'pct', step: 1, hint: 'Trustees project ~19% from 2034. 0 = paid in full.' },
      { k: 'ssCutYear', l: 'Cut starts in', t: 'int', min: 2026, max: 2100 },
      { k: 'pensionMonthly', l: 'Pension', t: 'money', post: '/mo', step: 50, hint: 'As stated on your estimate.' },
      { k: 'pensionStartAge', l: 'Pension starts at', t: 'int', min: 40, max: 80 },
      { k: 'pensionCola', l: 'Pension has a cost-of-living adjustment', t: 'check' },
      { k: 'partTimeIncome', l: 'Part-time work in retirement', t: 'money', step: 1000, hint: 'Per year, today\'s dollars.' },
      { k: 'partTimeUntil', l: 'Until age', t: 'int', min: 0, max: 90 }
    ], derived: 'ss' },
    { id: 'events', title: 'Big one-off events', custom: 'events' },
    { id: 'invest', title: 'Investments and markets', fields: [
      { k: 'stockPctNow', l: 'Stocks now', t: 'pct', step: 5 },
      { k: 'stockPctRetire', l: 'Stocks at retirement', t: 'pct', step: 5 },
      { k: 'stockPctEnd', l: 'Stocks 15 years in', t: 'pct', step: 5 },
      { k: 'fees', l: 'Fund + advisor fees', t: 'pct', step: 0.05 },
      { k: 'stockReturn', l: 'Stock return', t: 'pct', step: 0.1, hint: 'Average yearly, before inflation.' },
      { k: 'stockVol', l: 'Stock volatility', t: 'pct', step: 0.5, hint: 'Std. deviation of yearly returns.' },
      { k: 'bondReturn', l: 'Bond return', t: 'pct', step: 0.1 },
      { k: 'bondVol', l: 'Bond volatility', t: 'pct', step: 0.5 },
      { k: 'cashReturn', l: 'Cash return', t: 'pct', step: 0.1 },
      { k: 'inflation', l: 'Inflation', t: 'pct', step: 0.1 },
      { k: 'inflationVol', l: 'Inflation volatility', t: 'pct', step: 0.1 },
      { k: 'taxDrag', l: 'Brokerage tax drag', t: 'pct', step: 0.05, hint: 'Yearly tax on dividends.' }
    ], derived: 'invest' },
    { id: 'strategy', title: 'Withdrawal strategy', fields: [
      { k: 'withdrawalOrder', l: 'Which accounts to draw first', t: 'select', wide: true, opts: [
        ['conventional', 'Brokerage, then traditional, then Roth'],
        ['bracket', 'Fill the 12% bracket from traditional first'],
        ['proportional', 'Pro-rata across all accounts']] },
      { k: 'rothConversionBracket', l: 'Roth conversions before RMDs', t: 'select', wide: true, opts: [['0', 'None'], ['12', 'Fill up to the 12% bracket'], ['22', 'Fill up to the 22% bracket'], ['24', 'Fill up to the 24% bracket']] },
      { k: 'guardrails', l: 'Flexible spending guardrails: cut 10% when the withdrawal rate climbs 20% above where it started, raise 10% when it falls 20% below', t: 'check' },
      { k: 'guardrailFloor', l: 'Never cut below', t: 'pct', step: 5, show: function (i) { return !!i.guardrails; }, hint: 'Of planned core spending.' },
      { k: 'rule55', l: 'Rule of 55: penalty-free 401(k) access if you leave work at 55 or later', t: 'check' }
    ] },
    { id: 'sim', title: 'Simulation settings', fields: [
      { k: 'mcRuns', l: 'Simulations', t: 'select', opts: [['1000', '1,000'], ['2000', '2,000'], ['5000', '5,000'], ['10000', '10,000']] },
      { k: 'successTarget', l: 'Confidence you want', t: 'pct', step: 1, hint: '80–90% is typical.' },
      { k: 'mcSeed', l: 'Random seed', t: 'int', min: 1, max: 999999, hint: 'Same seed, same results.' },
      { k: 'fatTails', l: 'Fat-tailed stock returns (crashes happen more often than a bell curve predicts)', t: 'check' }
    ] }
  ];

  var EXAMPLE_EVENTS = [
    { label: 'New roof', age: 48, amount: -25000, years: 1 },
    { label: 'Downsize home', age: 70, amount: 150000, years: 1 }
  ];

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  var state = {
    inputs: null, isExample: true, tab: 'overview',
    det: null, detEarliest: null, budget: null, c: null,
    mc: null, byAge: null, claims: null, levers: null, scenarios: null,
    nominal: false, sandbox: null, quick: null
  };

  function exampleInputs() {
    var d = E.defaults();
    d.events = EXAMPLE_EVENTS.map(function (e) { return Object.assign({}, e); });
    return d;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        state.inputs = Object.assign(E.defaults(), saved.inputs || {});
        state.isExample = !!saved.isExample;
        return;
      }
    } catch (e) { /* storage unavailable */ }
    state.inputs = exampleInputs();
    state.isExample = true;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ inputs: state.inputs, isExample: state.isExample })); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------
  // Input rendering
  // ---------------------------------------------------------------------
  function fieldHtml(f) {
    var id = 'in-' + f.k, v = state.inputs[f.k];
    var cls = 'field' + (f.wide ? ' wide' : '');
    var hint = f.hint ? '<span class="hint">' + f.hint + '</span>' : '';
    if (f.t === 'check') {
      return '<label class="check" data-field="' + f.k + '"><input type="checkbox" id="' + id + '" data-k="' + f.k + '"' + (v ? ' checked' : '') + '><span>' + f.l + '</span></label>';
    }
    if (f.t === 'select') {
      var o = f.opts.map(function (p) { return '<option value="' + p[0] + '"' + (String(v) === String(p[0]) ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('');
      return '<div class="' + cls + '" data-field="' + f.k + '"><label for="' + id + '">' + f.l + '</label><select id="' + id + '" data-k="' + f.k + '">' + o + '</select>' + hint + '</div>';
    }
    var val = v === null || v === undefined ? '' : v;
    var attrs = ' type="number" inputmode="decimal" id="' + id + '" data-k="' + f.k + '" value="' + esc(val) + '"' +
      (f.step ? ' step="' + f.step + '"' : f.t === 'int' ? ' step="1"' : '') +
      (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '') +
      (f.nullable ? ' placeholder="auto"' : '');
    var input = '<input' + attrs + '>';
    if (f.t === 'money') input = '<div class="affix"><span class="pre">$</span><input' + attrs + '>' + (f.post ? '<span class="post">' + f.post + '</span>' : '') + '</div>';
    else if (f.t === 'pct') input = '<div class="affix"><input' + attrs + '><span class="post">%</span></div>';
    return '<div class="' + cls + '" data-field="' + f.k + '"><label for="' + id + '">' + f.l + '</label>' + input + hint + '</div>';
  }

  function eventsHtml() {
    var rows = (state.inputs.events || []).map(function (e, i) {
      return '<div class="event-row" data-i="' + i + '">' +
        '<input type="text" aria-label="Event" data-ev="label" value="' + esc(e.label || '') + '" placeholder="e.g. College">' +
        '<input type="number" aria-label="Age" data-ev="age" value="' + esc(e.age) + '">' +
        '<input type="number" aria-label="Amount per year" data-ev="amount" step="1000" value="' + esc(e.amount) + '">' +
        '<input type="number" aria-label="Years" data-ev="years" min="1" value="' + esc(e.years || 1) + '">' +
        '<button type="button" data-ev-del="' + i + '" aria-label="Remove event">✕</button></div>';
    }).join('');
    return '<div class="events"><p class="hint" style="margin:0;font-size:.75rem;color:var(--muted)">Positive amounts are money in (inheritance, home sale), negative are costs (college, a car, long-term care). Today\'s dollars, per year.</p>' +
      '<div class="event-head"><span>Event</span><span>Age</span><span>Amount</span><span>Years</span><span></span></div>' + rows +
      '<div><button type="button" class="ghost" id="ev-add">Add event</button></div></div>';
  }

  function renderInputs() {
    var html = GROUPS.map(function (g) {
      var body = g.custom === 'events' ? eventsHtml() : g.fields.map(fieldHtml).join('');
      if (g.derived) body += '<div class="derived" id="derived-' + g.derived + '"></div>';
      return '<details class="group" id="grp-' + g.id + '"' + (g.open ? ' open' : '') + '><summary>' + g.title + '<span class="sum-note" id="note-' + g.id + '"></span></summary><div class="group-body">' + body + '</div></details>';
    }).join('');
    $('#inputs').innerHTML = html;
    applyShow();
  }

  function applyShow() {
    GROUPS.forEach(function (g) {
      (g.fields || []).forEach(function (f) {
        if (!f.show) return;
        var el = document.querySelector('[data-field="' + f.k + '"]');
        if (el) el.hidden = !f.show(state.inputs);
      });
    });
  }

  function findField(k) {
    for (var i = 0; i < GROUPS.length; i++) for (var j = 0; j < (GROUPS[i].fields || []).length; j++) if (GROUPS[i].fields[j].k === k) return GROUPS[i].fields[j];
    return null;
  }

  function onInput(e) {
    var t = e.target;
    if (t.dataset.ev) {
      var i = +t.closest('.event-row').dataset.i;
      var ev = state.inputs.events[i];
      ev[t.dataset.ev] = t.dataset.ev === 'label' ? t.value : (t.value === '' ? 0 : +t.value);
      changed();
      return;
    }
    var k = t.dataset.k;
    if (!k) return;
    var f = findField(k);
    var v;
    if (t.type === 'checkbox') v = t.checked;
    else if (f && f.t === 'select') v = /^\d+$/.test(t.value) ? +t.value : t.value;
    else if (t.value === '') v = f && f.nullable ? null : 0;
    else { v = +t.value; if (!isFinite(v)) return; }
    state.inputs[k] = v;
    if (k === 'filing' || k === 'spendingMode' || k === 'ssMode' || k === 'guardrails') applyShow();
    changed();
  }

  function changed() {
    if (state.isExample) { state.isExample = false; $('#example-banner').hidden = true; }
    save();
    schedule();
  }

  // ---------------------------------------------------------------------
  // Worker plumbing. The worker is built from the engine factory's source so
  // it also runs from file:// pages.
  // ---------------------------------------------------------------------
  function jobs(E) {
    function scaleSpend(q, f) {
      var c = E.prepare(q);
      var base = E.baseSpending(c, Math.round(+q.targetAge || 65)) / c.colFactor;
      q.spendingMode = 'fixed';
      q.spending = base * f;
    }
    var SCEN = [
      ['base', 'Your plan as entered', 'Baseline', 0, function () {}],
      ['early2', 'Retire 2 years earlier', 'Timing', -2, function () {}],
      ['late2', 'Retire 2 years later', 'Timing', 2, function () {}],
      ['spend-10', 'Spend 10% less in retirement', 'Spending', 0, function (q) { scaleSpend(q, 0.9); }],
      ['spend+10', 'Spend 10% more in retirement', 'Spending', 0, function (q) { scaleSpend(q, 1.1); }],
      ['save500', 'Save $500 a month more', 'Saving', 0, function (q) { q.taxableSavings = (+q.taxableSavings || 0) + 6000; }],
      ['ret-1', 'Returns 1 point lower every year', 'Markets', 0, function (q) { q.stockReturn -= 1; q.bondReturn -= 1; q.cashReturn -= 1; }],
      ['ret+1', 'Returns 1 point higher every year', 'Markets', 0, function (q) { q.stockReturn += 1; q.bondReturn += 1; q.cashReturn += 1; }],
      ['inf+1', 'Inflation 1 point higher, same nominal returns', 'Markets', 0, function (q) { q.inflation += 1; }],
      ['crash', 'Crash as you retire: −35% then −12%', 'Stress test', 0, function (q) { q.stress = 'crash'; }],
      ['stag', '1970s stagflation: 8% inflation for 10 years', 'Stress test', 0, function (q) { q.stress = 'stagflation'; }],
      ['lost', 'Lost decade: flat stocks for 10 years', 'Stress test', 0, function (q) { q.stress = 'lostDecade'; }],
      ['ss-full', 'Social Security paid in full, no cut', 'Social Security', 0, function (q) { q.ssCutPct = 0; }],
      ['ss-cut', 'Deeper cut: 25% from 2033', 'Social Security', 0, function (q) { q.ssCutPct = 25; q.ssCutYear = 2033; }],
      ['claim62', 'Claim Social Security at 62', 'Social Security', 0, function (q) { q.ssClaimAge = 62; q.partnerClaimAge = 62; }],
      ['claim70', 'Claim Social Security at 70', 'Social Security', 0, function (q) { q.ssClaimAge = 70; q.partnerClaimAge = 70; }],
      ['ltc', 'Long-term care: $120k a year for 3 years from 85', 'Health', 0, function (q) { q.events = (q.events || []).concat([{ age: 85, amount: -120000, years: 3, label: 'Care' }]); }],
      ['health+', 'Healthcare costs grow 3% faster than inflation', 'Health', 0, function (q) { q.healthInflation = 3; }],
      ['live100', 'Live to 100', 'Health', 0, function (q) { q.planToAge = Math.max(100, +q.planToAge || 95); }],
      ['move', '', 'Location', 0, function (q) { q.retireState = q.state === 'TN' ? 'FL' : 'TN'; }],
      ['conservative', 'Cautious mix: 30% stocks in retirement', 'Investing', 0, function (q) { q.stockPctRetire = 30; q.stockPctEnd = 30; }],
      ['aggressive', 'Growth mix: 80% stocks in retirement', 'Investing', 0, function (q) { q.stockPctRetire = 80; q.stockPctEnd = 80; }],
      ['fees', 'Fees 0.75 points higher (an advisor)', 'Investing', 0, function (q) { q.fees = (+q.fees || 0) + 0.75; }],
      ['guard', 'Flexible spending guardrails', 'Strategy', 0, function (q) { q.guardrails = true; }],
      ['roth22', 'Roth conversions up to the 22% bracket', 'Strategy', 0, function (q) { q.rothConversionBracket = 22; }],
      ['bracket', 'Fill the 12% bracket from traditional first', 'Strategy', 0, function (q) { q.withdrawalOrder = 'bracket'; }]
    ];

    function earliestFromList(list, target) {
      var best = null;
      for (var i = list.length - 1; i >= 0; i--) { if (list[i].success >= target) best = list[i].age; else break; }
      return best;
    }

    return {
      main: function (p, post) {
        var inp = p.inputs, R = p.target;
        post('mc', E.monteCarlo(inp, R, p.runs, { full: true }));
        var c = E.prepare(inp);
        var hi = Math.min(c.planTo - 1, Math.max(R + 6, 75));
        var list = E.successByAge(inp, p.searchRuns, c.age, hi);
        post('byAge', { list: list, earliest: earliestFromList(list, p.successTarget), hi: hi });
        var claims = [62, 64, 67, 69, 70].map(function (a) {
          var q = E.clone(inp); q.ssClaimAge = a; q.partnerClaimAge = a;
          return { age: a, success: E.monteCarlo(q, R, p.searchRuns).success, det: E.deterministic(q, R).end };
        });
        post('claims', claims);
      },
      levers: function (p, post) {
        post('levers', E.levers(p.inputs, p.target, p.runs, p.successTarget));
      },
      scenarios: function (p, post) {
        var inp = p.inputs, R0 = p.target;
        for (var i = 0; i < SCEN.length; i++) {
          var s = SCEN[i], q = E.clone(inp);
          s[4](q);
          var label = s[1];
          if (s[0] === 'move') {
            label = 'Retire to ' + E.STATES[q.retireState].n + ' (no income tax)';
            if (inp.retireState === q.retireState) continue;
          }
          var R = Math.max(E.prepare(q).age, R0 + s[3]);
          var mc = E.monteCarlo(q, R, p.runs);
          var det = E.deterministic(q, R);
          var ea = E.earliestMC(q, p.searchRuns, p.successTarget, 85).age;
          post('scenario', { id: s[0], label: label, group: s[2], R: R, success: mc.success, alive: mc.aliveSuccess, end: det.end, earliest: ea, failedAt: det.failedAt });
        }
      },
      quick: function (p, post) {
        var mc = E.monteCarlo(p.inputs, p.target, p.runs, { full: true });
        post('quick', { success: mc.success, alive: mc.aliveSuccess, median: mc.bands.values[3], ends: mc.endPct });
      }
    };
  }

  function workerMain() {
    var J = self.__jobs(self.RetirementEngine);
    self.onmessage = function (ev) {
      var m = ev.data;
      try {
        J[m.type](m.payload, function (kind, data) { self.postMessage({ id: m.id, kind: kind, data: data }); });
        self.postMessage({ id: m.id, kind: 'done' });
      } catch (err) {
        self.postMessage({ id: m.id, kind: 'error', data: String(err && err.stack || err) });
      }
    };
  }

  var workerSrc = null;
  function workerUrl() {
    if (!workerSrc) {
      var src = 'self.RetirementEngine = (' + window.RetirementEngineFactory.toString() + ')();\n' +
        'self.__jobs = ' + jobs.toString() + ';\n(' + workerMain.toString() + ')();';
      workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    }
    return workerSrc;
  }

  var running = {};
  var seq = 0;
  // Run a job; returns a cancel function. Falls back to the main thread.
  function run(type, payload, onMsg) {
    cancel(type);
    var id = ++seq;
    var w = null;
    try { w = new Worker(workerUrl()); } catch (e) { w = null; }
    if (w) {
      w.onmessage = function (ev) {
        if (ev.data.id !== id) return;
        if (ev.data.kind === 'done' || ev.data.kind === 'error') { w.terminate(); if (running[type] && running[type].id === id) delete running[type]; }
        if (ev.data.kind === 'error') console.error(ev.data.data);
        onMsg(ev.data.kind, ev.data.data);
        updateStatus();
      };
      w.onerror = function (err) {
        console.error(err); w.terminate(); delete running[type];
        // Worker could not start (CSP or file:// quirks): run inline instead.
        runInline(type, payload, onMsg, id);
      };
      running[type] = { id: id, stop: function () { w.terminate(); } };
      w.postMessage({ id: id, type: type, payload: payload });
    } else {
      runInline(type, payload, onMsg, id);
    }
    updateStatus();
  }
  var inlineJobs = null;
  function runInline(type, payload, onMsg, id) {
    if (!inlineJobs) inlineJobs = jobs(E);
    var stopped = false;
    running[type] = { id: id, stop: function () { stopped = true; } };
    setTimeout(function () {
      if (stopped) return;
      try {
        inlineJobs[type](payload, function (kind, data) { if (!stopped) onMsg(kind, data); });
        if (!stopped) onMsg('done');
      } catch (e) { console.error(e); onMsg('error', String(e)); }
      if (running[type] && running[type].id === id) delete running[type];
      updateStatus();
    }, 30);
    updateStatus();
  }
  function cancel(type) { if (running[type]) { running[type].stop(); delete running[type]; } }

  function updateStatus() {
    var el = $('#status');
    var busy = Object.keys(running);
    if (busy.length) {
      var names = { main: 'Running simulations', levers: 'Solving for your target', scenarios: 'Running what-ifs', quick: 'Testing your what-if' };
      el.textContent = names[busy[0]] || 'Working';
      el.classList.add('busy');
    } else { el.textContent = 'Up to date'; el.classList.remove('busy'); }
  }

  // ---------------------------------------------------------------------
  // Recompute
  // ---------------------------------------------------------------------
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(recompute, 220); }

  function targetAge() {
    var i = state.inputs;
    return Math.max(Math.round(+i.age || 18), Math.min(Math.round(+i.targetAge || 65), Math.round(+i.planToAge || 95) - 1));
  }
  function successTarget() { return Math.min(0.99, Math.max(0.5, (+state.inputs.successTarget || 85) / 100)); }

  function recompute() {
    var inp = state.inputs;
    var R = targetAge();
    state.c = E.prepare(inp);
    state.det = E.deterministic(inp, R);
    state.detEarliest = E.earliestDeterministic(inp, 85);
    state.budget = E.currentBudget(state.c);
    state.mc = null; state.byAge = null; state.claims = null; state.levers = null; state.scenarios = null; state.quick = null;
    state.sandbox = null;
    renderDerived();
    renderAll();

    var runs = +inp.mcRuns || 2000;
    run('main', { inputs: inp, target: R, runs: runs, searchRuns: Math.min(runs, 800), successTarget: successTarget() }, function (kind, data) {
      if (kind === 'mc') state.mc = data;
      else if (kind === 'byAge') state.byAge = data;
      else if (kind === 'claims') state.claims = data;
      else if (kind === 'done') startLevers();
      renderAll();
    });
    cancel('levers'); cancel('scenarios'); cancel('quick');
  }

  function startLevers() {
    run('levers', { inputs: state.inputs, target: targetAge(), runs: 500, successTarget: successTarget() }, function (kind, data) {
      if (kind === 'levers') { state.levers = data; renderAll(); }
      if (kind === 'done' && state.tab === 'whatif' && !state.scenarios) startScenarios();
    });
  }

  function startScenarios() {
    state.scenarios = [];
    run('scenarios', { inputs: state.inputs, target: targetAge(), runs: 800, searchRuns: 400, successTarget: successTarget() }, function (kind, data) {
      if (kind === 'scenario') { state.scenarios.push(data); renderWhatIf(); }
      if (kind === 'done') { state.scenarios.done = true; renderWhatIf(); }
    });
  }

  // ---------------------------------------------------------------------
  // Derived notes in the input panel
  // ---------------------------------------------------------------------
  function renderDerived() {
    var c = state.c, b = state.budget, i = state.inputs, det = state.det;
    var set = function (id, html) { var el = $('#derived-' + id); if (el) el.innerHTML = html; };
    var M = c.mortM;
    var le = lifeExpectancy(M, c.age);
    var pPlan = E.survivalProb(M, c.age, c.planTo);
    var you = 'Life expectancy about <strong>' + le.toFixed(0) + '</strong>. Chance you live to ' + c.planTo + ': <strong>' + pct(pPlan) + '</strong>.';
    if (c.filing === 'mfj') {
      var pBoth = 1 - (1 - pPlan) * (1 - E.survivalProb(c.mortMp, c.age, c.planTo));
      you += ' Chance at least one of you does: <strong>' + pct(pBoth) + '</strong>. Your partner is assumed to be your age.';
    }
    set('you', you);

    var sn = c.stateNow, sr = c.stateRet;
    var loc = sr.n + ': ~<strong>' + (c.stateRate * 100).toFixed(1) + '%</strong> state tax on retirement income above the deduction';
    if (sr.allRet !== undefined) loc += ', but pensions, IRAs, 401(k)s' + (sr.allRet > 0 ? ' (from ' + sr.allRet + ')' : '') + ' and Social Security are exempt';
    else if (sr.excl) loc += ', with a retirement-income exclusion of up to ' + full(sr.excl[sr.excl.length - 1][1]) + ' per person from ' + sr.excl[sr.excl.length - 1][0];
    loc += sr.ss ? '. Taxes some Social Security.' : '. Social Security is not taxed by the state.';
    if (i.adjustCOL && sn !== sr) loc += ' Living costs there are <strong>' + pct(c.colFactor - 1 >= 0 ? c.colFactor - 1 : 1 - c.colFactor) + (c.colFactor >= 1 ? ' higher' : ' lower') + '</strong> than in ' + sn.n + ', so spending is scaled to match.';
    set('location', loc);

    var con = b.contributions;
    var inc = 'You save <strong>' + full(con.employee) + '</strong> a year plus <strong>' + full(con.match) + '</strong> employer match: a <strong>' + pct(b.savingsRate) + '</strong> savings rate. ' +
      'After tax (~' + full(b.tax.total) + ') and saving, <strong>' + full(b.spending) + '</strong> a year is left to live on.';
    var lim = E.contribLimits(c, c.age);
    if (con.capped) inc += '<br><span class="warnline">401(k) capped at the ' + full(lim.k401) + ' limit for your age.</span>';
    if (con.overflow > 0) inc += '<br><span class="warnline">' + full(con.overflow) + ' over the IRA/HSA limits is counted as brokerage savings instead.</span>';
    var matchGap = (+i.matchUpToPct || 0) - (+i.k401Pct || 0);
    if (matchGap > 0 && (+i.matchRate || 0) > 0) inc += '<br><span class="warnline">You are leaving ' + full(c.salary * matchGap / 100 * (+i.matchRate) / 100) + ' a year of match unclaimed.</span>';
    set('income', inc);

    var tot = (+i.trad || 0) + (+i.roth || 0) + (+i.taxable || 0) + (+i.cash || 0) + (+i.hsa || 0);
    set('balances', 'Total <strong>' + full(tot) + '</strong>' + (b.wages > 0 ? ', or <strong>' + (tot / b.wages).toFixed(1) + '×</strong> your household income.' : '.'));

    var base = E.baseSpending(c, targetAge());
    var sp = 'Planned core spending in retirement: <strong>' + full(base) + '</strong> a year';
    if (c.colFactor !== 1) sp += ' (after the cost-of-living adjustment)';
    sp += '. Your current lifestyle, excluding the mortgage, costs about <strong>' + full(b.lifestyle) + '</strong>.';
    set('spending', sp);

    var ss = det.ss;
    var ssTxt = (i.ssMode === 'manual' ? 'Entered' : 'Estimated') + ' benefit at full retirement age (' + (c.fraM / 12).toFixed(c.fraM % 12 ? 1 : 0) + '): <strong>' + full(ss.piaU) + '/mo</strong>';
    ssTxt += '; claiming at ' + ss.claimU + ' pays <strong>' + full(ss.ownU / 12) + '/mo</strong> (' + pct(E.claimFactor(ss.claimU, c.fraM)) + ' of it).';
    if (c.filing === 'mfj') ssTxt += ' Partner: <strong>' + full((ss.ownP + ss.topP) / 12) + '/mo</strong> at ' + ss.claimP + (ss.topP > 0 ? ', including a spousal top-up' : '') + '.';
    if (i.ssMode !== 'manual') ssTxt += ' Rebuilt from your salary and a typical career path; your ssa.gov statement is more accurate.';
    set('ss', ssTxt);

    var w = c.wRet, mean = w * c.mS + (1 - w) * c.mB;
    var vr = w * w * c.sS * c.sS + (1 - w) * (1 - w) * c.sB * c.sB + 2 * w * (1 - w) * 0.1 * c.sS * c.sB;
    var med = mean - vr / (2 * (1 + mean));
    set('invest', 'At your retirement mix, expected return is <strong>' + pct(mean, 1) + '</strong> a year on average, or <strong>' + pct((1 + med - c.fee) / (1 + c.mI) - 1, 1) + '</strong> after fees and inflation for a typical (median) year-on-year path. Volatility about <strong>' + pct(Math.sqrt(vr), 1) + '</strong>.');

    $('#note-you').textContent = 'age ' + c.age + ', retire ' + targetAge();
    $('#note-balances').textContent = money(tot);
    $('#note-income').textContent = money(b.wages) + ' · ' + pct(b.savingsRate) + ' saved';
    $('#note-location').textContent = c.stateNow === c.stateRet ? c.stateNow.n : c.stateNow.n + ' → ' + c.stateRet.n;
    $('#note-events').textContent = (i.events || []).length ? (i.events || []).length + ' planned' : '';
  }

  function lifeExpectancy(M, age) {
    var e = 0;
    for (var x = age; x < 125; x += 0.25) e += E.survivalProb(M, age, x) * 0.25;
    return age + e;
  }

  // ---------------------------------------------------------------------
  // Charts (hand-built SVG with a hover layer)
  // ---------------------------------------------------------------------
  function niceTicks(lo, hi, n) {
    if (hi <= lo) hi = lo + 1;
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = n / span * step;
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
    var t = [], v = Math.floor(lo / step) * step;
    while (v < hi + step * 0.5) { t.push(v); v += step; if (t.length > 20) break; }
    if (t[t.length - 1] < hi) t.push(t[t.length - 1] + step);
    return t;
  }

  var tip = null;
  function showTip(evt, html) {
    tip = tip || $('#tooltip');
    tip.innerHTML = html; tip.hidden = false;
    var x = evt.clientX + 14, y = evt.clientY + 14;
    var r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function chart(el, cfg) {
    if (!el) return;
    el.__cfg = cfg;
    drawChart(el);
    if (!el.__ro && window.ResizeObserver) {
      el.__ro = new ResizeObserver(function () { if (Math.abs((el.__w || 0) - el.clientWidth) > 4) drawChart(el); });
      el.__ro.observe(el);
    }
  }

  function drawChart(el) {
    var cfg = el.__cfg;
    var W = Math.max(280, el.clientWidth || 640);
    el.__w = el.clientWidth;
    var H = cfg.height || 280;
    var m = { l: cfg.yLabelWidth || 58, r: 14, t: 14, b: 30 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var xs = cfg.x, n = xs.length;
    var banded = cfg.series.some(function (s) { return s.type === 'bars' || s.type === 'stackbars'; });
    var yMin = cfg.yMin || 0, yMax = cfg.yMax;
    if (yMax === undefined) {
      yMax = 0;
      cfg.series.forEach(function (s) {
        var arrs = s.type === 'band' ? [s.hi] : s.type === 'stack' || s.type === 'stackbars' ? [stackTop(s.ys)] : s.type === 'hline' ? [[s.y]] : [s.y];
        arrs.forEach(function (a) { for (var i = 0; i < a.length; i++) if (isFinite(a[i]) && a[i] > yMax) yMax = a[i]; });
      });
      if (cfg.yCap && yMax > cfg.yCap) yMax = cfg.yCap;
    }
    var ticks = niceTicks(yMin, yMax || 1, cfg.yTicks || 5);
    yMax = ticks[ticks.length - 1];
    var step = banded ? iw / n : iw / Math.max(1, n - 1);
    var sx = function (i) { return m.l + (banded ? (i + 0.5) * step : i * step); };
    var sy = function (v) { return m.t + ih - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin) * ih; };
    var yf = cfg.yFormat || money;
    var parts = [];
    parts.push('<g class="grid">');
    ticks.forEach(function (t) { parts.push('<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/>'); });
    parts.push('</g>');
    ticks.forEach(function (t) { parts.push('<text x="' + (m.l - 8) + '" y="' + (sy(t) + 4) + '" text-anchor="end">' + yf(t) + '</text>'); });
    // x labels every 5 years (or fit)
    var every = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(iw / 48))));
    if (every > 1 && every < 5) every = 5; else if (every > 5) every = Math.ceil(every / 5) * 5;
    for (var i = 0; i < n; i++) {
      if ((xs[i] % every === 0) || (every === 1)) parts.push('<text x="' + sx(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + (cfg.xFormat ? cfg.xFormat(xs[i]) : xs[i]) + '</text>');
    }
    parts.push('<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + sy(yMin) + '" y2="' + sy(yMin) + '" style="stroke:var(--axis)"/>');

    cfg.series.forEach(function (s) {
      if (s.type === 'band') {
        var d = '';
        for (var i = 0; i < n; i++) d += (i ? 'L' : 'M') + sx(i).toFixed(1) + ',' + sy(s.hi[i]).toFixed(1);
        for (i = n - 1; i >= 0; i--) d += 'L' + sx(i).toFixed(1) + ',' + sy(s.lo[i]).toFixed(1);
        parts.push('<path d="' + d + 'Z" style="fill:' + s.color + ';fill-opacity:' + (s.opacity || 0.2) + '"/>');
      } else if (s.type === 'stack') {
        var cum = new Array(n).fill(0);
        s.ys.forEach(function (arr, k) {
          var d = '', i;
          for (i = 0; i < n; i++) d += (i ? 'L' : 'M') + sx(i).toFixed(1) + ',' + sy(cum[i] + arr[i]).toFixed(1);
          for (i = n - 1; i >= 0; i--) d += 'L' + sx(i).toFixed(1) + ',' + sy(cum[i]).toFixed(1);
          parts.push('<path d="' + d + 'Z" style="fill:' + s.colors[k] + ';stroke:var(--surface);stroke-width:1"/>');
          for (i = 0; i < n; i++) cum[i] += arr[i];
        });
      } else if (s.type === 'stackbars') {
        var bw = Math.max(1, step * 0.72);
        for (var j = 0; j < n; j++) {
          var acc = 0;
          for (var k = 0; k < s.ys.length; k++) {
            var v = s.ys[k][j];
            if (!(v > 0)) continue;
            var y0 = sy(acc), y1 = sy(acc + v);
            var hgt = Math.max(0, y0 - y1 - (step > 6 ? 1 : 0));
            parts.push('<rect x="' + (sx(j) - bw / 2).toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" style="fill:' + s.colors[k] + '"/>');
            acc += v;
          }
        }
      } else if (s.type === 'bars') {
        var bw2 = Math.max(1, step * (s.width || 0.72));
        for (var b = 0; b < n; b++) {
          var val = s.y[b];
          if (!(val > 0)) continue;
          var col = s.colorFn ? s.colorFn(b) : s.color;
          var top = sy(val), h = sy(yMin) - top;
          parts.push('<rect x="' + (sx(b) - bw2 / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw2.toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="' + Math.min(3, bw2 / 3).toFixed(1) + '" style="fill:' + col + '"/>');
        }
      } else if (s.type === 'line') {
        var pts = [];
        for (var q = 0; q < n; q++) if (isFinite(s.y[q])) pts.push(sx(q).toFixed(1) + ',' + sy(s.y[q]).toFixed(1));
        parts.push('<polyline points="' + pts.join(' ') + '" style="fill:none;stroke:' + s.color + ';stroke-width:' + (s.width || 2) + ';stroke-linejoin:round;stroke-linecap:round' + (s.dash ? ';stroke-dasharray:' + s.dash : '') + '"/>');
      } else if (s.type === 'hline') {
        parts.push('<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + sy(s.y) + '" y2="' + sy(s.y) + '" style="stroke:' + s.color + ';stroke-width:1.5;stroke-dasharray:5 4"/>');
        if (s.label) parts.push('<text class="lbl" x="' + (m.l + 6) + '" y="' + (sy(s.y) - 6) + '">' + esc(s.label) + '</text>');
      }
    });
    (cfg.markers || []).forEach(function (mk) {
      var idx = xs.indexOf(mk.x);
      if (idx < 0) return;
      var x = sx(idx);
      parts.push('<line x1="' + x + '" x2="' + x + '" y1="' + m.t + '" y2="' + (m.t + ih) + '" style="stroke:var(--ink-2);stroke-width:1;stroke-dasharray:2 3"/>');
      parts.push('<text class="lbl" x="' + (x + 5) + '" y="' + (m.t + 10) + '">' + esc(mk.label) + '</text>');
    });
    parts.push('<g class="hover"></g>');
    parts.push('<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" style="fill:transparent"/>');
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(cfg.label || '') + '">' + parts.join('') + '</svg>';

    var svg = el.firstChild, hover = svg.querySelector('.hover'), hit = svg.querySelector('.hit');
    function idxAt(evt) {
      var r = svg.getBoundingClientRect();
      var px = (evt.clientX - r.left) * (W / r.width);
      var i = banded ? Math.floor((px - m.l) / step) : Math.round((px - m.l) / step);
      return Math.max(0, Math.min(n - 1, i));
    }
    hit.addEventListener('pointermove', function (evt) {
      var i = idxAt(evt);
      var x = sx(i);
      var h = '<line class="crosshair" x1="' + x + '" x2="' + x + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/>';
      (cfg.dots ? cfg.dots(i) : []).forEach(function (d) {
        if (isFinite(d.v)) h += '<circle cx="' + x + '" cy="' + sy(d.v) + '" r="4" style="fill:' + d.c + ';stroke:var(--surface);stroke-width:2"/>';
      });
      hover.innerHTML = h;
      if (cfg.tip) {
        var t = cfg.tip(i);
        showTip(evt, '<div class="tt-h">' + t.title + '</div>' + t.rows.map(function (r) {
          return '<div class="tt-r"><span>' + (r.c ? '<i style="background:' + r.c + '"></i>' : '') + esc(r.n) + '</span><span>' + r.v + '</span></div>';
        }).join(''));
      }
    });
    hit.addEventListener('pointerleave', function () { hover.innerHTML = ''; hideTip(); });
  }
  function stackTop(ys) {
    var n = ys[0] ? ys[0].length : 0, out = new Array(n).fill(0);
    ys.forEach(function (a) { for (var i = 0; i < n; i++) out[i] += a[i] > 0 ? a[i] : 0; });
    return out;
  }
  function legend(items) {
    return '<div class="legend">' + items.map(function (it) {
      var style = it.kind === 'dash' ? 'color:' + it.c : 'background:' + it.c + (it.o ? ';opacity:' + it.o : '');
      return '<span><i class="' + (it.kind || '') + '" style="' + style + '"></i>' + esc(it.n) + '</span>';
    }).join('') + '</div>';
  }

  // ---------------------------------------------------------------------
  // Hero
  // ---------------------------------------------------------------------
  function renderHero() {
    var R = targetAge(), T = successTarget(), mc = state.mc, by = state.byAge, c = state.c;
    var lead;
    if (!by) {
      lead = '<div class="hero-cell lead"><span class="eyebrow">Earliest you can retire</span><span class="big skeleton">…</span><span class="sub">Simulating markets for every age from ' + c.age + '…</span></div>';
    } else if (by.earliest === null) {
      lead = '<div class="hero-cell lead"><span class="eyebrow">Earliest you can retire</span><span class="big">' + (by.hi + 1) + '+</span><span class="pill bad">Not within the plan</span><span class="sub">Even retiring at ' + by.hi + ' reaches less than ' + pct(T) + ' confidence. See <em>Hit your target</em> for what would change that.</span></div>';
    } else {
      var diff = by.earliest - R;
      var sub = diff < 0 ? (-diff) + ' year' + (diff === -1 ? '' : 's') + ' before your target of ' + R : diff > 0 ? diff + ' year' + (diff === 1 ? '' : 's') + ' after your target of ' + R : 'Exactly your target age';
      lead = '<div class="hero-cell lead"><span class="eyebrow">Earliest you can retire</span><span class="big">' + by.earliest + '</span><span class="sub">' + sub + ', with ' + pct(T) + ' of simulated markets lasting to ' + c.planTo + ' (in ' + Math.min(+state.inputs.mcRuns || 2000, 800).toLocaleString() + ' runs per age).</span></div>';
    }
    var at;
    if (!mc) at = '<div class="hero-cell"><span class="eyebrow">If you retire at ' + R + '</span><span class="mid skeleton">…</span><span class="sub">Running ' + (+state.inputs.mcRuns || 2000).toLocaleString() + ' simulations…</span></div>';
    else {
      var y = R - c.age;
      at = '<div class="hero-cell"><span class="eyebrow">If you retire at ' + R + '</span><span class="mid">' + pct(mc.success) + '</span>' + statusPill(mc.success, T) +
        '<span class="sub">chance your money lasts to ' + c.planTo + '. Median savings at ' + R + ': <strong>' + money(mc.bands.values[3][y]) + '</strong> in today\'s dollars.</span></div>';
    }
    var de = state.detEarliest;
    var avg = '<div class="hero-cell"><span class="eyebrow">In an average market</span><span class="mid">' + (de === null ? '85+' : de) + '</span>' +
      '<span class="sub">If every year delivered the typical return. Bad sequences of returns early in retirement are why the confident answer is later.</span></div>';
    $('#hero').innerHTML = lead + at + avg;
  }

  // ---------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------
  function renderOverview() {
    var p = $('#panel-overview');
    var R = targetAge(), c = state.c, det = state.det, mc = state.mc, b = state.budget;
    var rows = det.rows, ages = rows.map(function (r) { return r.age; });
    var retireRow = rows[R - c.age] || rows[0];
    var firstRet = rows.filter(function (r) { return r.phase === 'retired'; })[0];
    var lifetimeTax = 0, lifetimeSpend = 0;
    rows.forEach(function (r) { if (r.phase === 'retired') { lifetimeTax += r.fedTax + r.stateTax + r.penalty; lifetimeSpend += r.spending; } });
    var ssAnnual = det.ss.ownU + det.ss.ownP + det.ss.topU + det.ss.topP;
    var lev = state.levers;

    var stats = [
      { k: 'Savings at ' + R + ' (average market)', v: money(rows[Math.max(0, R - c.age - 1)] ? rows[Math.max(0, R - c.age - 1)].total : 0), d: 'today\'s dollars' },
      { k: 'First-year withdrawal rate', v: firstRet ? pct(firstRet.withdrawalRate, 1) : '—', d: firstRet ? (firstRet.withdrawalRate <= 0.04 ? 'at or under the 4% rule of thumb' : 'above the 4% rule of thumb') : '' },
      { k: 'Sustainable spending at ' + R, v: lev ? (lev.spending.value === null ? 'under 20%' : money(lev.spending.value * lev.spending.base)) : '…', d: lev ? 'per year at ' + pct(successTarget()) + ' confidence, vs ' + money(lev.spending.base) + ' planned' : 'solving…' },
      { k: 'Social Security, household', v: money(ssAnnual), d: 'per year at your claiming ages' + (+state.inputs.ssCutPct > 0 ? ', before the ' + state.inputs.ssCutPct + '% cut' : '') },
      { k: 'Lifetime tax rate in retirement', v: pct(lifetimeTax / Math.max(1, lifetimeSpend + lifetimeTax), 1), d: money(lifetimeTax) + ' of federal and state tax' },
      { k: 'Running out while alive', v: mc ? pct(1 - mc.aliveSuccess, 1) : '…', d: 'chance, allowing for how long you are likely to live' },
      { k: 'Current savings rate', v: pct(b.savingsRate), d: 'including employer match' },
      { k: 'Ending balance at ' + c.planTo, v: mc ? money(mc.endPct.p50) : money(det.end), d: mc ? 'median; 10th pct ' + money(mc.endPct.p10) : 'average market' }
    ];

    p.innerHTML =
      '<div class="card"><h2>Your savings over time</h2><p class="lede">Total across all accounts, in today\'s dollars. The bands show where 50% and 90% of simulated markets land; the dashed line is the average-market path.</p>' +
      '<div class="chart" id="ch-fan"></div><div id="lg-fan"></div></div>' +
      '<div class="stats">' + stats.map(function (s) { return '<div class="stat"><span class="k">' + s.k + '</span><span class="v">' + s.v + '</span><span class="d">' + s.d + '</span></div>'; }).join('') + '</div>' +
      '<div class="card"><h2>Where the money sits</h2><p class="lede">Average-market path by account type. Taxes depend on which bucket each dollar comes from, so the mix matters as much as the total.</p><div class="chart" id="ch-accts"></div>' +
      legend([{ n: '401(k) / traditional', c: 'var(--s1)' }, { n: 'Roth', c: 'var(--s3)' }, { n: 'Brokerage', c: 'var(--s2)' }, { n: 'Cash', c: 'var(--s4)' }, { n: 'HSA', c: 'var(--s7)' }]) + '</div>';

    var series = [], dots, tipFn;
    var detTotals = rows.map(function (r) { return r.total; });
    if (mc) {
      var v = mc.bands.values;
      series.push({ type: 'band', lo: v[0], hi: v[6], color: 'var(--s1)', opacity: 0.13 });
      series.push({ type: 'band', lo: v[2], hi: v[4], color: 'var(--s1)', opacity: 0.25 });
      series.push({ type: 'line', y: v[3], color: 'var(--s1)' });
      dots = function (i) { return [{ v: v[3][i], c: 'var(--s1)' }]; };
      tipFn = function (i) {
        return { title: 'Age ' + ages[i] + ' · ' + (E.BASE_YEAR + i), rows: [
          { n: '95th percentile', v: money(v[6][i]) }, { n: '75th', v: money(v[4][i]) },
          { n: 'Median', v: money(v[3][i]), c: 'var(--s1)' }, { n: '25th', v: money(v[2][i]) }, { n: '5th', v: money(v[0][i]) },
          { n: 'Still funded', v: pct(mc.fundedByAge[i]) }, { n: 'Average market', v: money(detTotals[i]) }] };
      };
    } else {
      dots = function (i) { return [{ v: detTotals[i], c: 'var(--ink-2)' }]; };
      tipFn = function (i) { return { title: 'Age ' + ages[i], rows: [{ n: 'Average market', v: money(detTotals[i]) }] }; };
    }
    series.push({ type: 'line', y: detTotals, color: 'var(--ink-2)', dash: '5 4', width: 1.5 });
    var cap = mc ? Math.max(mc.bands.values[5].reduce(function (a, b) { return Math.max(a, b); }, 0), 1) : undefined;
    chart($('#ch-fan'), { x: ages, series: series, height: 300, markers: [{ x: R, label: 'Retire ' + R }], dots: dots, tip: tipFn, yCap: cap, label: 'Projected savings by age' });
    $('#lg-fan').innerHTML = legend(mc ? [{ n: 'Median', c: 'var(--s1)', kind: 'line' }, { n: 'Middle 50%', c: 'var(--s1)', o: 0.4 }, { n: 'Middle 90%', c: 'var(--s1)', o: 0.18 }, { n: 'Average market', c: 'var(--ink-2)', kind: 'dash' }] : [{ n: 'Average market (simulations running)', c: 'var(--ink-2)', kind: 'dash' }]);

    var keys = ['trad', 'roth', 'taxable', 'cash', 'hsa'], cols = ['var(--s1)', 'var(--s3)', 'var(--s2)', 'var(--s4)', 'var(--s7)'], names = ['401(k) / traditional', 'Roth', 'Brokerage', 'Cash', 'HSA'];
    chart($('#ch-accts'), {
      x: ages, height: 260, label: 'Savings by account type',
      series: [{ type: 'stack', ys: keys.map(function (k) { return rows.map(function (r) { return r[k]; }); }), colors: cols }],
      markers: [{ x: R, label: 'Retire' }],
      tip: function (i) { return { title: 'Age ' + ages[i], rows: keys.map(function (k, j) { return { n: names[j], v: money(rows[i][k]), c: cols[j] }; }).reverse().concat([{ n: 'Total', v: money(rows[i].total) }]) }; }
    });
  }

  // ---------------------------------------------------------------------
  // Hit your target
  // ---------------------------------------------------------------------
  function renderTarget() {
    var p = $('#panel-target');
    var R = targetAge(), T = successTarget(), mc = state.mc, lev = state.levers, c = state.c, i = state.inputs;
    var head = '<div class="card"><h2>Retiring at ' + R + ' with ' + pct(T) + ' confidence</h2>';
    if (!mc) head += '<p class="lede">Running simulations…</p>';
    else head += '<p class="lede">Today your plan works in <strong>' + pct(mc.success) + '</strong> of simulated markets. ' +
      (mc.success >= T ? 'You are on track. The figures below show how much room you have.' : 'Any one of the changes below, on its own, would get you to ' + pct(T) + '. Combining smaller versions of several works too.') + '</p>';
    if (!lev) head += '<p class="note">Solving each lever with 500 simulations per try…</p>';
    else {
      var cards = [];
      var s = lev.savings;
      cards.push({ k: 'Save more', v: s.value === null ? 'Not enough alone' : s.already ? 'Nothing extra' : full(s.value / 12) + '/mo',
        d: s.value === null ? 'Even $150k a year more would not do it.' : s.already ? 'Your current saving already gets you there.' : full(s.value) + ' a year more into investments, starting now.' });
      var sp = lev.spending;
      var spv = sp.value === null ? null : sp.value * sp.base;
      cards.push({ k: sp.value !== null && sp.value >= 1 ? 'You could spend up to' : 'Spend less', v: spv === null ? 'Not enough alone' : full(spv) + '/yr',
        d: spv === null ? 'Even an 80% cut would not do it.' : sp.value >= 1 ? pct(sp.value - 1) + ' more than your plan of ' + full(sp.base) + '.' : pct(1 - sp.value) + ' less than the ' + full(sp.base) + ' you planned (before healthcare).' });
      var wl = lev.workLonger.value;
      cards.push({ k: 'Work longer', v: wl === null ? 'Past 85' : 'Retire at ' + wl, d: wl === null ? 'Not reachable by timing alone.' : wl === R ? 'Your target age is already the earliest that meets the goal.' : wl < R ? 'You could stop ' + (R - wl) + ' year' + (R - wl === 1 ? '' : 's') + ' sooner than planned.' : (wl - R) + ' more year' + (wl - R === 1 ? '' : 's') + ' of work and saving.' });
      var pt = lev.partTime;
      cards.push({ k: 'Earn part-time', v: pt.value === null ? 'Not enough alone' : pt.already ? 'Not needed' : full(pt.value) + '/yr', d: pt.value === null ? 'Even $200k a year would not close it.' : pt.already ? 'You do not need work income in retirement.' : 'From ' + R + ' until ' + pt.until + ', replacing any part-time income you entered.' });
      var rt = lev.returns;
      cards.push({ k: 'Higher returns (not in your control)', v: rt.value === null ? '6+ points' : rt.already ? 'None needed' : '+' + rt.value.toFixed(1) + ' pts', d: 'Extra yearly return on stocks and bonds that would be needed. Shown for context; chasing it means more risk.' });
      head += '<div class="levers">' + cards.map(function (c) { return '<div class="lever"><span class="k">' + c.k + '</span><span class="v">' + c.v + '</span><span class="d">' + c.d + '</span></div>'; }).join('') + '</div>';
    }
    head += '</div>';

    var claims = '<div class="card"><h2>When to claim Social Security</h2><p class="lede">Each year you wait past 62 raises your benefit for life (about 7–8% a year), but you draw more from savings while you wait. Success rate for retiring at ' + R + ':</p>';
    if (!state.claims) claims += '<p class="note">Simulating…</p>';
    else {
      var best = state.claims.reduce(function (a, b) { return b.success > a.success + 0.004 ? b : a; });
      claims += '<div class="table-wrap"><table><thead><tr><th>Claim at</th><th>Your monthly benefit</th><th>Success</th><th>Average-market estate at ' + c.planTo + '</th></tr></thead><tbody>' +
        state.claims.map(function (r) {
          var ben = state.det.ss.piaU * E.claimFactor(r.age, c.fraM);
          return '<tr><td>' + r.age + (r.age === best.age ? ' <span class="pill good">Best</span>' : '') + (r.age === +i.ssClaimAge ? ' <span class="pill warn">Your plan</span>' : '') + '</td><td>' + full(ben) + '</td><td>' + pct(r.success) + '</td><td>' + money(r.det) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    claims += '</div>';

    p.innerHTML = head + '<div class="card"><h2>What to do next</h2><p class="lede">Specific to your numbers, most valuable first.</p><ul class="actions">' + actions().join('') + '</ul></div>' + claims + bridgeCard();
  }

  function act(level, title, body) {
    var w = { good: 'Good', warn: 'Do this', bad: 'Fix this', info: 'Consider' }[level];
    return '<li><span class="pill ' + (level === 'info' ? 'warn' : level) + '">' + w + '</span><div><strong>' + title + '</strong><p>' + body + '</p></div></li>';
  }

  function actions() {
    var i = state.inputs, c = state.c, b = state.budget, det = state.det, R = targetAge(), out = [];
    var rows = det.rows, con = b.contributions, lim = E.contribLimits(c, c.age);
    var matchGap = (+i.matchUpToPct || 0) - (+i.k401Pct || 0);
    if (matchGap > 0 && +i.matchRate > 0) out.push(act('bad', 'Claim your full employer match', 'Raise your 401(k) from ' + i.k401Pct + '% to ' + i.matchUpToPct + '% of salary. That is ' + full(c.salary * matchGap / 100 * i.matchRate / 100) + ' a year of free money, an instant ' + i.matchRate + '% return.'));
    var emergency = (+i.cash || 0) / Math.max(1, b.spending / 12);
    if (emergency < 3) out.push(act('warn', 'Build an emergency fund first', 'Your cash covers about ' + emergency.toFixed(1) + ' months of spending. Three to six months (' + full(b.spending / 4) + '–' + full(b.spending / 2) + ') keeps a job loss from forcing you to sell investments or raid retirement accounts.'));
    var room401 = lim.k401 - Math.min(lim.k401, c.salary * (+i.k401Pct || 0) / 100);
    if (room401 > 1000 && c.salary > 0) out.push(act('info', 'You have ' + full(room401) + ' of unused 401(k) room', 'The ' + E.BASE_YEAR + ' limit at your age is ' + full(lim.k401) + '. At your ~' + pct(b.tax.marginal) + ' marginal tax rate, traditional contributions save about ' + full(room401 * b.tax.marginal) + ' in tax this year.'));
    var iraUsed = (+i.iraRoth || 0) + (+i.iraTrad || 0);
    if (iraUsed < lim.ira - 500) out.push(act('info', 'Use your IRA allowance', 'You can put up to ' + full(lim.ira) + ' a year into IRAs' + (c.filing === 'mfj' ? ' (both spouses)' : '') + '; you are using ' + full(iraUsed) + '. A Roth IRA suits years when your tax rate is lower than you expect in retirement. Above the Roth income limit, use a backdoor Roth.'));
    if (!(+i.hsaContrib > 0)) out.push(act('info', 'If you have a high-deductible health plan, fund an HSA', 'HSAs are the only account that is tax-free going in, growing and coming out (for medical costs). Limit: ' + full(lim.hsa) + ' a year. Your plan expects ' + full(+i.healthPre65 || 0) + ' a year of healthcare before Medicare.'));
    if (R < 65) out.push(act('info', 'Plan for health insurance from ' + R + ' to 65', 'You will need ' + (65 - R) + ' years of private cover before Medicare. Your plan budgets ' + full(+i.healthPre65 || 0) + ' a year. ACA subsidies depend on your taxable income, which careful withdrawals from brokerage and Roth accounts can keep low.'));
    if (R < 60) {
      var bridgeNeed = 0;
      rows.forEach(function (r) { if (r.phase === 'retired' && r.age < 60) bridgeNeed += r.spending; });
      var accessible = 0;
      var rr = rows[R - c.age - 1] || rows[0];
      accessible = rr.taxable + rr.cash + rr.roth * Math.min(1, (+i.rothBasisPct || 0) / 100);
      if (bridgeNeed > accessible * 1.05) out.push(act('warn', 'Bridge the gap to 59½', 'Retiring at ' + R + ' needs about ' + money(bridgeNeed) + ' before penalty-free access to 401(k)s and IRAs, but only about ' + money(accessible) + ' is projected outside them. Save more in a brokerage account, or plan on the rule of 55' + (R >= 55 ? ' (which applies to you)' : '') + ', 72(t) payments, or a Roth conversion ladder.'));
    }
    var rmdRow = rows.filter(function (r) { return r.age === c.rmdAge; })[0];
    if (rmdRow && rmdRow.rmd > 0) {
      var rmdIncome = rmdRow.rmd + rmdRow.ss * 0.85 + rmdRow.pension;
      var taxable = Math.max(0, rmdIncome - c.std);
      var rate = 0.10; for (var k = 0; k < c.br.length; k++) if (taxable < c.br[k][0]) { rate = c.br[k][1]; break; }
      if (rate >= 0.22 && !(+i.rothConversionBracket > 0)) out.push(act('info', 'Your required distributions start in the ' + pct(rate) + ' bracket', 'From ' + c.rmdAge + ' you must withdraw about ' + money(rmdRow.rmd) + ' a year from traditional accounts. Converting some to Roth in the low-income years after you stop working can lower lifetime tax. Try the conversion setting under Withdrawal strategy.'));
    }
    if ((+i.fees || 0) >= 0.5) out.push(act('warn', 'Fees of ' + i.fees + '% a year are expensive', 'Over decades, every 0.5% in fees costs roughly 10–15% of your final balance. Broad index funds cost 0.03–0.10%.'));
    var sNow = c.stateRet;
    if (sNow.rate >= 5 && i.retireState === i.state) {
      var tn = E.clone(i); tn.retireState = i.state === 'FL' ? 'TX' : 'FL';
      var alt = E.deterministic(tn, R);
      var tx1 = 0, tx2 = 0;
      det.rows.forEach(function (r) { tx1 += r.stateTax; }); alt.rows.forEach(function (r) { tx2 += r.stateTax; });
      if (tx1 - tx2 > 20000) out.push(act('info', 'State taxes cost you about ' + money(tx1 - tx2) + ' over retirement', 'In a state with no income tax, such as ' + E.STATES[tn.retireState].n + ', you would keep that. The What-ifs tab shows the full effect, including living costs.'));
    }
    var w = +i.stockPctRetire;
    if (w < 30) out.push(act('info', 'A very cautious mix may not keep up with inflation', 'Only ' + w + '% in stocks at retirement. Over a 30-year retirement, too little growth is often a bigger risk than volatility.'));
    if (w > 85) out.push(act('info', 'A very aggressive mix at retirement', w + '% in stocks makes a crash in your first few years very damaging. Many planners hold 40–70% at retirement.'));
    if (!i.guardrails) out.push(act('info', 'Being willing to trim spending in bad years helps a lot', 'Turn on guardrails under Withdrawal strategy to see how flexible spending changes your odds.'));
    if (i.ssMode !== 'manual') out.push(act('info', 'Get your real Social Security figure', 'Your benefit was estimated from today\'s salary. Download your statement at ssa.gov/myaccount and enter the full-retirement-age amount for a sharper answer.'));
    if (!out.length) out.push(act('good', 'Your plan has no obvious gaps', 'Re-run it once a year or after big life changes.'));
    return out;
  }

  function bridgeCard() {
    var c = state.c, det = state.det, R = targetAge();
    var ret = det.rows.filter(function (r) { return r.phase === 'retired'; });
    if (!ret.length) return '';
    var ages = ret.map(function (r) { return r.age; });
    var keys = [
      { n: 'Social Security', c: 'var(--s1)', f: function (r) { return r.ss; } },
      { n: 'Pension & work', c: 'var(--s2)', f: function (r) { return r.pension + r.other; } },
      { n: 'Traditional (incl. RMDs)', c: 'var(--s3)', f: function (r) { return r.wdTrad + r.rmd; } },
      { n: 'Brokerage & cash', c: 'var(--s4)', f: function (r) { return r.wdTaxable + r.wdCash; } },
      { n: 'Roth & HSA', c: 'var(--s5)', f: function (r) { return r.wdRoth + r.wdHsa; } }
    ];
    setTimeout(function () {
      chart($('#ch-income'), {
        x: ages, height: 280, label: 'Retirement income by source',
        series: [{ type: 'stackbars', ys: keys.map(function (k) { return ret.map(k.f); }), colors: keys.map(function (k) { return k.c; }) },
          { type: 'line', y: ret.map(function (r) { return r.spending + r.fedTax + r.stateTax + r.penalty; }), color: 'var(--ink)', width: 1.5 }],
        tip: function (i) {
          var r = ret[i];
          return { title: 'Age ' + r.age, rows: keys.map(function (k) { return { n: k.n, v: money(k.f(r)), c: k.c }; }).reverse().concat([
            { n: 'Spending', v: money(r.spending) }, { n: 'Taxes', v: money(r.fedTax + r.stateTax + r.penalty) }, { n: 'Shortfall', v: r.shortfall > 0 ? money(r.shortfall) : '—' }]) };
        }
      });
    }, 0);
    return '<div class="card"><h2>Where retirement income comes from</h2><p class="lede">Average-market path, today\'s dollars. The line is spending plus tax; bars below it mean savings ran out.</p><div class="chart" id="ch-income"></div>' +
      legend(keys.map(function (k) { return { n: k.n, c: k.c }; }).concat([{ n: 'Spending + tax', c: 'var(--ink)', kind: 'line' }])) + '</div>';
  }

  // ---------------------------------------------------------------------
  // What-ifs
  // ---------------------------------------------------------------------
  var SANDBOX = [
    { k: 'dR', l: 'Retirement age', min: -10, max: 10, step: 1, fmt: function (v) { return String(targetAge() + v); } },
    { k: 'spend', l: 'Retirement spending', min: -40, max: 40, step: 5, fmt: function (v) { return (v > 0 ? '+' : '') + v + '%'; } },
    { k: 'save', l: 'Extra saving', min: 0, max: 5000, step: 100, fmt: function (v) { return '+' + full(v) + '/mo'; } },
    { k: 'ret', l: 'Returns vs. assumption', min: -3, max: 3, step: 0.5, fmt: function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' pts'; } },
    { k: 'infl', l: 'Inflation vs. assumption', min: -1.5, max: 4, step: 0.5, fmt: function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' pts'; } },
    { k: 'claim', l: 'Claim Social Security at', min: 62, max: 70, step: 1, fmt: function (v) { return String(v); } },
    { k: 'stocks', l: 'Stocks in retirement', min: 0, max: 100, step: 5, fmt: function (v) { return v + '%'; } },
    { k: 'ssCut', l: 'Social Security cut', min: 0, max: 50, step: 1, fmt: function (v) { return v + '%'; } }
  ];
  function sandboxDefaults() {
    var i = state.inputs;
    return { dR: 0, spend: 0, save: 0, ret: 0, infl: 0, claim: Math.round(+i.ssClaimAge || 67), stocks: Math.round(+i.stockPctRetire || 60), ssCut: Math.round(+i.ssCutPct || 0), stress: '' };
  }
  function sandboxInputs(sb) {
    var q = E.clone(state.inputs);
    var c = state.c;
    var base = E.baseSpending(c, targetAge() + sb.dR) / c.colFactor;
    if (sb.spend) { q.spendingMode = 'fixed'; q.spending = base * (1 + sb.spend / 100); }
    q.taxableSavings = (+q.taxableSavings || 0) + sb.save * 12;
    q.stockReturn = +q.stockReturn + sb.ret; q.bondReturn = +q.bondReturn + sb.ret; q.cashReturn = +q.cashReturn + sb.ret;
    q.inflation = +q.inflation + sb.infl;
    q.ssClaimAge = sb.claim; q.partnerClaimAge = sb.claim;
    q.stockPctRetire = sb.stocks; q.stockPctEnd = Math.min(+q.stockPctEnd, sb.stocks);
    q.ssCutPct = sb.ssCut;
    q.stress = sb.stress || null;
    return q;
  }

  function renderWhatIf() {
    var p = $('#panel-whatif');
    if (!state.sandbox) state.sandbox = sandboxDefaults();
    var sb = state.sandbox;
    if (!p.__built) {
      p.innerHTML = '<div class="card"><h2>Try a change</h2><p class="lede">Move the sliders; the average-market path updates instantly and a 1,000-run simulation follows. Nothing here changes your saved inputs.</p>' +
        '<div class="sandbox">' + SANDBOX.map(function (s) {
          return '<div class="slider"><label for="sb-' + s.k + '"><span>' + s.l + '</span><output id="sbo-' + s.k + '"></output></label><input type="range" id="sb-' + s.k + '" data-sb="' + s.k + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '"></div>';
        }).join('') +
        '<div class="field"><label for="sb-stress">Market stress test</label><select id="sb-stress" data-sb="stress"><option value="">None</option><option value="crash">Crash as you retire</option><option value="stagflation">1970s stagflation</option><option value="lostDecade">Lost decade for stocks</option></select></div>' +
        '</div><div class="row-actions"><button type="button" class="ghost" id="sb-reset">Reset sliders</button><button type="button" class="primary" id="sb-apply">Use these in my plan</button></div>' +
        '<div class="compare" id="sb-compare"></div><div class="chart" id="ch-sandbox" style="margin-top:12px"></div><div id="lg-sandbox"></div></div>' +
        '<div class="card"><h2>Scenarios</h2><p class="lede" id="scen-lede"></p><div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Retire at</th><th>Success</th><th>Change</th><th>Earliest age at ' + pct(successTarget()) + '</th><th>Average-market estate</th></tr></thead><tbody id="scen-body"></tbody></table></div></div>';
      p.__built = true;
      p.addEventListener('input', onSandbox);
      p.addEventListener('change', onSandbox);
      $('#sb-reset').addEventListener('click', function () { state.sandbox = sandboxDefaults(); syncSandbox(); sandboxRun(); });
      $('#sb-apply').addEventListener('click', applySandbox);
    }
    syncSandbox();
    renderScenarioTable();
    if (!state.quick && !running.quick) sandboxRun(true);
  }
  function syncSandbox() {
    var sb = state.sandbox;
    SANDBOX.forEach(function (s) { var el = $('#sb-' + s.k); if (el) { el.value = sb[s.k]; $('#sbo-' + s.k).textContent = s.fmt(+sb[s.k]); } });
    var st = $('#sb-stress'); if (st) st.value = sb.stress || '';
  }
  function onSandbox(e) {
    var k = e.target.dataset.sb;
    if (!k) return;
    state.sandbox[k] = k === 'stress' ? e.target.value : +e.target.value;
    syncSandbox();
    clearTimeout(onSandbox.t);
    sandboxDraw();
    onSandbox.t = setTimeout(sandboxRun, 250);
  }
  function applySandbox() {
    var sb = state.sandbox, i = state.inputs, c = state.c;
    if (sb.spend) { var base = E.baseSpending(c, targetAge() + sb.dR) / c.colFactor; i.spendingMode = 'fixed'; i.spending = Math.round(base * (1 + sb.spend / 100) / 100) * 100; }
    i.targetAge = targetAge() + sb.dR;
    i.taxableSavings = (+i.taxableSavings || 0) + sb.save * 12;
    i.stockReturn = +(+i.stockReturn + sb.ret).toFixed(2); i.bondReturn = +(+i.bondReturn + sb.ret).toFixed(2); i.cashReturn = +(+i.cashReturn + sb.ret).toFixed(2);
    i.inflation = +(+i.inflation + sb.infl).toFixed(2);
    i.ssClaimAge = sb.claim; i.partnerClaimAge = sb.claim; i.stockPctRetire = sb.stocks; i.ssCutPct = sb.ssCut;
    renderInputs();
    $('#panel-whatif').__built = false;
    changed();
  }
  function sandboxDraw() {
    var sb = state.sandbox, R = targetAge(), R2 = Math.max(state.c.age, R + sb.dR);
    var q = sandboxInputs(sb);
    var d2 = E.deterministic(q, R2);
    var rows = state.det.rows, ages = rows.map(function (r) { return r.age; });
    var a = rows.map(function (r) { return r.total; }), b = d2.rows.map(function (r) { return r.total; });
    var series = [{ type: 'line', y: a, color: 'var(--ink-2)', dash: '5 4', width: 1.5 }, { type: 'line', y: b, color: 'var(--s2)' }];
    if (state.quick && state.quick.median) series.push({ type: 'line', y: state.quick.median, color: 'var(--s2)', width: 1, dash: '1 3' });
    chart($('#ch-sandbox'), {
      x: ages, height: 240, series: series, markers: [{ x: R2, label: 'Retire ' + R2 }], label: 'Plan vs what-if',
      dots: function (i) { return [{ v: a[i], c: 'var(--ink-2)' }, { v: b[i], c: 'var(--s2)' }]; },
      tip: function (i) { return { title: 'Age ' + ages[i], rows: [{ n: 'Your plan', v: money(a[i]), c: 'var(--ink-2)' }, { n: 'What-if', v: money(b[i]), c: 'var(--s2)' }].concat(state.quick ? [{ n: 'What-if, simulated median', v: money(state.quick.median[i]) }] : []) }; }
    });
    $('#lg-sandbox').innerHTML = legend([{ n: 'Your plan (average market)', c: 'var(--ink-2)', kind: 'dash' }, { n: 'What-if (average market)', c: 'var(--s2)', kind: 'line' }].concat(state.quick ? [{ n: 'What-if, simulated median', c: 'var(--s2)', kind: 'dash' }] : []));
    var mc = state.mc, qk = state.quick;
    var cmp = [
      { k: 'Success', a: mc ? pct(mc.success) : '…', b: qk ? pct(qk.success) : '…' },
      { k: 'Retire at', a: String(R), b: String(R2) },
      { k: 'Estate at ' + state.c.planTo, a: money(state.det.end), b: money(d2.end) },
      { k: 'Money runs out', a: state.det.failedAt >= 0 ? 'at ' + state.det.failedAt : 'never', b: d2.failedAt >= 0 ? 'at ' + d2.failedAt : 'never' }
    ];
    $('#sb-compare').innerHTML = cmp.map(function (x) { return '<div class="stat" style="border:1px solid var(--line);border-radius:8px"><span class="k">' + x.k + '</span><span class="v">' + x.b + '</span><span class="d">plan: ' + x.a + '</span></div>'; }).join('');
  }
  function sandboxRun(initial) {
    var sb = state.sandbox, R2 = Math.max(state.c.age, targetAge() + sb.dR);
    if (!initial) state.quick = null;
    sandboxDraw();
    run('quick', { inputs: sandboxInputs(sb), target: R2, runs: 1000 }, function (kind, data) {
      if (kind === 'quick') { state.quick = data; sandboxDraw(); }
    });
  }

  function renderScenarioTable() {
    var body = $('#scen-body'), lede = $('#scen-lede');
    if (!body) return;
    if (!state.scenarios) {
      lede.textContent = 'Each scenario changes one thing and re-runs 800 simulations. Starting…';
      body.innerHTML = '';
      if (state.levers && !running.scenarios) startScenarios();
      return;
    }
    var list = state.scenarios, base = list.filter(function (s) { return s.id === 'base'; })[0];
    lede.textContent = list.done ? 'Each scenario changes one thing from your plan and re-runs 800 simulations (400 per age for the earliest age). Same random markets for each, so differences are due to the change alone.' : 'Running scenario ' + (list.length + 1) + '…';
    var group = '';
    body.innerHTML = list.map(function (s) {
      var d = base ? s.success - base.success : 0;
      var g = s.group !== group ? (group = s.group, '<tr><td class="text" colspan="6" style="background:var(--surface-2);font-weight:600;font-family:var(--font-body);color:var(--ink-2)">' + esc(s.group) + '</td></tr>') : '';
      return g + '<tr><td class="text">' + esc(s.label) + '</td><td>' + s.R + '</td><td>' + pct(s.success) + '</td><td class="' + (d > 0.005 ? 'delta-up' : d < -0.005 ? 'delta-down' : '') + '">' + (s.id === 'base' ? '—' : (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d * 100).toFixed(0) + ' pts') + '</td><td>' + (s.earliest === null ? '85+' : s.earliest) + '</td><td>' + money(s.end) + '</td></tr>';
    }).join('');
  }

  // ---------------------------------------------------------------------
  // Monte Carlo
  // ---------------------------------------------------------------------
  function renderMC() {
    var p = $('#panel-mc'), mc = state.mc, by = state.byAge, c = state.c, T = successTarget(), R = targetAge();
    if (!mc) { p.innerHTML = '<div class="card"><h2>Monte Carlo simulation</h2><p class="lede">Running ' + (+state.inputs.mcRuns || 2000).toLocaleString() + ' simulated lifetimes…</p></div>'; return; }
    var lede = 'Each run draws a fresh sequence of stock, bond and inflation years: correlated, fat-tailed for stocks, and with inflation that persists the way it does in real life. Your plan is replayed through each, with taxes, Social Security, RMDs and your withdrawal rules.';
    var deplAges = Object.keys(mc.depletionHist).map(Number);
    var failCount = deplAges.reduce(function (a, k) { return a + mc.depletionHist[k]; }, 0);
    p.innerHTML =
      '<div class="card"><h2>Success rate by retirement age</h2><p class="lede">Share of ' + Math.min(+state.inputs.mcRuns || 2000, 800).toLocaleString() + ' simulated markets where the money lasts to ' + c.planTo + ', for each age you might stop working. The same markets are used for every age.</p><div class="chart" id="ch-byage"></div>' +
      legend([{ n: 'Meets your ' + pct(T) + ' target', c: 'var(--s1)' }, { n: 'Below target', c: 'var(--line-strong)' }]) + '</div>' +
      '<div class="grid-2"><div class="card"><h2>Still funded, by age</h2><p class="lede">If you retire at ' + R + ': the share of simulations where savings have not yet run out.</p><div class="chart" id="ch-funded"></div></div>' +
      '<div class="card"><h2>When the money runs out</h2><p class="lede">' + (failCount ? 'In the ' + pct(failCount / mc.runs, 1) + ' of runs that fail, the age savings are exhausted.' : 'No simulation ran out of money.') + '</p><div class="chart" id="ch-depl"></div></div></div>' +
      '<div class="card"><h2>Range of outcomes at ' + R + '</h2><p class="lede">' + lede + '</p><div class="stats">' +
      [['Success to ' + c.planTo, pct(mc.success, 1)], ['Not running out while alive', pct(mc.aliveSuccess, 1)], ['Median estate', money(mc.endPct.p50)], ['10th-percentile estate', money(mc.endPct.p10)], ['90th-percentile estate', money(mc.endPct.p90)],
        ['Worst spending cut (10th pct)', state.inputs.guardrails ? pct(1 - mc.minSpendP10) : 'guardrails off']].map(function (s) { return '<div class="stat"><span class="k">' + s[0] + '</span><span class="v">' + s[1] + '</span></div>'; }).join('') + '</div>' +
      (state.inputs.guardrails ? '<div class="chart" id="ch-spend" style="margin-top:16px"></div>' + legend([{ n: 'Median spending', c: 'var(--s3)', kind: 'line' }, { n: '10th–90th percentile', c: 'var(--s3)', o: 0.3 }]) : '') + '</div>';

    if (by) {
      var list = by.list;
      chart($('#ch-byage'), {
        x: list.map(function (r) { return r.age; }), height: 240, yMax: 1, yFormat: function (v) { return pct(v); }, label: 'Success rate by retirement age',
        series: [{ type: 'bars', y: list.map(function (r) { return Math.max(0.004, r.success); }), colorFn: function (i) { return list[i].success >= T ? 'var(--s1)' : 'var(--line-strong)'; } },
          { type: 'hline', y: T, color: 'var(--ink-2)', label: pct(T) + ' target' }],
        tip: function (i) { return { title: 'Retire at ' + list[i].age, rows: [{ n: 'Success', v: pct(list[i].success, 1) }] }; }
      });
    } else $('#ch-byage').innerHTML = '<p class="note">Simulating each retirement age…</p>';

    chart($('#ch-funded'), {
      x: mc.ages, height: 220, yMax: 1, yFormat: function (v) { return pct(v); }, label: 'Share of simulations still funded',
      series: [{ type: 'line', y: mc.fundedByAge, color: 'var(--s1)' }], markers: [{ x: R, label: 'Retire' }],
      dots: function (i) { return [{ v: mc.fundedByAge[i], c: 'var(--s1)' }]; },
      tip: function (i) { return { title: 'Age ' + mc.ages[i], rows: [{ n: 'Still funded', v: pct(mc.fundedByAge[i], 1) }, { n: 'Chance you are alive', v: pct(E.survivalProb(c.mortM, c.age, mc.ages[i])) }] }; }
    });
    var hAges = mc.ages.filter(function (a) { return a >= R; });
    var hv = hAges.map(function (a) { return (mc.depletionHist[a] || 0) / mc.runs; });
    chart($('#ch-depl'), {
      x: hAges, height: 220, yFormat: function (v) { return pct(v, v < 0.1 ? 1 : 0); }, label: 'Age savings run out',
      series: [{ type: 'bars', y: hv, color: 'var(--s2)', width: 0.8 }],
      tip: function (i) { return { title: 'Runs out at ' + hAges[i], rows: [{ n: 'Share of all runs', v: pct(hv[i], 1) }] }; }
    });
    if (state.inputs.guardrails && mc.spendBands) {
      var ret = mc.ages.map(function (a, i) { return a >= R ? i : -1; }).filter(function (i) { return i >= 0; });
      var sb = mc.spendBands;
      chart($('#ch-spend'), {
        x: ret.map(function (i) { return mc.ages[i]; }), height: 220, label: 'Spending under guardrails',
        series: [{ type: 'band', lo: ret.map(function (i) { return sb[0][i]; }), hi: ret.map(function (i) { return sb[2][i]; }), color: 'var(--s3)', opacity: 0.22 }, { type: 'line', y: ret.map(function (i) { return sb[1][i]; }), color: 'var(--s3)' }],
        tip: function (k) { var i = ret[k]; return { title: 'Age ' + mc.ages[i], rows: [{ n: '90th pct', v: money(sb[2][i]) }, { n: 'Median', v: money(sb[1][i]) }, { n: '10th pct', v: money(sb[0][i]) }] }; }
      });
    }
  }

  // ---------------------------------------------------------------------
  // Year by year
  // ---------------------------------------------------------------------
  var COLS = [
    ['age', 'Age'], ['year', 'Year'], ['salary', 'Earned'], ['contrib', 'Saved'], ['ss', 'Social Sec.'], ['pension', 'Pension'],
    ['rmd', 'RMD'], ['conversion', 'Roth conv.'], ['wdTaxable', 'From brokerage'], ['wdTrad', 'From trad.'], ['wdRoth', 'From Roth'], ['wdCash', 'From cash'],
    ['fedTax', 'Federal tax'], ['stateTax', 'State tax'], ['penalty', 'Penalty'], ['spending', 'Spending'], ['shortfall', 'Shortfall'],
    ['trad', 'Traditional'], ['roth', 'Roth'], ['taxable', 'Brokerage'], ['cash', 'Cash'], ['hsa', 'HSA'], ['total', 'Total']
  ];
  function renderCash() {
    var p = $('#panel-cash'), det = state.det, R = targetAge();
    var nominal = state.nominal;
    var rows = det.rows;
    function val(r, k) {
      if (k === 'age' || k === 'year') return r[k];
      var v = r[k] || 0;
      // Balances are end-of-year; flows are during the year.
      if (nominal) v *= ['trad', 'roth', 'taxable', 'cash', 'hsa', 'total'].indexOf(k) >= 0 ? r.priceLevel : r.priceLevel / (1 + r.inflation);
      return v;
    }
    var body = rows.map(function (r) {
      var cls = r.age === R ? 'retire-row' : r.shortfall > 1 ? 'fail-row' : '';
      return '<tr class="' + cls + '">' + COLS.map(function (c) {
        var v = val(r, c[0]);
        return '<td>' + (c[0] === 'age' || c[0] === 'year' ? v : v === 0 ? '<span style="color:var(--muted)">–</span>' : full(v)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    p.innerHTML = '<div class="card"><h2>Year by year</h2><p class="lede">The average-market path for retiring at ' + R + '. Withdrawals happen at the start of each year; balances are at year end. ' +
      (nominal ? 'Shown in future (nominal) dollars at ' + state.inputs.inflation + '% inflation.' : 'Shown in today\'s dollars.') + '</p>' +
      '<div class="row-actions" style="margin:0 0 12px"><label class="check" style="grid-column:auto"><input type="checkbox" id="nominal-toggle"' + (nominal ? ' checked' : '') + '> Show future dollars</label>' +
      '<button type="button" class="ghost" id="csv-copy">Copy as CSV</button><button type="button" class="ghost" id="csv-dl">Download CSV</button></div>' +
      '<div class="table-wrap year-table"><table><thead><tr>' + COLS.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="note">Highlighted row: first year of retirement. Red rows: spending could not be fully covered.</p></div>';
    $('#nominal-toggle').addEventListener('change', function (e) { state.nominal = e.target.checked; renderCash(); });
    function csv() {
      return [COLS.map(function (c) { return c[1]; }).join(',')].concat(rows.map(function (r) { return COLS.map(function (c) { var v = val(r, c[0]); return c[0] === 'age' || c[0] === 'year' ? v : Math.round(v); }).join(','); })).join('\n');
    }
    $('#csv-copy').addEventListener('click', function (e) {
      var btn = e.target, text = csv();
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy as CSV'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { openIo('CSV', 'Select all and copy.', text, null); });
      else openIo('CSV', 'Select all and copy.', text, null);
    });
    $('#csv-dl').addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' }));
      a.download = 'retirement-plan.csv';
      document.body.appendChild(a); a.click(); a.remove();
    });
  }

  // ---------------------------------------------------------------------
  // Methodology
  // ---------------------------------------------------------------------
  function renderMethod() {
    var L = E.LAW, c = state.c;
    $('#panel-method').innerHTML = '<div class="card">' +
      '<h2>How the numbers are worked out</h2>' +
      '<p>Everything is calculated year by year from your current age to your plan age, in today\'s dollars. Inflation is still simulated, because several things in the tax code and in pensions are not adjusted for it.</p>' +
      '<h3>Working years</h3><p>Your salary grows at the raise you set. 401(k) contributions are capped at the ' + E.BASE_YEAR + ' limits (' + full(L.limits.k401) + ', plus ' + full(L.limits.k401Catch50) + ' from 50 and ' + full(L.limits.k401Catch60) + ' at 60–63), and so are IRAs (' + full(L.limits.ira) + ') and HSAs. The employer match is applied to the contributions you actually make. Contributions arrive through the year, so they get half a year of growth.</p>' +
      '<h3>Retirement years</h3><p>Each year the plan works out what you need (core spending, healthcare, any mortgage still running, one-off events), subtracts guaranteed income (Social Security, pensions, part-time work, required minimum distributions), and withdraws the rest from your accounts in the order you choose. It then solves for the tax on those withdrawals and withdraws enough extra to pay it.</p>' +
      '<ul><li>Before 59½, it draws from brokerage, cash and Roth contributions first, and only then from 401(k)/IRA money with the 10% penalty. The rule of 55 is applied if you leave work at 55 or later.</li>' +
      '<li>Required minimum distributions start at ' + c.rmdAge + ' for someone born in ' + c.birthYear + ' and use the IRS Uniform Lifetime Table.</li>' +
      '<li>Roth conversions, if switched on, fill your chosen bracket each year between retirement and RMDs. Converted money becomes available penalty-free after five years.</li>' +
      '<li>Healthcare costs grow faster than inflation by the rate you set; a fixed mortgage payment shrinks in real terms.</li></ul>' +
      '<h3>Taxes</h3><p>Federal tax uses the ' + E.BASE_YEAR + ' brackets and standard deduction (' + full(L.stdDed.single) + ' single, ' + full(L.stdDed.mfj) + ' married), the extra deduction from 65, the temporary ' + full(L.seniorBonus) + ' senior deduction through ' + L.seniorBonusLastYear + ', long-term capital gains rates stacked on top of ordinary income, the 3.8% net investment income tax, and the Social Security taxation formula. The $25,000/$32,000 Social Security thresholds and the investment-tax threshold are not indexed to inflation, so they bite harder over time; the model reflects that. Brokerage withdrawals are taxed only on the gain above your cost basis.</p>' +
      '<p>State tax is an approximation: an effective rate on income above the standard deduction, with each state\'s main exemptions for Social Security and retirement income. Use the override if you know your rate. Local taxes are only included where they hit retirement income.</p>' +
      '<h3>Social Security</h3><p>Unless you enter your own figure, your benefit is rebuilt from your current salary and a typical career earnings curve, capped at the ' + full(L.ss.wageBase) + ' wage base, using the ' + E.BASE_YEAR + ' bend points (' + full(L.ss.bend1) + ' and ' + full(L.ss.bend2) + '). Benefits are reduced for claiming before full retirement age and increased 8% a year for waiting to 70. Married couples get the spousal top-up. By default benefits are cut 19% from 2034, the Social Security Trustees\' projection if Congress does nothing; set the cut to 0 to assume full benefits.</p>' +
      '<h3>Markets</h3><p>The average-market answer uses the median (typical) return for your mix, which is below the arithmetic average once volatility is accounted for. The Monte Carlo draws stock and bond returns from lognormal distributions with your averages and volatilities, correlated with each other and with inflation. Stock returns use a fat-tailed Student-t distribution (5 degrees of freedom), so crashes appear about as often as they have historically. Inflation persists from year to year (autocorrelation 0.6), which is what makes the 1970s so damaging. Cash earns inflation plus your cash spread. Your stock share glides from today\'s mix to the retirement mix, then to the later mix over 15 years.</p>' +
      '<p>The default assumptions are in line with current long-term capital market forecasts, which sit somewhat below the last century\'s US results: stocks ' + E.defaults().stockReturn + '% average with ' + E.defaults().stockVol + '% volatility, bonds ' + E.defaults().bondReturn + '%, inflation ' + E.defaults().inflation + '%.</p>' +
      '<h3>Longevity</h3><p>"Success" means the money lasts to your plan age. Separately, each simulation draws a lifespan from a Gompertz mortality model calibrated to Social Security cohort life tables and adjusted for your health, to estimate the chance of running out while you, or either of you, is still alive.</p>' +
      '<h3>Earliest age and levers</h3><p>The earliest retirement age is the first age from which every later age meets your confidence target. Levers are found by bisection, each on its own, using the same simulated markets for every try so that the differences are real and not noise.</p>' +
      '<h3>What it does not model</h3><ul><li>Survivor benefits and the switch to single filing after a spouse dies; partners are assumed to be your age.</li><li>Medicare IRMAA surcharges, ACA premium subsidies, the Social Security earnings test, and state-specific credits.</li><li>Annuities, home equity (other than a sale you enter as an event), and changes to tax law after ' + E.BASE_YEAR + '.</li></ul>' +
      '<p>This is a planning tool, not financial advice. For a decision as large as when to retire, use it to frame the conversation with a fee-only fiduciary planner.</p></div>';
  }

  // ---------------------------------------------------------------------
  // Render dispatch
  // ---------------------------------------------------------------------
  function renderAll() {
    renderHero();
    var t = state.tab;
    if (t === 'overview') renderOverview();
    else if (t === 'target') renderTarget();
    else if (t === 'whatif') renderWhatIf();
    else if (t === 'mc') renderMC();
    else if (t === 'cash') renderCash();
    else if (t === 'method') renderMethod();
  }

  function selectTab(name) {
    state.tab = name;
    ['overview', 'target', 'whatif', 'mc', 'cash', 'method'].forEach(function (t) {
      $('#tab-' + t).setAttribute('aria-selected', t === name ? 'true' : 'false');
      $('#panel-' + t).hidden = t !== name;
    });
    try { localStorage.setItem(TAB_KEY, name); } catch (e) { /* ignore */ }
    hideTip();
    renderAll();
    if (name === 'whatif' && !state.scenarios && state.levers && !running.scenarios) startScenarios();
  }

  // ---------------------------------------------------------------------
  // Copy / paste inputs
  // ---------------------------------------------------------------------
  var ioApply = null;
  function openIo(title, help, text, apply) {
    $('#io-title').textContent = title; $('#io-help').textContent = help;
    $('#io-text').value = text; $('#io-error').hidden = true;
    $('#io-apply').hidden = !apply;
    ioApply = apply;
    var d = $('#io-dialog');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    setTimeout(function () { $('#io-text').select(); }, 30);
  }
  function closeIo() { var d = $('#io-dialog'); if (d.close) d.close(); else d.removeAttribute('open'); }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  function boot() {
    load();
    if (!state.isExample) $('#example-banner').hidden = true;
    renderInputs();
    var inputsEl = $('#inputs');
    inputsEl.addEventListener('input', onInput);
    inputsEl.addEventListener('change', onInput);
    inputsEl.addEventListener('click', function (e) {
      if (e.target.id === 'ev-add') {
        state.inputs.events = (state.inputs.events || []).concat([{ label: '', age: (+state.inputs.age || 35) + 10, amount: -10000, years: 1 }]);
        rerenderEvents(); changed();
      } else if (e.target.dataset.evDel !== undefined) {
        state.inputs.events.splice(+e.target.dataset.evDel, 1);
        rerenderEvents(); changed();
      }
    });
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { selectTab(b.id.replace('tab-', '')); });
    });
    $('#btn-reset').addEventListener('click', function () {
      state.inputs = exampleInputs(); state.isExample = true;
      $('#example-banner').hidden = false;
      save(); renderInputs(); $('#panel-whatif').__built = false; recompute();
    });
    $('#btn-share').addEventListener('click', function () {
      openIo('Your inputs', 'Copy this text to keep a copy of your plan or move it to another browser.', JSON.stringify(state.inputs, null, 1), null);
    });
    $('#btn-load').addEventListener('click', function () {
      openIo('Paste inputs', 'Paste text copied from "Copy inputs" and press Apply.', '', function (text) {
        var obj = JSON.parse(text);
        if (!obj || typeof obj !== 'object' || obj.age === undefined) throw new Error('That text does not look like saved inputs.');
        state.inputs = Object.assign(E.defaults(), obj);
        state.isExample = false; $('#example-banner').hidden = true;
        save(); renderInputs(); $('#panel-whatif').__built = false; recompute();
      });
    });
    $('#io-cancel').addEventListener('click', closeIo);
    $('#io-apply').addEventListener('click', function () {
      try { ioApply($('#io-text').value); closeIo(); }
      catch (err) { var el = $('#io-error'); el.textContent = 'Could not read that: ' + err.message; el.hidden = false; }
    });
    var tab = 'overview';
    try { tab = localStorage.getItem(TAB_KEY) || 'overview'; } catch (e) { /* ignore */ }
    if (!$('#tab-' + tab)) tab = 'overview';
    recompute();
    selectTab(tab);
  }

  function rerenderEvents() {
    var g = $('#grp-events .group-body');
    g.innerHTML = eventsHtml();
  }

  boot();
})();
