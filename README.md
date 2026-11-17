# token-radar-01-v3

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/arya161100/token-radar-01-v3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/arya161100/token-radar-01-v3/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (model radar-4): a ranked board of pre-token DeFi protocols by implied value, where the value is **fitted, not assumed**. The program fits `log(market cap) = 8.843 + 0.445·log(TVL) + 3.379·growth` by OLS on the snapshot's own 61 traded-token comps — tokens that actually trade (market cap at least $1M, not a versioned deployment) — validates it out of sample (5-fold R² 0.238, median error ×2.08; time-split R² 0.205, median error ×1.36), cross-checks it against all 76 core comps (×2.47 / ×1.66), checks it under 200 bootstrap refits, and ranks all 198 rankable pre-token protocols (40 on the watchlist, 158 early finds). Every farm plan is an eight-step, mechanism-aware plan netted to dollars under stated scenario assumptions, with the launch chance priced off the protocol's own no-token clock (35% under a year, 25% for one to three years, 15% past three years) — verdicts: 9 FARM, 125 WATCH, 64 SKIP. Most farms lose money once gas and dilution are counted, and the board says so. Age, chain count and category dummies were fit, tested and rejected (the dashboard's Method tab shows the ablation, with R² and median error side by side); the size-curve chart plots the 61 comps, the fitted line, and the board's top 10. Full methodology: [RESEARCH.md](RESEARCH.md).

It reads a sealed DefiLlama snapshot (758 protocols, as of 2026-11-14), and renders a sortable, filterable dashboard with a detail view per protocol and a separate live-token view. Implied value follows from the snapshot's own figures only — TVL and seven-day growth — never from a hardcoded list of names. Live-token protocols are set aside with their market caps, never mixed into the ranking. "Records no token" means the snapshot's record, never proof that a token does not exist.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kits/token-radar-01-kit/token-radar-01-kit/input/snapshot.json
```

Node 22, standard library only, no network. The program writes `out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json`. Run it twice: the output bytes are identical (seeded bootstrap, sorted iteration, no clock).

---

<sub>Entered on [make.fun](https://make.fun/?ref=3cjrh3ss&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
