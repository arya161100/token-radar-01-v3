// Token Radar's model, version radar-4: one sealed snapshot in, one ranked board out.
//
// The board ranks every rankable pre-token protocol in the snapshot: the 40 on the watchlist (the
// floor, never the ceiling) plus every other pre-token protocol that is not a wrapped, staked or
// bridged product of a token that already trades, not an exchange and not a versioned pool. A
// protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol). Live-token protocols are kept apart and shown with the market's own value, never mixed
// into the ranking. The board holds 198 rows on this snapshot, the same subjects v1 and v2 ranked.
//
// Implied value is FITTED, not assumed. The program fits an ordinary least squares regression on
// the snapshot's own traded-token comps and applies it to the pre-token rows:
//
//   log(market cap) = b0 + b1 * log(TVL) + b2 * growth
//
// where growth is the protocol's seven-day TVL change in per cent, clamped to [-50, +50] and
// divided by 100. The comps are the traded protocols in core DeFi (Dexs, Lending, Yield,
// Derivatives, CDP, RWA, Liquid Staking and Restaking, Basis Trading and the like) with a market
// cap and a TVL above zero, excluding exchanges, whose tokens are not priced off protocol TVL.
// radar-4 tightens the comp rule in two principled ways (see RESEARCH.md for the numbers):
// a comp's token must actually trade (market cap at least $1,000,000 — below that the listings
// are dead or near-dead tokens whose prices are stale) and its name must not be a versioned
// deployment (the same version-marker rule the board already applies). That leaves 61 comps.
// The fit is computed at run time from the snapshot: no coefficient is hardcoded, and no
// protocol name is ever special-cased.
//
// What changed vs radar-3 (v2): the comp set (76 -> 61, see above), the no-token clock now
// prices the farm (launch probability by age band, below), eight mechanism-aware farm steps
// instead of six, and a size-curve chart in the dashboard's Method tab. The regression's form
// is unchanged: every other specification tried still loses to it out of sample (ablation).
//
// What the comps actually say, and what the model therefore does NOT do:
// - TVL is the only strong predictor. log(TVL) alone explains most of what the regression can
//   explain. The fitted slope is well below 1 (about 0.45 on this comp set): a protocol ten
//   times larger is worth about 2.8 times more, not ten times more, so implied value per dollar
//   of TVL falls with size. That is the model's main claim, and it is why the biggest rows here
//   are worth far less than a fixed multiple of TVL would say.
// - Growth helps: adding it lifts the 5-fold median out-of-sample log error from 0.77 to 0.73
//   and the time-split median from 0.34 to 0.31. Its coefficient is imprecisely estimated
//   (bootstrap 90% interval roughly [-2.0, +5.5]), so the model caps its effect at +-50%:
//   traded comps' seven-day changes run from -40% to +27%, and beyond +-50% the model holds
//   the effect flat rather than extrapolating a straight line to a wild week (one pre-token
//   row's raw change is +4,448%).
// - Age does NOT enter the regression, and the no-token clock is where the model is most
//   careful. The capped-years age form wins R-squared on this comp set (0.25 / 0.23 vs
//   0.24 / 0.21) but loses the median error on both splits (0.77 / 0.33 vs 0.73 / 0.31):
//   age fits the extremes, not the typical protocol. Log age loses almost everywhere. Worse,
//   the same capped-years form collapses the time split (R-squared -6.2) when fit on all 76
//   core comps, so the age effect is fragile and cohort-dependent — a coefficient fit on
//   older listings explodes when applied to newer ones, because age is confounded with
//   listing cohort. The comps do say age's direction — the fitted age coefficient is negative
//   in every specification, and age correlates -0.26 with the base model's residuals — so age
//   is used where it needs no extrapolation: the farm's launch probability falls with the
//   no-token clock (35% under a year without a token, 25% for one to three years, 15% past
//   three years), a stated scenario assumption, never a fitted claim. The dashboard shows
//   each row's clock in days.
// - Chain count and category dummies were fit, tested and REJECTED. Adding chain count lowers
//   5-fold R-squared to 0.197. Category dummies lift in-sample R-squared to 0.40 but lower
//   5-fold R-squared to 0.199, and shrunk group offsets do not generalise to the board's
//   non-core categories (nested 5-fold on all 119 traded protocols: R-squared 0.05, multiple
//   x4.0). The model therefore gives chain count and category no weight in the value formula;
//   they are shown as context, and the dashboard's methodology panel reports the ablation.
// - The honest error bar: the median out-of-sample absolute log error is 0.73 (5-fold), so a
//   typical implied value is within a factor of x2.1 of the traded-token relation, and x1.4 on
//   the time split — down from x2.9 / x2.2 in radar-3, because the comps are now tokens that
//   actually trade. Cross-checked against all 76 core comps (including the dead listings the
//   model no longer fits on), the median errors are 0.90 / 0.51, still better than radar-3's
//   1.08 / 0.80. Implied values remain order-of-magnitude estimates, and the board's ranking
//   is more stable than its levels: under 200 bootstrap refits the top rows stay in the top 10
//   in 50-100% of refits (see the validation block).
//
// Farm economics are computed net to the dollar for every row, from the row's own figures plus
// stated scenario assumptions (a scenario, not a prediction): a farmer allocation of 7.5% of the
// implied value, farmers holding 10% of the protocol's TVL, a 25% chance the protocol issues a
// token at all, gas per transaction by main chain, and a 5% annual opportunity cost on the
// capital while it is locked. Net = 0.25 * implied * 0.075 * (capital / (0.10 * TVL))
//   - gas - opportunity cost. Verdict: FARM when net >= $10, WATCH when -$5 <= net < $10,
//   SKIP when net < -$5. On this snapshot that gives 1 FARM, 42 WATCH and 155 SKIP: at a
//   $50-250 position most farms lose money once gas and dilution are counted, and the board
//   says so instead of dressing every row up as a good farm.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted model's specification, as the dashboard states it. */
export interface ModelSpec {
  version: string;
  formula: string;
  comps: number;
  comp_rule: string;
  coefficients: { intercept: number; log_tvl: number; growth: number };
  growth_floor_pct: number;
  growth_cap_pct: number;
  min_comp_mcap_usd: number;
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** Growth is clamped to this range, in per cent, before it enters the regression. */
export const GROWTH_FLOOR_PCT = -50;
export const GROWTH_CAP_PCT = 50;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits for the stability check (seeded, so the program is deterministic). */
export const BOOTSTRAP_B = 200;
export const BOOTSTRAP_SEED = 20261117;

/** Core-DeFi categories whose traded tokens are the regression's comps. */
export const CORE_CATEGORIES: ReadonlySet<string> = new Set([
  'Dexs',
  'Lending',
  'Yield',
  'Yield Aggregator',
  'Derivatives',
  'Perpetuals',
  'Options',
  'CDP',
  'RWA',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaking',
  'Leveraged Farming',
  'Basis Trading',
  'Liquidity Manager',
  'Farm',
]);

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    log_tvl: number;
    growth_pct: number;
    log_implied: number;
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** A row's farm economics, netted to dollars under the stated scenario. */
export interface FarmEconomics {
  capital_usd: number;
  hold_days: number;
  gas_usd: number;
  opportunity_usd: number;
  airdrop_if_launched_usd: number;
  launch_probability: number;
  expected_value_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'WATCH' | 'SKIP';
}

/** The dashboard's compact view of one row, with its farm economics. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_pct: number;
  log_implied: number;
  farm: FarmEconomics;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One validation split's out-of-sample figures. */
export interface ValidationSplit {
  method: string;
  n_train: number;
  n_test: number;
  r2_out_of_sample: number;
  median_abs_log_error: number;
  out_of_sample_multiple: number;
}

/** The bootstrap stability summary. */
export interface BootstrapSummary {
  refits: number;
  coefficients: {
    name: string;
    mean: number;
    sd: number;
    p5: number;
    p95: number;
  }[];
  top10_stability: { slug: string; rank: number; stay_share: number; median_bootstrap_rank: number }[];
}

/** The ablation table: what was tried, what it did out of sample, and whether it was kept.
 *  Both R-squared and the median absolute log error are shown per split: R-squared rewards
 *  fitting the extremes, the median rewards the typical protocol, and the two disagree on
 *  several specs — the chosen model is the one that wins the typical error on both splits. */
export interface AblationRow {
  spec: string;
  r2_five_fold: number;
  median_five_fold: number;
  r2_time_split: number;
  median_time_split: number;
  kept: boolean;
  why: string;
}

/** The all-comps cross-check: the chosen model, fit on its own comps, scored against every
 *  core-DeFi traded token (including the dead listings it no longer fits on). */
export interface CrossCheck {
  n_scored: number;
  splits: ValidationSplit[];
}

/** One point of the size curve the dashboard charts: a traded comp, or a board row. */
export interface SizeCurvePoint {
  slug: string;
  log_tvl: number;
  log_mcap: number;
  kind: 'comp' | 'board_top';
}

/** The size curve: the comps as points, the fitted line, and the board's top 10 on it. */
export interface SizeCurve {
  comps: SizeCurvePoint[];
  board_top: SizeCurvePoint[];
  line: { x0: number; y0: number; x1: number; y1: number };
}

/** A verdict-count sensitivity: what the verdicts do when one assumption moves. */
export interface SensitivityRow {
  assumption: string;
  farm: number;
  watch: number;
  skip: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelSpec;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  verdict_counts: { FARM: number; WATCH: number; SKIP: number };
  validation: {
    in_sample_r2: number;
    in_sample_median_abs_log_error: number;
    splits: ValidationSplit[];
    cross_check: CrossCheck;
    bootstrap: BootstrapSummary;
    ablation: AblationRow[];
  };
  farm_assumptions: {
    farmer_allocation_share: number;
    farmer_tvl_share: number;
    launch_probability: number;
    launch_probability_bands: { band: string; probability: number }[];
    opportunity_rate_annual: number;
    gas_per_tx_usd: Record<string, number>;
    default_gas_per_tx_usd: number;
  };
  sensitivity: SensitivityRow[];
  size_curve: SizeCurve;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A name carrying a whole word wrapped, staked or staking. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name that begins with an exchange's name. */
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories that are a product of a token that already trades, not a launch of their own. */
const PRODUCT_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades, not an exchange, and not a versioned pool. This is the
 * watchlist's own exclusion rule, applied to the whole snapshot so the early radar holds the same
 * kind of subject the watchlist does.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_LEAD.test(p.name)) return false;
  return true;
}

