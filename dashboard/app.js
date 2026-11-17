/* Token Radar dashboard: renders window.RADAR, no network, no framework. */
var R = window.RADAR || { rows: [], live: [], validation: { splits: [], bootstrap: { coefficients: [], top10_stability: [] }, ablation: [] }, model: { coefficients: { intercept: 0, log_tvl: 0, growth: 0 } }, farm_assumptions: {}, verdict_counts: {} };
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function money(n) { n = +n; if (n >= 1000 || n <= -1000) return "$" + Math.round(n).toLocaleString("en-US"); return "$" + n.toFixed(2); }
function big(n) { return n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"); }
function pct(n) { return n == null ? "—" : (n > 0 ? "+" : "") + n.toFixed(1) + "%"; }
function num(n) { return n == null ? "—" : Math.round(n).toLocaleString("en-US"); }
function badge(v) { return '<span class="badge v-' + v + '">' + v + "</span>"; }
function chains(c) { return esc((c || []).slice(0, 3).join(", ")) + ((c || []).length > 3 ? " +" + ((c || []).length - 3) : ""); }

/* ---- header ---- */
var topRow = R.rows[0];
$("cRows").textContent = R.board_size || R.rows.length;
$("cWatch").textContent = R.watchlist_size || "";
$("cComps").textContent = (R.model && R.model.comps) || "";
if (topRow) { $("cTop").textContent = big(topRow.implied_value_usd); $("cTopName").textContent = topRow.name; }
var vc = R.verdict_counts || {};
$("cVerdicts").textContent = (vc.FARM || 0) + " FARM · " + (vc.WATCH || 0) + " WATCH · " + (vc.SKIP || 0) + " SKIP";
if (R.validation.splits && R.validation.splits[0]) $("cOos").textContent = "×" + R.validation.splits[0].out_of_sample_multiple;

/* ---- state, filters, sorting ---- */
var sortKey = "implied", sortDir = -1, q = "", cat = "", ver = "";
var cats = [];
R.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
cats.sort().forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; $("fCat").appendChild(o); });
function sortVal(r, k) {
  if (k === "implied") return r.implied_value_usd;
  if (k === "tvl") return r.tvl_usd;
  if (k === "growth") return r.growth_pct == null ? -1e9 : r.growth_pct;
  if (k === "age") return r.age_days == null ? -1e9 : r.age_days;
  if (k === "net") return r.farm.net_usd;
  return r.rank;
}
function filtered() {
  var out = R.rows.filter(function (r) {
    if (ver && r.farm.verdict !== ver) return false;
    if (cat && r.category !== cat) return false;
    if (q) { var s = (r.name + " " + r.slug + " " + (r.category || "")).toLowerCase(); if (s.indexOf(q) < 0) return false; }
    return true;
  });
  out.sort(function (a, b) { return (sortVal(a, sortKey) - sortVal(b, sortKey)) * sortDir; });
  return out;
}
function th(label, key, cls) {
  return '<th class="sort ' + (cls || "") + '" data-sort="' + key + '">' + label + (sortKey === key ? (sortDir === 1 ? " ▲" : " ▼") : "") + "</th>";
}
function renderBoard() {
  var rows = filtered();
  var h = '<table><thead><tr><th>#</th><th class="sort" data-sort="rank">Protocol</th><th>Chains</th>'
    + th("TVL", "tvl", "num") + th("7d %", "growth", "num") + th("Age", "age", "num")
    + th("Implied value", "implied", "num") + th("Net $", "net", "num") + "<th>Verdict</th></tr></thead><tbody>";
  rows.forEach(function (r) {
    h += '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + "</td><td><strong>" + esc(r.name) + '</strong><span class="sub2">' + esc(r.category || "") + " · " + esc(r.slug) + "</span></td>"
      + "<td>" + chains(r.chains) + "</td>"
      + '<td class="num">' + big(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td><td class="num">' + (r.age_days == null ? "—" : r.age_days + "d") + "</td>"
      + '<td class="num"><strong>' + big(r.implied_value_usd) + "</strong></td>"
      + '<td class="num">' + money(r.farm.net_usd) + "</td><td>" + badge(r.farm.verdict) + "</td></tr>";
  });
  h += "</tbody></table>";
  if (!rows.length) h = "<p class=\"muted\" style=\"padding:16px\">No rows match the current filters.</p>";
  $("boardWrap").innerHTML = h;
  $("count").textContent = rows.length + " of " + R.rows.length + " rows";
}
$("boardWrap").addEventListener("click", function (e) {
  var tr = e.target.closest("tr[data-slug]");
  if (tr) showRow(tr.getAttribute("data-slug"));
  var s = e.target.closest("th.sort");
  if (s) { var k = s.getAttribute("data-sort"); if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = -1; } renderBoard(); }
});
$("fSearch").addEventListener("input", function (e) { q = e.target.value.trim().toLowerCase(); renderBoard(); });
$("fCat").addEventListener("change", function (e) { cat = e.target.value; renderBoard(); });
$("fVerdict").addEventListener("change", function (e) { ver = e.target.value; renderBoard(); });

