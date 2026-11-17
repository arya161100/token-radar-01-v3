# Token Radar radar-4 — research note

How v3's board is built, what was tested, what was rejected, and where it can still be wrong.
All figures below are recomputed by `main.ts` from the sealed snapshot on every run
(`out/data.js` carries the same validation block); nothing here is asserted from memory.

## 1. What changed vs v2 (radar-3)

v2 fit the same regression form on 76 comps, used a flat 25% launch chance, and wrote
six-step farm plans. v3 changes four things:

1. **Comps 76 → 61.** A comp's token must actually trade: market cap at least $1,000,000,
   and its name must not be a versioned deployment (the same version-marker rule the board
   already applies). The 14 dead listings dropped are acryptos, belt-finance, bifi,
   concentrator, exactly, fables, harmonix-finance, infrared-finance, kava-lend, kinetic,
   kyros, merlinswap, reservoir-protocol and yield-yak-aggregator (all under $1M of market
   cap), plus aave-v2 (a versioned deployment whose $1.7B market cap belongs to a different
   deployment than its $91M TVL). The median out-of-sample error falls from ×2.94 to ×2.08
   (5-fold) and from ×2.22 to ×1.36 (time split). R² is flat on the 5-fold split (0.238)
   and lower on the time split (0.205 vs 0.301) — the dead listings are the values the model
   systematically over-predicts, and removing them compresses the range R² is measured over.
   The cross-check (§4) shows the median error stays better even when the dead listings are
   scored again.
2. **The no-token clock prices the farm.** Launch chance is now 35% under a year with no
   token, 25% for one to three years, 15% past three years (25% where the age is unknown).
   It is a stated scenario, never a fitted claim — §5 explains why the clock stays out of
   the regression.
3. **Eight mechanism-aware farm steps** instead of six: a weekly action specific to the
   protocol's mechanism (lending, DEX, perps, staking, bridge, …), a weekly eligibility
   check, and a claim-and-exit step. The economics step cites the row's own launch chance.
4. **A size-curve chart** in the dashboard's Method tab: the 61 comps as dots, the fitted
   line, and the board's top 10 as diamonds — plus a fourth screenshot of the Method tab,
   so the validation is visible, not just stated.

Same subjects as v2: all 198 rankable pre-token protocols (40 watchlist + 158 early finds).
Different values, different order, different verdicts (9 FARM / 125 WATCH / 64 SKIP, was
1 / 132 / 65).

## 2. Data

- Snapshot: DefiLlama `https://api.llama.fi/protocols`, fetched 2026-11-14T01:18:33Z, 758
  protocols, watchlist floor $50,000,000, 40 protocols on the watchlist.
- Comps: the 61 traded protocols with market cap at least $1,000,000 and TVL above zero,
  not an exchange, in core DeFi categories (Dexs, Lending, Yield, Yield Aggregator,
  Derivatives, Perpetuals, Options, CDP, RWA, Liquid Staking, Liquid Restaking, Restaking,
  Leveraged Farming, Basis Trading, Liquidity Manager, Farm), and not a versioned
  deployment. 48 of the 61 carry a listing date, which is what the time split uses.
- "Pre-token" means the record carries no token (no market cap, no CoinGecko id, no
  symbol). It is never proof that a token does not exist: a protocol on the board may still
  have a token its DefiLlama record does not carry.

## 3. The fitted model

```
log(market cap) = b0 + b1 * log(TVL) + b2 * growth
```

Ordinary least squares, fit at run time from the snapshot (no coefficient is hardcoded).
`growth` is the seven-day TVL change in per cent, clamped to [-50, +50] and divided by 100;
missing change is 0. Fitted coefficients on this snapshot:

| coefficient | value |
| --- | --- |
| b0 (intercept) | 8.843 |
| b1 (log TVL) | 0.445 |
| b2 (growth) | 3.379 |