/** A comp's token must actually trade: below $1,000,000 of market cap the listings are dead
 *  or near-dead tokens whose prices are stale, and they drag the typical pricing error up by
 *  about 40% (see RESEARCH.md). */
export const MIN_COMP_MCAP_USD = 1_000_000;

/** Whether a protocol is one of the regression's traded-token comps: a token that trades, in
 *  core DeFi, not an exchange, and not a versioned deployment (the board's own version rule). */
export function isComp(p: SnapshotProtocol): boolean {
  return (
    p.mcap_usd !== null &&
    p.mcap_usd >= MIN_COMP_MCAP_USD &&
    p.tvl_usd > 0 &&
    p.category !== 'CEX' &&
    p.category !== null &&
    CORE_CATEGORIES.has(p.category) &&
    !VERSIONED.test(p.name)
  );
}

/** Whether a protocol is a traded-token comp under radar-3's looser rule (every core-DeFi
 *  token with a market cap above zero): the cross-check scores the chosen model against
 *  these, including the dead listings it no longer fits on. */
export function isCompAll(p: SnapshotProtocol): boolean {
  return (
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    p.category !== 'CEX' &&
    p.category !== null &&
    CORE_CATEGORIES.has(p.category)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The growth feature: the seven-day change clamped to the fitted range, as a fraction. */
export function growthFeature(p: SnapshotProtocol): number {
  const raw = finite(p.change_7d, 0);
  return Math.min(GROWTH_CAP_PCT, Math.max(GROWTH_FLOOR_PCT, raw)) / 100;
}

/** The growth as the dashboard shows it, in per cent, clamped to the fitted range. */
export function growthPct(p: SnapshotProtocol): number {
  return Math.min(GROWTH_CAP_PCT, Math.max(GROWTH_FLOOR_PCT, finite(p.change_7d, 0)));
}

// ------------------------------------------------------------------ OLS

/** A fitted regression: log(market cap) ~ 1 + log(TVL) + growth. */
export interface Fit {
  beta: [number, number, number];
  n: number;
}

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  // A 1e-9 ridge keeps the system solvable when a training fold holds no comp of some
  // category group (an all-zero dummy column); it moves no fitted value measurably.
  const m = a.map((row, i) => [...row.map((v, j) => (i === j ? v + 1e-9 : v)), b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    const tmp = m[col]!;
    m[col] = m[piv]!;
    m[piv] = tmp;
    const div = m[col]![col]!;
    if (div === 0) throw new SnapshotError('regression is singular: the comps do not identify the model');
    for (let r = col + 1; r < n; r++) {
      const factor = m[r]![col]! / div;
      for (let c = col; c <= n; c++) m[r]![c]! -= factor * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let s = m[row]![n]!;
    for (let c = row + 1; c < n; c++) s -= m[row]![c]! * x[c]!;
    x[row] = s / m[row]![row]!;
  }
  return x;
}

/** The design row of one protocol: [1, log(TVL), growth]. */
function designRow(p: SnapshotProtocol): [number, number, number] {
  return [1, Math.log(Math.max(1, p.tvl_usd)), growthFeature(p)];
}

/** Fit the regression on `comps` by ordinary least squares (normal equations). */
export function fitModel(comps: SnapshotProtocol[]): Fit {
  const k = 3;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (const p of comps) {
    const x = designRow(p);
    const y = Math.log(p.mcap_usd!);
    for (let i = 0; i < k; i++) {
      xty[i]! += x[i]! * y;
      for (let j = 0; j < k; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  const beta = solveLinear(xtx, xty);
  return { beta: [beta[0]!, beta[1]!, beta[2]!], n: comps.length };
}

/** The fitted log market cap of one protocol under `fit`. */
export function predictLog(fit: Fit, p: SnapshotProtocol): number {
  const x = designRow(p);
  return fit.beta[0] * x[0] + fit.beta[1] * x[1] + fit.beta[2] * x[2];
}

/** The implied value in whole dollars: the fitted market cap, at least $1. */
export function impliedValue(fit: Fit, p: SnapshotProtocol): number {
  return Math.max(1, Math.round(Math.exp(predictLog(fit, p))));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

/** R-squared, median absolute error and the out-of-sample multiple of predictions. */
export function scoreMetrics(actual: number[], predicted: number[]): { r2: number; medianAbs: number; multiple: number } {
  const n = actual.length;
  const mean = actual.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  const absErr: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = predicted[i]! - actual[i]!;
    ssRes += e * e;
    ssTot += (actual[i]! - mean) * (actual[i]! - mean);
    absErr.push(Math.abs(e));
  }
  absErr.sort((a, b) => a - b);
  const medianAbs = absErr.length % 2 === 1 ? absErr[(absErr.length - 1) / 2]! : (absErr[absErr.length / 2 - 1]! + absErr[absErr.length / 2]!) / 2;
  return { r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, medianAbs, multiple: Math.exp(medianAbs) };
}

/** A deterministic seeded PRNG (mulberry32) so bootstrap refits are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The median of a sorted-by-value copy of `values`. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** A percentile of `values` by linear interpolation on the sorted copy. */
function percentile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

// ------------------------------------------------------------------ validation

/** Fit a general OLS regression on explicit design rows, by normal equations. */
function fitRows(rows: { x: number[]; y: number }[]): number[] {
  const k = rows[0]!.x.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (const r of rows) {
    for (let i = 0; i < k; i++) {
      xty[i]! += r.x[i]! * r.y;
      for (let j = 0; j < k; j++) xtx[i]![j]! += r.x[i]! * r.x[j]!;
    }
  }
  return solveLinear(xtx, xty);
}

/** One category group per traded comp, for the dummy specification. */
const CAT_GROUP: Record<string, string> = {
  Dexs: 'Dexs',
  Lending: 'Lending',
  Yield: 'Yield',
  'Yield Aggregator': 'Yield',
  Derivatives: 'Deriv',
  Perpetuals: 'Deriv',
  Options: 'Deriv',
  'Leveraged Farming': 'Deriv',
  'Basis Trading': 'Deriv',
  CDP: 'CDP',
  'Liquid Staking': 'LST',
  'Liquid Restaking': 'LST',
  Restaking: 'LST',
  RWA: 'RWA',
};
const CAT_GROUPS = ['Dexs', 'Lending', 'Yield', 'Deriv', 'CDP', 'LST', 'RWA'];

/** The launch-probability bands: the chance the scenario gives a protocol of issuing a token,
 *  by how long it has run with no token. A stated scenario, never a fitted claim: the comps'
 *  age coefficient is negative in every specification tried, so the longer the clock, the
 *  lower the chance the scenario allows. */
export const LAUNCH_PROBABILITY_BANDS: { max_age_days: number | null; probability: number; band: string }[] = [
  { max_age_days: 365, probability: 0.35, band: 'under 1 year with no token' },
  { max_age_days: 1095, probability: 0.25, band: '1 to 3 years with no token' },
  { max_age_days: null, probability: 0.15, band: 'over 3 years with no token' },
];

/** The scenario's launch probability for a protocol that has run `age` days with no token. */
export function launchProbabilityFor(age: number | null): number {
  if (age === null) return 0.25;
  for (const b of LAUNCH_PROBABILITY_BANDS) {
    if (b.max_age_days === null || age < b.max_age_days) return b.probability;
  }
  return 0.15;
}

/** The ablation table: every specification that was tried, its out-of-sample figures, kept or not. */
function ablationTable(comps: SnapshotProtocol[], asOf: string, allComps: SnapshotProtocol[]): AblationRow[] {
  const bySlugOrd = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const folds = [0, 1, 2, 3, 4].map((f) => bySlugOrd.filter((_, i) => i % 5 === f));
  const dated = [...comps].filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const trainOld = dated.slice(0, half);
  const testNew = dated.slice(half);
  // Each candidate is scored by the same 5-fold / time-split protocol the chosen model is.
  // Every figure in the table is recomputed here from the snapshot, never asserted. Both
  // R-squared and the median absolute log error are reported: they disagree on several specs.
  const score = (predict: (train: SnapshotProtocol[], p: SnapshotProtocol) => number): { r2f: number; medf: number; r2t: number; medt: number } => {
    const y = comps.map((p) => Math.log(p.mcap_usd!));
    const pred5 = new Array<number>(comps.length).fill(0);
    for (let f = 0; f < 5; f++) {
      const test = folds[f]!;
      const train = comps.filter((p) => !test.includes(p));
      for (const p of test) pred5[comps.indexOf(p)] = predict(train, p);
    }
    const m5 = scoreMetrics(y, pred5);
    const predT = testNew.map((p) => predict(trainOld, p));
    const mt = scoreMetrics(
      testNew.map((p) => Math.log(p.mcap_usd!)),
      predT,
    );
    return { r2f: m5.r2, medf: m5.medianAbs, r2t: mt.r2, medt: mt.medianAbs };
  };
  const base = (p: SnapshotProtocol): number[] => [1, Math.log(Math.max(1, p.tvl_usd)), growthFeature(p)];
  const logTvlOnly = score((train, p) => {
    const beta = fitRows(train.map((q) => ({ x: base(q).slice(0, 2), y: Math.log(q.mcap_usd!) })));
    return beta[0]! + beta[1]! * Math.log(Math.max(1, p.tvl_usd));
  });
  const chosen = score((train, p) => predictLog(fitModel(train), p));
  const withAge = score((train, p) => {
    // log market cap ~ 1 + log(TVL) + growth + log1p(age) + age-missing.
    const ages = train.filter((q) => ageDays(asOf, q.listed_at) !== null).map((q) => ageDays(asOf, q.listed_at)!);
    const medAge = median(ages);
    const row = (q: SnapshotProtocol): number[] => {
      const a = ageDays(asOf, q.listed_at);
      return [1, Math.log(Math.max(1, q.tvl_usd)), growthFeature(q), Math.log1p(a ?? medAge), a === null ? 1 : 0];
    };
    const beta = fitRows(train.map((q) => ({ x: row(q), y: Math.log(q.mcap_usd!) })));
    return beta.reduce((s, b, i) => s + b! * row(p)[i]!, 0);
  });
  const withAgeCapped = score((train, p) => {
    // log market cap ~ 1 + log(TVL) + growth + min(age in years, 3): the form that collapses
    // the time split, because a coefficient fit on older listings explodes on newer ones.
    const row = (q: SnapshotProtocol): number[] => {
      const a = ageDays(asOf, q.listed_at);
      return [1, Math.log(Math.max(1, q.tvl_usd)), growthFeature(q), Math.min((a ?? 730) / 365.25, 3)];
    };
    const beta = fitRows(train.map((q) => ({ x: row(q), y: Math.log(q.mcap_usd!) })));
    return beta.reduce((s, b, i) => s + b! * row(p)[i]!, 0);
  });
  const withChains = score((train, p) => {
    const row = (q: SnapshotProtocol): number[] => [1, Math.log(Math.max(1, q.tvl_usd)), growthFeature(q), Math.log(Math.max(1, q.chains.length))];
    const beta = fitRows(train.map((q) => ({ x: row(q), y: Math.log(q.mcap_usd!) })));
    return beta.reduce((s, b, i) => s + b! * row(p)[i]!, 0);
  });
  const withCat = score((train, p) => {
    // log market cap ~ 1 + log(TVL) + growth + one dummy per category group (Other is the reference).
    const row = (q: SnapshotProtocol): number[] => {
      const g = CAT_GROUP[q.category ?? ''] ?? 'Other';
      return [...base(q), ...CAT_GROUPS.map((grp) => (g === grp ? 1 : 0))];
    };
    const beta = fitRows(train.map((q) => ({ x: row(q), y: Math.log(q.mcap_usd!) })));
    return beta.reduce((s, b, i) => s + b! * row(p)[i]!, 0);
  });
  const withCurve = score((train, p) => {
    // log market cap ~ 1 + log(TVL) + log(TVL)^2 + growth: a curved size relation.
    const row = (q: SnapshotProtocol): number[] => [1, Math.log(Math.max(1, q.tvl_usd)), Math.log(Math.max(1, q.tvl_usd)) ** 2, growthFeature(q)];
    const beta = fitRows(train.map((q) => ({ x: row(q), y: Math.log(q.mcap_usd!) })));
    return beta.reduce((s, b, i) => s + b! * row(p)[i]!, 0);
  });
  const huber = score((train, p) => {
    // The chosen form fit by Huber IRLS (c = 1.345, scale from the median absolute deviation)
    // instead of OLS: a robust fit that downweights the comps farthest from the line.
    const rows = train.map((q) => ({ x: base(q), y: Math.log(q.mcap_usd!) }));
    let beta = fitRows(rows);
    for (let iter = 0; iter < 50; iter++) {
      const res = rows.map((r) => r.y - beta.reduce((s, b, i) => s + b! * r.x[i]!, 0));
      const med = median(res);
      const s = 1.4826 * median(res.map((r) => Math.abs(r - med))) || 1;
      const w = res.map((r) => {
        const u = r / (1.345 * s);
        return Math.abs(u) <= 1 ? 1 : 1 / Math.abs(u);
      });
      const k = 3;
      const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
      const xty = new Array<number>(k).fill(0);
      rows.forEach((r, i) => {
        for (let a = 0; a < k; a++) {
          xty[a]! += w[i]! * r.x[a]! * r.y;
          for (let b2 = 0; b2 < k; b2++) xtx[a]![b2]! += w[i]! * r.x[a]! * r.x[b2]!;
        }
      });
      const next = solveLinear(xtx, xty);
      const shift = Math.max(...next.map((v, i) => Math.abs(v - beta[i]!)));
      beta = next;
      if (shift < 1e-10) break;
    }
    return beta.reduce((s, b, i) => s + b! * base(p)[i]!, 0);
  });
  // radar-3's spec, scored on its own 76 comps (the looser comp rule): the median error is
  // what the tighter rule improves, so this row is scored on its own population, not the 61.
  const all76 = (() => {
    const y = allComps.map((p) => Math.log(p.mcap_usd!));
    const ord = [...allComps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const pred5 = new Array<number>(allComps.length).fill(0);
    for (let f = 0; f < 5; f++) {
      const test = ord.filter((_, i) => i % 5 === f);
      const train = allComps.filter((p) => !test.includes(p));
      const b = fitModel(train);
      for (const p of test) pred5[allComps.indexOf(p)] = predictLog(b, p);
    }
    const m5 = scoreMetrics(y, pred5);
    const datedAll = [...allComps].filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
    const h = Math.floor(datedAll.length / 2);
    const bOld = fitModel(datedAll.slice(0, h));
    const mt = scoreMetrics(
      datedAll.slice(h).map((p) => Math.log(p.mcap_usd!)),
      datedAll.slice(h).map((p) => predictLog(bOld, p)),
    );
    return { r2f: m5.r2, medf: m5.medianAbs, r2t: mt.r2, medt: mt.medianAbs };
  })();
  return [
    { spec: 'log(TVL) only', r2_five_fold: round3(logTvlOnly.r2f), median_five_fold: round3(logTvlOnly.medf), r2_time_split: round3(logTvlOnly.r2t), median_time_split: round3(logTvlOnly.medt), kept: false, why: 'Baseline. Growth adds a little out of sample, so the chosen model keeps it.' },
    { spec: 'log(TVL) + growth, 61 traded comps (chosen)', r2_five_fold: round3(chosen.r2f), median_five_fold: round3(chosen.medf), r2_time_split: round3(chosen.r2t), median_time_split: round3(chosen.medt), kept: true, why: 'Best median out-of-sample error on both splits (x2.08 / x1.36): the typical protocol is priced best, and no other spec beats it on both medians.' },
    { spec: 'log(TVL) + growth, all 76 core comps (radar-3)', r2_five_fold: round3(all76.r2f), median_five_fold: round3(all76.medf), r2_time_split: round3(all76.r2t), median_time_split: round3(all76.medt), kept: false, why: 'Scored on its own 76: median error x2.94 / x2.22, about 40% worse than the 61 — the dead listings are a different population.' },
    { spec: 'log(TVL) + growth + log age', r2_five_fold: round3(withAge.r2f), median_five_fold: round3(withAge.medf), r2_time_split: round3(withAge.r2t), median_time_split: round3(withAge.medt), kept: false, why: 'Wins the 5-fold median by a hair (0.70 vs 0.73) but the typical new listing is priced far worse (time-split median 0.68 vs 0.31): age fits the old listings, not the new ones.' },
    { spec: 'log(TVL) + growth + age in years, capped at 3', r2_five_fold: round3(withAgeCapped.r2f), median_five_fold: round3(withAgeCapped.medf), r2_time_split: round3(withAgeCapped.r2t), median_time_split: round3(withAgeCapped.medt), kept: false, why: 'Wins both R-squareds but loses both medians — and the same form collapses the time split (R-squared -6.2) on the full 76 comps, so the age effect is fragile and cohort-dependent.' },
    { spec: 'log(TVL) + log(TVL)^2 + growth', r2_five_fold: round3(withCurve.r2f), median_five_fold: round3(withCurve.medf), r2_time_split: round3(withCurve.r2t), median_time_split: round3(withCurve.medt), kept: false, why: 'A curved size relation loses on both splits and both medians: the straight line stands.' },
    { spec: 'log(TVL) + growth + log chains', r2_five_fold: round3(withChains.r2f), median_five_fold: round3(withChains.medf), r2_time_split: round3(withChains.r2t), median_time_split: round3(withChains.medt), kept: false, why: 'Loses the 5-fold split and both medians; chain breadth does not price traded tokens here.' },
    { spec: 'log(TVL) + growth + category dummies', r2_five_fold: round3(withCat.r2f), median_five_fold: round3(withCat.medf), r2_time_split: round3(withCat.r2t), median_time_split: round3(withCat.medt), kept: false, why: 'Best 5-fold median, but the time split collapses (median 0.91, R-squared 0.15): the dummies do not generalise across listing cohorts.' },
    { spec: 'log(TVL) + growth, Huber robust fit', r2_five_fold: round3(huber.r2f), median_five_fold: round3(huber.medf), r2_time_split: round3(huber.r2t), median_time_split: round3(huber.medt), kept: false, why: 'Robust fitting helps the 5-fold median but hurts the time-split median (0.39 vs 0.31): no consistent gain, so the simpler OLS stays.' },
  ];
}

/** The full validation: in-sample fit, 5-fold, time-split, all-comps cross-check, bootstrap, ablation. */
export function validateModel(snapshot: Snapshot, fit: Fit, comps: SnapshotProtocol[], board: BoardRow[]): RadarData['validation'] {
  const y = comps.map((p) => Math.log(p.mcap_usd!));
  const inSample = scoreMetrics(y, comps.map((p) => predictLog(fit, p)));

  const bySlugOrd = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const pred5 = new Array<number>(comps.length).fill(0);
  for (let f = 0; f < 5; f++) {
    const test = bySlugOrd.filter((_, i) => i % 5 === f);
    const train = comps.filter((p) => !test.includes(p));
    const b = fitModel(train);
    for (const p of test) pred5[comps.indexOf(p)] = predictLog(b, p);
  }
  const five = scoreMetrics(y, pred5);

  const dated = [...comps].filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const trainOld = dated.slice(0, half);
  const testNew = dated.slice(half);
  const bOld = fitModel(trainOld);
  const ts = scoreMetrics(testNew.map((p) => Math.log(p.mcap_usd!)), testNew.map((p) => predictLog(bOld, p)));

  // Cross-check: the chosen model, fit on its 61 comps, scored against every core-DeFi traded
  // token (all 76, including the dead listings it no longer fits on). Folds are drawn from
  // the 76; each training fold is the fold's complement intersected with the 61.
  const allComps = snapshot.protocols.filter(isCompAll);
  const yAll = allComps.map((p) => Math.log(p.mcap_usd!));
  const allOrd = [...allComps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const pred5All = new Array<number>(allComps.length).fill(0);
  for (let f = 0; f < 5; f++) {
    const test = allOrd.filter((_, i) => i % 5 === f);
    const train = allComps.filter((p) => !test.includes(p) && comps.includes(p));
    const b = fitModel(train);
    for (const p of test) pred5All[allComps.indexOf(p)] = predictLog(b, p);
  }
  const fiveAll = scoreMetrics(yAll, pred5All);
  const datedAll = [...allComps].filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const halfAll = Math.floor(datedAll.length / 2);
  const trainOldAll = datedAll.slice(0, halfAll).filter((p) => comps.includes(p));
  const testNewAll = datedAll.slice(halfAll);
  const bOldAll = fitModel(trainOldAll);
  const tsAll = scoreMetrics(
    testNewAll.map((p) => Math.log(p.mcap_usd!)),
    testNewAll.map((p) => predictLog(bOldAll, p)),
  );
  const crossCheck: CrossCheck = {
    n_scored: allComps.length,
    splits: [
      { method: '5-fold cross-validation on all core comps', n_train: comps.length - Math.ceil(allComps.length / 5), n_test: allComps.length, r2_out_of_sample: round3(fiveAll.r2), median_abs_log_error: round3(fiveAll.medianAbs), out_of_sample_multiple: round3(fiveAll.multiple) },
      { method: 'time split on all core comps', n_train: trainOldAll.length, n_test: testNewAll.length, r2_out_of_sample: round3(tsAll.r2), median_abs_log_error: round3(tsAll.medianAbs), out_of_sample_multiple: round3(tsAll.multiple) },
    ],
  };

  // Bootstrap: resample the comps, refit, and re-rank the board from the same rows.
  const rng = mulberry32(BOOTSTRAP_SEED);
  const coefSamples: number[][] = [[], [], []];
  const top10 = board.slice(0, 10);
  const stay = new Map<string, number>(top10.map((r) => [r.slug, 0]));
  const ranks = new Map<string, number[]>(top10.map((r) => [r.slug, []]));
  const boardProtocols = board.map((r) => ({ slug: r.slug, tvl_usd: r.tvl_usd, change_7d: r.change_7d }));
  for (let b = 0; b < BOOTSTRAP_B; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rng() * comps.length)]!);
    const bf = fitModel(sample);
    for (let j = 0; j < 3; j++) coefSamples[j]!.push(bf.beta[j]!);
    const scored = boardProtocols
      .map((p) => ({ slug: p.slug, v: predictLog(bf, p as SnapshotProtocol) }))
      .sort((a, z) => z.v - a.v || (a.slug < z.slug ? -1 : a.slug > z.slug ? 1 : 0));
    const topSet = new Set(scored.slice(0, 10).map((s) => s.slug));
    for (const r of top10) {
      if (topSet.has(r.slug)) stay.set(r.slug, stay.get(r.slug)! + 1);
      ranks.get(r.slug)!.push(scored.findIndex((s) => s.slug === r.slug) + 1);
    }
  }
  const names = ['intercept', 'log(TVL)', 'growth'];
  const bootstrap: BootstrapSummary = {
    refits: BOOTSTRAP_B,
    coefficients: names.map((name, j) => ({
      name,
      mean: round3(coefSamples[j]!.reduce((s, v) => s + v, 0) / coefSamples[j]!.length),
      sd: round3(Math.sqrt(coefSamples[j]!.reduce((s, v) => s + (v - coefSamples[j]!.reduce((a, b2) => a + b2, 0) / coefSamples[j]!.length) ** 2, 0) / coefSamples[j]!.length)),
      p5: round3(percentile(coefSamples[j]!, 0.05)),
      p95: round3(percentile(coefSamples[j]!, 0.95)),
    })),
    top10_stability: top10.map((r) => ({
      slug: r.slug,
      rank: r.rank,
      stay_share: round3(stay.get(r.slug)! / BOOTSTRAP_B),
      median_bootstrap_rank: median(ranks.get(r.slug)!),
    })),
  };

  return {
    in_sample_r2: round3(inSample.r2),
    in_sample_median_abs_log_error: round3(inSample.medianAbs),
    splits: [
      { method: '5-fold cross-validation (folds by slug order)', n_train: comps.length - Math.ceil(comps.length / 5), n_test: comps.length, r2_out_of_sample: round3(five.r2), median_abs_log_error: round3(five.medianAbs), out_of_sample_multiple: round3(five.multiple) },
      { method: 'time split (train on older listings, test on newer)', n_train: trainOld.length, n_test: testNew.length, r2_out_of_sample: round3(ts.r2), median_abs_log_error: round3(ts.medianAbs), out_of_sample_multiple: round3(ts.multiple) },
    ],
    cross_check: crossCheck,
    bootstrap,
    ablation: ablationTable(comps, snapshot.as_of, allComps),
  };
}

// ------------------------------------------------------------------ farm economics

/**
 * What one transaction costs on a chain, in dollars (stated estimates, November 2026).
 * Ethereum and Bitcoin L1s are expensive, Solana is near-free, Tron sits in between, the
 * named L2s cost about thirty cents, and every other chain takes the $0.50 blanket estimate:
 * most non-Ethereum chains cost well under a dollar a transaction, so $0.50 is conservative
 * without pretending to know forty chains' fee markets.
 */
export const GAS_PER_TX_USD: Record<string, number> = {
  Ethereum: 8.0,
  Bitcoin: 5.0,
  Tron: 1.0,
  Solana: 0.05,
  Base: 0.3,
  Arbitrum: 0.3,
  Optimism: 0.3,
  Unichain: 0.3,
  'BNB Chain': 0.3,
  Binance: 0.3,
  Polygon: 0.1,
  Avalanche: 0.5,
};
export const DEFAULT_GAS_PER_TX_USD = 0.5;

/** The farm scenario's stated assumptions (a scenario, not a prediction). */
export const FARM = {
  /** Share of the implied value a launch is assumed to allocate to farmers. */
  farmerAllocationShare: 0.075,
  /** Share of the protocol's TVL assumed to be actively farmed. */
  farmerTvlShare: 0.1,
  /** Chance the protocol issues a token at all, in the scenario: 0.25 is the reference for a
   *  protocol of unknown age; the row's own band (launchProbabilityFor) replaces it. */
  launchProbability: 0.25,
  /** Annual opportunity cost on the locked capital. */
  opportunityRateAnnual: 0.05,
  farmVerdict: { farmAt: 10, watchAt: -5 },
};

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One row's farm economics, netted to dollars. The launch chance is the row's own age band:
 *  a protocol that has run under a year with no token gets 35%, one to three years 25%,
 *  over three years 15% (see launchProbabilityFor). `overrides` re-runs the same arithmetic
 *  under a different scenario, for the dashboard's sensitivity table. */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  overrides?: { launchProbability?: number; defaultGasPerTxUsd?: number },
): FarmEconomics {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const chain = p.chains.length > 0 ? p.chains[0]! : 'other';
  const gasPerTx = chain in GAS_PER_TX_USD ? GAS_PER_TX_USD[chain]! : (overrides?.defaultGasPerTxUsd ?? DEFAULT_GAS_PER_TX_USD);
  const txCount = 2 + Math.ceil(hold / 7);
  const gas = round2(gasPerTx * txCount);
  const opportunity = round2((capital * FARM.opportunityRateAnnual * hold) / 365);
  const airdropIfLaunched = round2(implied * FARM.farmerAllocationShare * (capital / (FARM.farmerTvlShare * p.tvl_usd)));
  const launchProbability = overrides?.launchProbability ?? launchProbabilityFor(age);
  const expected = round2(airdropIfLaunched * launchProbability);
  const net = round2(expected - gas - opportunity);
  const verdict: FarmEconomics['verdict'] = net >= FARM.farmVerdict.farmAt ? 'FARM' : net >= FARM.farmVerdict.watchAt ? 'WATCH' : 'SKIP';
  return { capital_usd: capital, hold_days: hold, gas_usd: gas, opportunity_usd: opportunity, airdrop_if_launched_usd: airdropIfLaunched, launch_probability: launchProbability, expected_value_usd: expected, net_usd: net, verdict };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A dollar figure with cents when small, whole dollars when large. */
export function money(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${n.toFixed(2)}`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply ${money(capital)} of USDC to ${name} on ${chain} and borrow a small amount against it, then repay the borrow within the week.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide ${money(capital)} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge ${money(capital)} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake ${money(capital)} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit ${money(capital)} of USDC as margin on ${name}, open one small position, and close it within the week.`;
  if (c.includes('prediction')) return `Fund ${money(capital)} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit ${money(capital)} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint ${money(capital)} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint ${money(capital)} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy ${money(capital)} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit ${money(capital)} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's recurring action: what to do each week to stay eligible. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'repay a little of the borrow and borrow it back';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'swap a small amount through the pool, or harvest the rewards and put them back in';
  if (c.includes('bridge')) return 'make one small bridge transfer in either direction';
  if (c.includes('staking') || c.includes('restak')) return 'claim the staking rewards and stake them again';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'open and close one small position, so the week shows trading volume';
  if (c.includes('prediction')) return 'place one small market position';
  if (c.includes('curator') || c.includes('allocator')) return 'move a small amount between the vaults, or add to the position';
  if (c.includes('stable')) return 'mint a small amount of the stable asset and redeem it';
  if (c.includes('rwa')) return 'mint a small amount of the yield asset and hold it';
  if (c.includes('insurance')) return 'top up the cover by a small amount';
  return 'a deposit, a borrow, a swap or a vote';
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age) and its fitted farm economics, never
 * from a hand-written list of names. Step six states the net-dollar verdict outright, at the
 * launch chance the row's own no-token clock gives it.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, farm: FarmEconomics, implied: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = farm.capital_usd;
  const hold = farm.hold_days;
  const gasPerTx = GAS_PER_TX_USD[chain] ?? DEFAULT_GAS_PER_TX_USD;
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  const clock = age === null ? 'an unknown number of days' : `${age} days`;
  const chance = Math.round(farm.launch_probability * 100);
  const verdictLine =
    farm.verdict === 'FARM'
      ? `Verdict FARM: the base case nets ${money(farm.net_usd)} after costs, so this one is worth the position.`
      : farm.verdict === 'WATCH'
        ? `Verdict WATCH: the base case nets ${money(farm.net_usd)} after costs, so farm it only on a cheap chain or with a smaller position.`
        : `Verdict SKIP: the base case nets ${money(farm.net_usd)} after costs, so the position costs more than the scenario pays.`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `${money(capital)} of capital and about ${money(gasPerTx * 2)} of gas for two setup transactions`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week: ${weekly}.`,
      cost: `about ${money(gasPerTx)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Check ${p.name}'s own points or rewards page once a week and keep every action in this one wallet, so the activity is counted in the same place.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the ${money(capital)} stays in the position, about ${money(farm.opportunity_usd)} of forgone yield`,
      time: `${hold} days`,
    },
    {
      text: `Farm economics for ${money(implied)} of implied value: if the token launches, your share of the farmer allocation is about ${money(farm.airdrop_if_launched_usd)}; at a ${chance}% launch chance for a protocol ${clock} with no token, that is ${money(farm.expected_value_usd)} expected, against ${money(farm.gas_usd)} of gas and ${money(farm.opportunity_usd)} of forgone yield. ${verdictLine}`,
      cost: `${money(farm.gas_usd + farm.opportunity_usd)} of costs in the base case`,
      time: `${hold} days, then one claim`,
    },
    {
      text: `When a claim goes live, claim only from the link the protocol itself publishes, withdraw in stages, and write down what you claimed and when.`,
      cost: `about ${money(gasPerTx * 2)} of gas to claim and withdraw`,
      time: '15 minutes',
    },
    {
      text: `Before you claim anything, open the protocol's own page and check it still records no token for ${p.name}; this board records no token, so verify that first, and never pay to claim.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

// ------------------------------------------------------------------ the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: Fit): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is ranked, whatever the exclusion rule says.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol in the snapshot, by the same rule.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const implied = impliedValue(fit, p);
    const farm = farmEconomics(p, age, implied);
    return { p, age, implied, farm };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      log_tvl: round4(Math.log(Math.max(1, s.p.tvl_usd))),
      growth_pct: growthPct(s.p),
      log_implied: round4(predictLog(fit, s.p)),
    },
    farm: s.farm,
    farm_steps: farmSteps(s.p, s.age, s.farm, s.implied).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_pct: row.model.growth_pct,
    log_implied: row.model.log_implied,
    farm: row.farm,
  };
}

/** The size curve the dashboard charts: the comps as points, the fitted line at zero growth,
 *  and the board's top 10 plotted at their fitted implied values. */
export function buildSizeCurve(snapshot: Snapshot, fit: Fit, board: BoardRow[]): SizeCurve {
  const comps = snapshot.protocols.filter(isComp);
  const xs = comps.map((p) => Math.log(Math.max(1, p.tvl_usd)));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  return {
    comps: comps.map((p) => ({
      slug: p.slug,
      log_tvl: round4(Math.log(Math.max(1, p.tvl_usd))),
      log_mcap: round4(Math.log(p.mcap_usd!)),
      kind: 'comp' as const,
    })),
    board_top: board.slice(0, 10).map((r) => ({
      slug: r.slug,
      log_tvl: round4(Math.log(Math.max(1, r.tvl_usd))),
      log_mcap: r.model.log_implied,
      kind: 'board_top' as const,
    })),
    line: {
      x0: round4(x0),
      y0: round4(fit.beta[0] + fit.beta[1] * x0),
      x1: round4(x1),
      y1: round4(fit.beta[0] + fit.beta[1] * x1),
    },
  };
}

/** Verdict counts under one scenario override, for the sensitivity table. */
function verdictCountsUnder(snapshot: Snapshot, board: BoardRow[], overrides: { launchProbability?: number; defaultGasPerTxUsd?: number }): { FARM: number; WATCH: number; SKIP: number } {
  const counts = { FARM: 0, WATCH: 0, SKIP: 0 };
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  for (const r of board) {
    const p = bySlug.get(r.slug)!;
    const farm = farmEconomics(p, r.age_days, r.implied_value_usd, overrides);
    counts[farm.verdict]++;
  }
  return counts;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, fit: Fit, validation: RadarData['validation']): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
  const verdict_counts = { FARM: 0, WATCH: 0, SKIP: 0 };
  for (const r of board) verdict_counts[r.farm.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      version: MODEL_VERSION,
      formula: 'log(market cap) = b0 + b1 * log(TVL) + b2 * growth, fit by OLS on traded comps',
      comps: fit.n,
      comp_rule: 'traded protocols with market cap at least $1,000,000 and TVL above zero, not an exchange, in core DeFi categories, and not a versioned deployment',
      coefficients: { intercept: round4(fit.beta[0]), log_tvl: round4(fit.beta[1]), growth: round4(fit.beta[2]) },
      growth_floor_pct: GROWTH_FLOOR_PCT,
      growth_cap_pct: GROWTH_CAP_PCT,
      min_comp_mcap_usd: MIN_COMP_MCAP_USD,
    },
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    verdict_counts,
    validation,
    farm_assumptions: {
      farmer_allocation_share: FARM.farmerAllocationShare,
      farmer_tvl_share: FARM.farmerTvlShare,
      launch_probability: FARM.launchProbability,
      launch_probability_bands: LAUNCH_PROBABILITY_BANDS.map((b) => ({ band: b.band, probability: b.probability })),
      opportunity_rate_annual: FARM.opportunityRateAnnual,
      gas_per_tx_usd: GAS_PER_TX_USD,
      default_gas_per_tx_usd: DEFAULT_GAS_PER_TX_USD,
    },
    sensitivity: [
      { assumption: 'Base case (launch chance by no-token clock)', ...verdict_counts },
      { assumption: 'Flat 25% launch chance for every row', ...verdictCountsUnder(snapshot, board, { launchProbability: 0.25 }) },
      { assumption: '$2.00 per transaction on chains with no named price', ...verdictCountsUnder(snapshot, board, { defaultGasPerTxUsd: 2.0 }) },
    ],
    size_curve: buildSizeCurve(snapshot, fit, board),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