/* ---- farm steps (generated from the row, mirroring the model logic) ---- */
var GAS = { Ethereum: 8, Bitcoin: 5, Tron: 1, Solana: 0.05, Base: 0.3, Arbitrum: 0.3, Optimism: 0.3, Unichain: 0.3, "BNB Chain": 0.3, Binance: 0.3, Polygon: 0.1, Avalanche: 0.5 };
function gasOf(chain) { return GAS[chain] == null ? 0.5 : GAS[chain]; }
function actionFor(r, chain) {
  var c = (r.category || "").toLowerCase(), n = r.name, cap = money(r.farm.capital_usd);
  if (c.indexOf("lend") >= 0 || c.indexOf("cdp") >= 0 || c.indexOf("collateral") >= 0) return "Supply " + cap + " of USDC to " + n + " on " + chain + " and borrow a small amount against it, then repay the borrow within the week.";
  if (c.indexOf("dex") >= 0 || c.indexOf("yield") >= 0 || c.indexOf("leveraged farm") >= 0) return "Provide " + cap + " of liquidity to " + n + "'s main pool on " + chain + " and keep the position open.";
  if (c.indexOf("bridge") >= 0) return "Bridge " + cap + " of USDC to " + chain + " through " + n + " and use the bridged funds in its app.";
  if (c.indexOf("staking") >= 0 || c.indexOf("restak") >= 0) return "Stake " + cap + " of the chain's staking asset through " + n + " and keep the receipt token.";
  if (c.indexOf("perpetual") >= 0 || c.indexOf("derivative") >= 0 || c.indexOf("options") >= 0) return "Deposit " + cap + " of USDC as margin on " + n + ", open one small position, and close it within the week.";
  if (c.indexOf("prediction") >= 0) return "Fund " + cap + " and place one market position on " + n + ".";
  if (c.indexOf("curator") >= 0 || c.indexOf("allocator") >= 0) return "Deposit " + cap + " into a " + n + " vault on " + chain + " and keep the shares.";
  if (c.indexOf("stable") >= 0) return "Mint " + cap + " of the stable asset through " + n + " on " + chain + " and hold it.";
  if (c.indexOf("rwa") >= 0) return "Mint " + cap + " of the protocol's yield asset on " + chain + " and hold it.";
  if (c.indexOf("insurance") >= 0) return "Buy " + cap + " of cover from " + n + " on " + chain + " and keep the policy.";
  return "Deposit " + cap + " of USDC into " + n + " on " + chain + " and keep the position open.";
}
function weeklyActionFor(r) {
  var c = (r.category || "").toLowerCase();
  if (c.indexOf("lend") >= 0 || c.indexOf("cdp") >= 0 || c.indexOf("collateral") >= 0) return "repay a little of the borrow and borrow it back";
  if (c.indexOf("dex") >= 0 || c.indexOf("yield") >= 0 || c.indexOf("leveraged farm") >= 0) return "swap a small amount through the pool, or harvest the rewards and put them back in";
  if (c.indexOf("bridge") >= 0) return "make one small bridge transfer in either direction";
  if (c.indexOf("staking") >= 0 || c.indexOf("restak") >= 0) return "claim the staking rewards and stake them again";
  if (c.indexOf("perpetual") >= 0 || c.indexOf("derivative") >= 0 || c.indexOf("options") >= 0) return "open and close one small position, so the week shows trading volume";
  if (c.indexOf("prediction") >= 0) return "place one small market position";
  if (c.indexOf("curator") >= 0 || c.indexOf("allocator") >= 0) return "move a small amount between the vaults, or add to the position";
  if (c.indexOf("stable") >= 0) return "mint a small amount of the stable asset and redeem it";
  if (c.indexOf("rwa") >= 0) return "mint a small amount of the yield asset and hold it";
  if (c.indexOf("insurance") >= 0) return "top up the cover by a small amount";
  return "a deposit, a borrow, a swap or a vote";
}
function stepText(t, cost, time) {
  var s = t + " Cost: " + cost + ". Time: " + time + ".";
  if (s.length > 600) s = s.slice(0, 596) + "...";
  return s;
}
function farmSteps(r) {
  var f = r.farm, chain = (r.chains && r.chains[0]) || "its main chain", g = gasOf(chain), hold = f.hold_days;
  var clock = r.age_days == null ? "an unknown number of days" : r.age_days + " days";
  var chance = Math.round((f.launch_probability || 0.25) * 100);
  var line = f.verdict === "FARM"
    ? "Verdict FARM: the base case nets " + money(f.net_usd) + " after costs, so this one is worth the position."
    : f.verdict === "WATCH"
      ? "Verdict WATCH: the base case nets " + money(f.net_usd) + " after costs, so farm it only on a cheap chain or with a smaller position."
      : "Verdict SKIP: the base case nets " + money(f.net_usd) + " after costs, so the position costs more than the scenario pays.";
  return [
    stepText("Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.", "under $3 of gas for the first transaction", "5 minutes"),
    stepText(actionFor(r, chain), money(f.capital_usd) + " of capital and about " + money(g * 2) + " of gas for two setup transactions", "15 minutes to set up"),
    stepText("Make one qualifying action each week: " + weeklyActionFor(r) + ".", "about " + money(g) + " of gas a week", "10 minutes a week"),
    stepText("Check " + r.name + "'s own points or rewards page once a week and keep every action in this one wallet, so the activity is counted in the same place.", "no fee to check", "5 minutes a week"),
    stepText("Hold the position for at least " + hold + " days so the activity is counted in more than one snapshot.", "the " + money(f.capital_usd) + " stays in the position, about " + money(f.opportunity_usd) + " of forgone yield", hold + " days"),
    stepText("Farm economics for " + money(r.implied_value_usd) + " of implied value: if the token launches, your share of the farmer allocation is about " + money(f.airdrop_if_launched_usd) + "; at a " + chance + "% launch chance for a protocol " + clock + " with no token, that is " + money(f.expected_value_usd) + " expected, against " + money(f.gas_usd) + " of gas and " + money(f.opportunity_usd) + " of forgone yield. " + line, money(f.gas_usd + f.opportunity_usd) + " of costs in the base case", hold + " days, then one claim"),
    stepText("When a claim goes live, claim only from the link the protocol itself publishes, withdraw in stages, and write down what you claimed and when.", "about " + money(g * 2) + " of gas to claim and withdraw", "15 minutes"),
    stepText("Before you claim anything, open the protocol's own page and check it still records no token for " + r.name + "; this board records no token, so verify that first, and never pay to claim.", "no fee to check, and never pay to claim", "10 minutes")
  ];
}

