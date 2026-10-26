# Retirement Runway

A retirement planner that answers two questions: **when can you retire**, and
**what would it take to retire at the age you want**. It runs entirely in the
browser: no build step, no server, no data leaves your machine.

Open `index.html` in a browser (double-clicking it works), or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## What it does

- **Earliest retirement age** at the confidence level you choose, found by
  running the Monte Carlo for every candidate age on the same simulated markets.
- **Hit your target**: for a chosen retirement age, solves each lever on its own
  (extra saving, spending, working longer, part-time income, required return),
  a Social Security claiming-age comparison, and a checklist of concrete actions
  generated from your numbers (unclaimed match, unused 401(k)/IRA/HSA room,
  emergency fund, the pre-59½ bridge, RMD bracket exposure, fees, state tax).
- **What-ifs**: live sliders, plus ~25 scenarios (timing, spending, markets,
  stress tests such as a crash at retirement or 1970s stagflation, Social
  Security cuts and claiming ages, long-term care, moving state, asset mix,
  fees, guardrails, Roth conversions, withdrawal order).
- **Monte Carlo**: success by retirement age, share still funded by age,
  distribution of the age money runs out, outcome percentiles, and spending
  bands when guardrails are on.
- **Year by year**: full cash-flow and tax table, in today's or future dollars,
  with CSV export.

## The model

`engine.js` is a self-contained, dependency-free engine (also loadable from
Node). Highlights:

- Real-dollar simulation with explicit inflation, so non-indexed items (Social
  Security taxation thresholds, NIIT threshold, non-COLA pensions, fixed
  mortgage payments) erode correctly.
- 2026 federal tax law: brackets, standard and 65+ deductions, the 2025–2028
  senior deduction with phase-out, LTCG stacking, NIIT, Social Security
  taxation, 10% early-withdrawal penalty, rule of 55.
- 2026 contribution limits with age 50 and 60–63 catch-ups; employer match.
- Account-level withdrawals (taxable with cost basis, traditional, Roth with
  contribution basis and five-year conversion seasoning, HSA for healthcare,
  cash), RMDs from the Uniform Lifetime Table, optional Roth conversions and
  Guyton-Klinger-style guardrails, solved iteratively for the tax gross-up.
- Social Security PIA from 2026 bend points, early/delayed claiming factors,
  spousal top-up, optional trust-fund cut (default 19% from 2034).
- Approximate state taxes for all 50 states + DC, with Social Security and
  retirement-income exemptions, and cost-of-living scaling when relocating.
- Monte Carlo with correlated lognormal stock/bond returns, fat-tailed (t, 5 df)
  stock shocks, AR(1) inflation, seeded for reproducibility; Gompertz mortality
  calibrated to SSA cohort life expectancy.

The "How it works" tab in the app documents assumptions and limitations.

## Tests

```bash
node tests/engine.test.js
```