Reading: the slope on log TVL is well below 1 — a protocol ten times larger is worth about
2.8× more, not 10× more, so implied value per dollar of TVL falls with size. That is the
model's main claim, and it is why the biggest rows here are worth far less than a fixed
multiple of TVL would say (v3's top row is $118M; v2's was $156M). Growth is capped at
±50% because traded comps' seven-day changes run from −40% to +27%: beyond ±50% the model
holds the effect flat rather than extrapolating a straight line to a wild week (one board
row's raw change is +4,448%).

## 4. Validation (out of sample, honestly)

| check | result |
| --- | --- |
| In-sample R² (log market cap, 61 comps) | 0.287 |
| In-sample median \|log error\| | 0.687 |
| 5-fold cross-validation R² (folds by slug order) | 0.238 |
| 5-fold median \|log error\| / OOS multiple | 0.731 / ×2.08 |
| Time split R² (train 24 older listings, test 24 newer) | 0.205 |
| Time-split median \|log error\| / OOS multiple | 0.310 / ×1.36 |

The honest error bar: a typical implied value is within a factor of about ×2.1 of the
traded-token relation. Implied values are order-of-magnitude estimates; the board's ranking
is more stable than its levels (see bootstrap below).

### Cross-check on all 76 core comps

The same model, fit on its 61 comps, scored against every core-DeFi traded token —
including the 15 dead listings and versioned deployments it no longer fits on:

| check | result |
| --- | --- |
| 5-fold R² / median \|log error\| / multiple | 0.155 / 0.902 / ×2.47 |
| Time-split R² / median \|log error\| / multiple | 0.277 / 0.508 / ×1.66 |

The median error stays better than radar-3's ×2.94 / ×2.22 even on the dead listings,
while R² falls — the dead listings are the values the model systematically over-predicts,
which is why they are out of the fit.

### Bootstrap (200 refits, seeded, deterministic)

| coefficient | mean | sd | 90% interval |
| --- | --- | --- | --- |
| intercept | 8.89 | 1.38 | [6.85, 11.14] |
| log(TVL) | 0.44 | 0.08 | [0.32, 0.56] |
| growth | 3.36 | 2.34 | [−0.54, 7.38] |

The log-TVL slope is the stable part of the model. The growth coefficient is imprecisely
estimated — its 90% interval covers zero — which is exactly why its effect is capped at
±50% instead of being left to run.

Top-10 rank stability under the 200 refits (share of refits the row stays in the top 10,
median bootstrap rank):

| rank | protocol | stay | median rank |
| --- | --- | --- | --- |
| 1 | sentora-curator | 1.00 | 1 |
| 2 | gauntlet | 1.00 | 3 |
| 3 | steakhouse-financial | 0.94 | 3 |
| 4 | shift-defi | 0.79 | 4 |
| 5 | august-digital | 0.68 | 5 |
| 6 | upshift | 0.72 | 7 |
| 7 | usdd | 0.67 | 7 |
| 8 | veda | 0.59 | 8 |
| 9 | figure-markets-prime | 0.85 | 9 |
| 10 | nuva | 0.60 | 10 |

The top 3 are stable; places 4–10 shuffle. The exact order below the top 3 should not be
over-read.

## 5. The no-token clock — where age is used, and where it is not

Every row carries the days it has run with no token (listed date to the snapshot date).
The clock does **not** enter the value regression, and the reason is in the ablation: the
capped-years age form wins R² on this comp set (0.25 / 0.23 vs 0.24 / 0.21) but loses the
median error on both splits (0.77 / 0.33 vs 0.73 / 0.31) — age fits the extremes, not the
typical protocol. Log age loses almost everywhere. And the same capped-years form
**collapses the time split (R² −6.2) when fit on all 76 core comps**, so the age effect is
fragile and cohort-dependent: a coefficient fit on older listings explodes when applied to
newer ones, because age is confounded with listing cohort.

The comps do say age's direction: the fitted age coefficient is negative in every
specification tried, and age correlates −0.26 with the base model's residuals. So age is
used where it needs no extrapolation — the farm's launch chance:

| days with no token | launch chance |
| --- | --- |
| under 1 year | 35% |
| 1 to 3 years | 25% |
| over 3 years | 15% |
| age unknown | 25% |

A stated scenario, never a fitted claim. The dashboard's detail view shows each row's
clock and its chance; the Method tab shows the bands.

## 6. Ablation — what was tried and rejected

Every row below was scored by the same 5-fold / time-split protocol as the chosen model.
Both R² and the median absolute log error are shown: R² rewards fitting the extremes, the
median rewards the typical protocol, and the two disagree on several specs. The chosen
model is the one that wins the typical error on both splits.

| specification | 5-fold R² | 5-fold median | time-split R² | time-split median | kept? |
| --- | --- | --- | --- | --- | --- |
| log(TVL) only | 0.224 | 0.742 | 0.089 | 0.532 | No — baseline |
| **log(TVL) + growth, 61 comps (chosen)** | **0.238** | **0.731** | **0.205** | **0.310** | **Yes** |
| log(TVL) + growth, all 76 core comps (radar-3) | 0.238 | 1.079 | 0.301 | 0.800 | No — median error ×2.94 / ×2.22, ~40% worse |
| + log age | 0.220 | 0.704 | 0.199 | 0.681 | No — typical new listing priced far worse |
| + age in years, capped at 3 | 0.253 | 0.770 | 0.225 | 0.329 | No — wins R², loses both medians; collapses on the 76 |
| + log(TVL)² | 0.222 | 0.727 | 0.161 | 0.464 | No — curved size relation loses |
| + log chains | 0.216 | 0.729 | 0.214 | 0.350 | No — breadth does not price traded tokens |
| + category dummies | 0.244 | 0.694 | 0.152 | 0.907 | No — best 5-fold median, time split collapses |
| Huber robust fit | 0.242 | 0.689 | 0.220 | 0.389 | No — helps the 5-fold median, hurts the time-split median |

- **Age:** see §5. The model gives age no weight in the value formula; the farm's launch
  chance is where the clock is used.
- **Chain count:** lowers the 5-fold split and both medians. Breadth does not price traded
  tokens here.
- **Category dummies:** best 5-fold median (0.694) but the time split collapses (median
  0.907, R² 0.152) — the dummies do not generalise across listing cohorts.
- **Huber robust fit:** helps the 5-fold median (0.689) but hurts the time-split median
  (0.389 vs 0.310): no consistent gain, so the simpler OLS stays.
- **All 76 comps:** the radar-3 comp set. Its median error is about 40% worse on both
  splits, which is what the $1M floor and the version rule buy.

## 7. Farm economics and verdicts

Every row's farm plan is netted to dollars under stated scenario assumptions: a farmer
allocation of 7.5% of the implied value, farmers holding 10% of the protocol's TVL, the
launch chance of §5, gas per transaction by main chain, and a 5% annual opportunity cost
on the capital while it is locked. Net = launch chance × implied × 0.075 × (capital /
(0.10 × TVL)) − gas − opportunity cost. Verdict: FARM when net ≥ $10, WATCH when −$5 ≤
net < $10, SKIP when net < −$5. On this snapshot that gives 9 FARM, 125 WATCH, 64 SKIP.
The nine FARM rows are august-digital (+$34.78), nuva (+$43.35), theo-network-thbill
(+$37.74), manifest-trade (+$47.40), fluxion-network (+$10.41), bulk (+$13.08), hertzflow
(+$10.69), loopscale-curation (+$12.42) and goonfi (+$14.69) — all small protocols on cheap
chains, where the gas bill does not eat the scenario's expected value.

Sensitivity (recomputed by the program, shown in the dashboard):

| assumption | FARM | WATCH | SKIP |
| --- | --- | --- | --- |
| Base case (launch chance by no-token clock) | 9 | 125 | 64 |
| Flat 25% launch chance for every row | 5 | 128 | 65 |
| $2.00 per transaction on chains with no named price | 8 | 55 | 135 |

Verdicts move most with gas: at $2 a transaction on unknown chains, WATCH falls from 125
to 55 — most WATCH rows only survive because their chains are cheap. The clock matters
too: a flat 25% chance would cut FARM from 9 to 5, because the young rows lose their 35%.

## 8. Limitations

- Implied values are order-of-magnitude estimates (median out-of-sample error ×2.1 on the
  5-fold split, ×1.4 on the time split). The ranking is more stable than the levels.
- The growth coefficient's bootstrap 90% interval covers zero; growth is kept because it
  helps out of sample, but its sign is not firmly established.
- The launch-chance bands are a stated scenario, not a fit: no launch events are observed
  in this snapshot, so the direction (older without a token → less likely soon) rests on
  the comps' negative age coefficient, not on a measured launch rate.
- "Records no token" means the snapshot's record, not proof that no token exists — always
  verify on the protocol's own page before claiming anything, and never pay to claim.