/* ---- detail panel ---- */
function showRow(slug) {
  var r = null;
  R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
  if (!r) return;
  switchTab("board");
  var c = R.model.coefficients, logTvl = Math.log(r.tvl_usd), g = (r.growth_pct || 0) / 100;
  var fitted = c.intercept + c.log_tvl * logTvl + c.growth * g;
  var f = r.farm;
  var chance = Math.round((f.launch_probability || 0.25) * 100);
  var clock = r.age_days == null ? "age unknown" : r.age_days + " days with no token";
  var h = "<h2>#" + r.rank + " " + esc(r.name) + " " + badge(f.verdict) + "</h2>"
    + '<p class="muted">' + esc(r.slug) + " · " + esc(r.category || "") + " · Listed " + esc(r.listed_at || "—") + " · " + clock + " · launch chance " + chance + "%</p>"
    + '<div class="dgrid">'
    + "<div><span class=\"k\">TVL</span><strong>" + big(r.tvl_usd) + "</strong></div>"
    + "<div><span class=\"k\">7-day change</span><strong>" + pct(r.change_7d) + "</strong></div>"
    + "<div><span class=\"k\">Implied value</span><strong>" + big(r.implied_value_usd) + "</strong></div>"
    + "<div><span class=\"k\">Farm net</span><strong>" + money(f.net_usd) + "</strong></div>"
    + "<div><span class=\"k\">Chains</span><strong>" + esc(r.chains.join(", ")) + "</strong></div>"
    + "<div><span class=\"k\">Capital</span><strong>" + money(f.capital_usd) + "</strong></div>"
    + "<div><span class=\"k\">Hold</span><strong>" + f.hold_days + " days</strong></div>"
    + "<div><span class=\"k\">Gas (est.)</span><strong>" + money(f.gas_usd) + "</strong></div>"
    + "<div><span class=\"k\">No-token clock</span><strong>" + (r.age_days == null ? "—" : r.age_days + " days") + "</strong></div>"
    + "<div><span class=\"k\">Launch chance</span><strong>" + chance + "%</strong></div></div>"
    + "<h3>Model breakdown</h3><p>log(market cap) = b0 + b1&middot;log(TVL) + b2&middot;growth, fit by OLS on "
    + (R.model.comps || "") + " traded comps. For this row: log(TVL) = ln(" + num(r.tvl_usd) + ") = " + logTvl.toFixed(2)
    + ", growth = " + (r.growth_pct == null ? "—" : r.growth_pct.toFixed(2) + "%") + ".</p>"
    + '<p><span class="mono">' + c.intercept + " + " + c.log_tvl + " × " + logTvl.toFixed(2) + " + " + c.growth + " × " + g.toFixed(4) + " = " + fitted.toFixed(4) + "</span></p>"
    + "<p>Fitted log implied value " + fitted.toFixed(4) + " (recorded " + r.log_implied.toFixed(4) + "), so implied value = exp(" + r.log_implied.toFixed(4) + ") = " + big(r.implied_value_usd) + ".</p>"
    + "<p>No-token clock: this protocol has run " + clock + ". The clock does not enter the value regression — the comps reject it there — but it prices the farm: the launch chance is " + chance + "% at this age, against 35% under a year and 15% past three years.</p>"
    + "<h3>Farm plan — eight steps</h3><ol class=\"steps\">"
    + farmSteps(r).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>"
    + "<h3>Farm economics</h3><table><thead><tr><th>Item</th><th class=\"num\">Amount</th></tr></thead><tbody>"
    + "<tr><td>Capital</td><td class=\"num\">" + money(f.capital_usd) + "</td></tr>"
    + "<tr><td>Hold</td><td class=\"num\">" + f.hold_days + " days</td></tr>"
    + "<tr><td>Gas</td><td class=\"num\">" + money(f.gas_usd) + "</td></tr>"
    + "<tr><td>Opportunity cost</td><td class=\"num\">" + money(f.opportunity_usd) + "</td></tr>"
    + "<tr><td>Airdrop if launched</td><td class=\"num\">" + money(f.airdrop_if_launched_usd) + "</td></tr>"
    + "<tr><td>Launch chance (" + clock + ")</td><td class=\"num\">" + chance + "%</td></tr>"
    + "<tr><td>Expected value (" + chance + "% launch chance)</td><td class=\"num\">" + money(f.expected_value_usd) + "</td></tr>"
    + "<tr><td><strong>Net</strong></td><td class=\"num\"><strong>" + money(f.net_usd) + "</strong></td></tr>"
    + "<tr><td>Verdict</td><td class=\"num\">" + badge(f.verdict) + "</td></tr></tbody></table>";
  $("detail").innerHTML = h;
  try { history.replaceState(null, "", "#row=" + slug); } catch (e) {}
  $("detail").scrollIntoView();
}

/* ---- live tab ---- */
function renderLive() {
  var rows = R.live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); });
  var h = '<table><thead><tr><th>Protocol</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d %</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    h += "<tr><td><strong>" + esc(r.name) + '</strong><span class="sub2">' + esc(r.category || "") + " · " + esc(r.slug) + "</span></td><td>" + chains(r.chains) + '</td><td class="num">' + big(r.tvl_usd) + '</td><td class="num"><strong>' + big(r.mcap_usd) + "</strong></td><td class=\"num\">" + pct(r.change_7d) + "</td></tr>";
  });
  $("liveWrap").innerHTML = h + "</tbody></table>";
}

/* ---- size-curve chart: comps as dots, the fitted line, the board's top 10 as diamonds ---- */
function sizeCurveSvg() {
  var sc = R.size_curve || { comps: [], board_top: [], line: { x0: 0, y0: 0, x1: 1, y1: 1 } };
  var W = 880, H = 300, L = 72, Rm = 16, T = 14, B = 34;
  var xs = sc.comps.map(function (p) { return p.log_tvl; }).concat(sc.board_top.map(function (p) { return p.log_tvl; }));
  var ys = sc.comps.map(function (p) { return p.log_mcap; }).concat(sc.board_top.map(function (p) { return p.log_mcap; }));
  if (!xs.length) return "<p class=\"muted\">No size-curve data.</p>";
  var x0 = Math.floor(Math.min.apply(null, xs.concat([sc.line.x0])) - 0.5), x1 = Math.ceil(Math.max.apply(null, xs.concat([sc.line.x1])) + 0.5);
  var y0 = Math.floor(Math.min.apply(null, ys.concat([sc.line.y0])) - 0.5), y1 = Math.ceil(Math.max.apply(null, ys.concat([sc.line.y1])) + 0.5);
  function X(v) { return L + (v - x0) / (x1 - x0) * (W - L - Rm); }
  function Y(v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); }
  function moneyAxis(v) { var d = Math.exp(v); if (d >= 1e9) return "$" + Math.round(d / 1e9) + "B"; if (d >= 1e6) return "$" + Math.round(d / 1e6) + "M"; return "$" + Math.round(d / 1e3) + "K"; }
  var h = '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img" aria-label="Size curve: traded comps and the fitted line">';
  var gx;
  for (gx = Math.ceil(x0); gx <= x1; gx += 1) {
    h += '<line x1="' + X(gx).toFixed(1) + '" y1="' + Y(y0).toFixed(1) + '" x2="' + X(gx).toFixed(1) + '" y2="' + Y(y1).toFixed(1) + '" class="grid"/>';
    h += '<text x="' + X(gx).toFixed(1) + '" y="' + (H - 18).toFixed(1) + '" class="ax">' + moneyAxis(gx) + "</text>";
  }
  var gy;
  for (gy = Math.ceil(y0); gy <= y1; gy += 1) {
    h += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(gy).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(gy).toFixed(1) + '" class="grid"/>';
    h += '<text x="' + (L - 8).toFixed(1) + '" y="' + (Y(gy) + 4).toFixed(1) + '" class="ax" text-anchor="end">' + moneyAxis(gy) + "</text>";
  }
  h += '<text x="' + ((W - L - Rm) / 2 + L).toFixed(1) + '" y="' + (H - 4).toFixed(1) + '" class="ax lab">TVL (log scale)</text>';
  h += '<text x="16" y="' + ((H - T - B) / 2 + T).toFixed(1) + '" class="ax lab" transform="rotate(-90 16 ' + ((H - T - B) / 2 + T).toFixed(1) + ')">Market cap (log scale)</text>';
  h += '<line x1="' + X(sc.line.x0).toFixed(1) + '" y1="' + Y(sc.line.y0).toFixed(1) + '" x2="' + X(sc.line.x1).toFixed(1) + '" y2="' + Y(sc.line.y1).toFixed(1) + '" class="fitline"/>';
  sc.comps.forEach(function (p) {
    h += '<circle cx="' + X(p.log_tvl).toFixed(1) + '" cy="' + Y(p.log_mcap).toFixed(1) + '" r="3.2" class="dot"><title>' + esc(p.slug) + "</title></circle>";
  });
  sc.board_top.forEach(function (p) {
    var cx = X(p.log_tvl), cy = Y(p.log_mcap);
    h += '<path d="M ' + cx.toFixed(1) + " " + (cy - 6).toFixed(1) + " L " + (cx + 6).toFixed(1) + " " + cy.toFixed(1) + " L " + cx.toFixed(1) + " " + (cy + 6).toFixed(1) + " L " + (cx - 6).toFixed(1) + " " + cy.toFixed(1) + ' Z" class="top"><title>' + esc(p.slug) + " (board top 10, fitted value)</title></path>";
  });
  // Legend at the top right, clear of the dots and the line.
  var lx = W - Rm - 392;
  h += '<g class="legend"><circle cx="' + (lx + 8) + '" cy="24" r="3.2" class="dot"/><text x="' + (lx + 16) + '" y="28" class="ax lg">Traded comp</text>'
    + '<line x1="' + (lx + 108) + '" y1="24" x2="' + (lx + 132) + '" y2="24" class="fitline"/><text x="' + (lx + 138) + '" y="28" class="ax lg">Fitted line (growth 0)</text>'
    + '<path d="M ' + (lx + 268) + ' 18 L ' + (lx + 274) + ' 24 L ' + (lx + 268) + ' 30 L ' + (lx + 262) + ' 24 Z" class="top"/><text x="' + (lx + 280) + '" y="28" class="ax lg">Board top 10 (fitted)</text></g></svg>';
  return h;
}

/* ---- method tab ---- */
function renderMethod() {
  var v = R.validation, c = R.model.coefficients, fa = R.farm_assumptions || {};
  var five = (v.splits || [])[0] || {}, ts = (v.splits || [])[1] || {};
  var growthBoot = ((v.bootstrap || {}).coefficients || []).filter(function (x) { return x.name === "growth"; })[0] || {};
  var h = "<h2>Method</h2>"
    + "<h3>Model — radar-4</h3><p>log(market cap) = b0 + b1&middot;log(TVL) + b2&middot;growth, fit by OLS on " + (R.model.comps || "") + " traded comps: "
    + esc(R.model.comp_rule || "") + ". Growth is floored at &minus;50% and capped at +50%.</p>"
    + '<table><thead><tr><th>Coefficient</th><th class="num">Value</th></tr></thead><tbody>'
    + '<tr><td>Intercept (b0)</td><td class="num">' + c.intercept + "</td></tr>"
    + '<tr><td>log(TVL) (b1)</td><td class="num">' + c.log_tvl + "</td></tr>"
    + '<tr><td>Growth (b2)</td><td class="num">' + c.growth + "</td></tr></tbody></table>"
    + "<h3>The size curve</h3><p>Each dot is a traded comp; the line is the fit at zero growth; the diamonds are the board&rsquo;s top 10 at their fitted values. The slope is well below 1: value per dollar of TVL falls with size.</p>"
    + sizeCurveSvg()
    + "<h3>Out-of-sample validation</h3><p>In-sample R&sup2; " + v.in_sample_r2 + ", median |log error| " + v.in_sample_median_abs_log_error + ".</p>"
    + '<table><thead><tr><th>Split</th><th class="num">R&sup2; out of sample</th><th class="num">Median |log error|</th><th class="num">OOS multiple</th></tr></thead><tbody>';
  (v.splits || []).forEach(function (s) {
    h += "<tr><td>" + esc(s.method) + " (train " + s.n_train + ", test " + s.n_test + ')</td><td class="num">' + s.r2_out_of_sample + '</td><td class="num">' + s.median_abs_log_error + '</td><td class="num">×' + s.out_of_sample_multiple + "</td></tr>";
  });
  h += "</tbody></table><p>Implied values are order-of-magnitude estimates: the median out-of-sample error is &times;" + five.out_of_sample_multiple + ", so a $100M implied value is honestly read as roughly $"
    + Math.round(100 / five.out_of_sample_multiple) + "M–$" + Math.round(100 * five.out_of_sample_multiple) + "M.</p>";
  h += "<h3>Cross-check on all core comps</h3><p>The same model, fit on its " + (R.model.comps || "") + " comps, scored against all " + (v.cross_check ? v.cross_check.n_scored : "") + " core-DeFi traded tokens — including the dead listings it no longer fits on:</p>"
    + '<table><thead><tr><th>Split</th><th class="num">R&sup2; out of sample</th><th class="num">Median |log error|</th><th class="num">OOS multiple</th></tr></thead><tbody>';
  (v.cross_check ? v.cross_check.splits : []).forEach(function (s) {
    h += "<tr><td>" + esc(s.method) + " (train " + s.n_train + ", test " + s.n_test + ')</td><td class="num">' + s.r2_out_of_sample + '</td><td class="num">' + s.median_abs_log_error + '</td><td class="num">×' + s.out_of_sample_multiple + "</td></tr>";
  });
  h += "</tbody></table><p>The median error stays better than radar-3&rsquo;s &times;2.94 / &times;2.22 even on the dead listings, while R&sup2; falls — the dead listings are the values the model systematically over-predicts, which is why they are out of the fit.</p>";
  h += "<h3>Ablation — what was tried and dropped</h3><p>Both R&sup2; and the median |log error| are shown: R&sup2; rewards fitting the extremes, the median rewards the typical protocol, and the two disagree on several specs. The chosen model is the one that wins the typical error on both splits.</p><table><thead><tr><th>Spec</th><th class=\"num\">5-fold R&sup2;</th><th class=\"num\">5-fold median</th><th class=\"num\">Time-split R&sup2;</th><th class=\"num\">Time-split median</th><th>Kept?</th><th>Why</th></tr></thead><tbody>";
  (v.ablation || []).forEach(function (a) {
    h += "<tr><td>" + esc(a.spec) + '</td><td class="num">' + a.r2_five_fold + '</td><td class="num">' + a.median_five_fold + '</td><td class="num">' + a.r2_time_split + '</td><td class="num">' + a.median_time_split + "</td><td>" + (a.kept ? "Yes" : "No") + "</td><td>" + esc(a.why) + "</td></tr>";
  });
  h += "</tbody></table><p>Age does not enter the value regression: the capped-years form wins R&sup2; but loses the median error on both splits, log age loses almost everywhere, and the same capped-years form collapses the time split on the full 76 comps — the age effect is fragile and cohort-dependent. Age does price the farm instead — see the no-token clock below.</p>";
  var b = v.bootstrap || { coefficients: [], top10_stability: [] };
  h += "<h3>Bootstrap — 200 refits</h3><table><thead><tr><th>Coefficient</th><th class=\"num\">Mean</th><th class=\"num\">SD</th><th class=\"num\">5th pct</th><th class=\"num\">95th pct</th></tr></thead><tbody>";
  (b.coefficients || []).forEach(function (x) {
    h += "<tr><td>" + esc(x.name) + '</td><td class="num">' + x.mean + '</td><td class="num">' + x.sd + '</td><td class="num">' + x.p5 + '</td><td class="num">' + x.p95 + "</td></tr>";
  });
  h += "</tbody></table>"
    + '<div class="note"><strong>Honesty note:</strong> the growth coefficient&rsquo;s bootstrap 90% interval runs from ' + growthBoot.p5 + " to " + growthBoot.p95 + " — it covers zero. Growth is kept because it helps out of sample, but its sign is not firmly established.</div>"
    + "<h3>Top-10 stability</h3><table><thead><tr><th>Rank</th><th>Protocol</th><th class=\"num\">Stays in top 10</th><th class=\"num\">Median bootstrap rank</th></tr></thead><tbody>";
  (b.top10_stability || []).forEach(function (x) {
    h += "<tr><td>" + x.rank + "</td><td>" + esc(x.slug) + '</td><td class="num">' + Math.round(x.stay_share * 100) + '%</td><td class="num">' + x.median_bootstrap_rank + "</td></tr>";
  });
  h += "</tbody></table>"
    + "<h3>The no-token clock</h3><p>Each row carries the days it has run with no token. The clock does not enter the value regression — the comps reject it there — but it sets the farm&rsquo;s launch chance, a stated scenario, never a fitted claim. The fitted age coefficient is negative in every specification tried, and age correlates &minus;0.26 with the base model&rsquo;s residuals: the longer a protocol runs with no token, the less the scenario allows for a launch.</p>"
    + '<table><thead><tr><th>Days with no token</th><th class="num">Launch chance</th></tr></thead><tbody>';
  ((fa.launch_probability_bands || [])).forEach(function (x) {
    h += "<tr><td>" + esc(x.band) + '</td><td class="num">' + Math.round(x.probability * 100) + "%</td></tr>";
  });
  h += "</tbody></table>"
    + "<h3>Farm assumptions</h3><p>Farmer allocation share " + (fa.farmer_allocation_share * 100) + "%, farmer TVL share " + (fa.farmer_tvl_share * 100)
    + "%, launch probability by no-token clock (see above; " + (fa.launch_probability * 100) + "% where the age is unknown), opportunity rate " + (fa.opportunity_rate_annual * 100)
    + "% a year. Gas per transaction (stated estimates): Ethereum $8, Bitcoin $5, Tron $1, Solana $0.05, Base / Arbitrum / Optimism / Unichain / BNB Chain $0.30, Polygon $0.10, Avalanche $0.50, other chains $0.50.</p>"
    + "<h3>Sensitivity — verdicts under other assumptions</h3><table><thead><tr><th>Assumption</th><th class=\"num\">FARM</th><th class=\"num\">WATCH</th><th class=\"num\">SKIP</th></tr></thead><tbody>";
  (R.sensitivity || []).forEach(function (s) {
    h += "<tr><td>" + esc(s.assumption) + '</td><td class="num">' + s.farm + '</td><td class="num">' + s.watch + '</td><td class="num">' + s.skip + "</td></tr>";
  });
  h += "</tbody></table>"
    + "<h3>Limitations</h3><p>Implied values are order-of-magnitude estimates (median out-of-sample error &times;" + five.out_of_sample_multiple + " on the 5-fold split, &times;" + ts.out_of_sample_multiple + " on the time split). "
    + "Age, chain count and category carry no weight in the value formula because the comps do not support them; age prices the farm instead, as a stated scenario. "
    + "&ldquo;Records no token&rdquo; means the snapshot&rsquo;s record, not proof that no token exists — always verify on the protocol&rsquo;s own page before claiming anything, and never pay to claim.</p>";
  $("methodWrap").innerHTML = h;
}

/* ---- tabs ---- */
function switchTab(name) {
  ["board", "live", "method"].forEach(function (t) {
    $("tab-" + t).hidden = t !== name;
    $("t-" + t).classList.toggle("on", t === name);
  });
}
document.querySelectorAll(".tabs button").forEach(function (b) {
  b.addEventListener("click", function () { switchTab(b.getAttribute("data-tab")); });
});

/* ---- init + hash routing ---- */
renderBoard(); renderLive(); renderMethod();
(function () {
  var h = {};
  location.hash.slice(1).split("&").forEach(function (p) { var kv = p.split("="); if (kv[0]) h[kv[0]] = decodeURIComponent(kv[1] || ""); });
  if (h.tab === "live" || h.tab === "method") switchTab(h.tab);
  if (h.verdict === "FARM" || h.verdict === "WATCH" || h.verdict === "SKIP") { ver = h.verdict; $("fVerdict").value = ver; renderBoard(); }
  if (h.row) showRow(h.row);
})();
