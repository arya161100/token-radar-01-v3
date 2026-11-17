// Token Radar radar-4: a fitted token launch radar (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), fits
// a regression of log market cap on log TVL and seven-day growth on the snapshot's own traded
// comps (61 tokens that actually trade), validates it out of sample (5-fold and a time split,
// cross-checked on all 76 core comps) and under 200 bootstrap refits, ranks every rankable
// pre-token protocol by the fitted implied value, prices each farm plan's launch chance off the
// protocol's no-token clock, nets every farm plan to dollars, and writes the ranked board to
// /output/board.json, the dashboard's data to /output/data.js, copies dashboard/ and
// screenshots/ to /output, and writes /output/dossier.json with the vendored make.fun library.
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kits/token-radar-01-kit/token-radar-01-kit/input/snapshot.json
// Run it twice: the output bytes are identical (seeded bootstrap, sorted iteration, no clock).

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, buildRadar, dataScript, fitModel, isComp, parseSnapshot, validateModel } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const comps = snapshot.protocols.filter(isComp);
if (comps.length < 10) {
  process.stderr.write(`token radar: only ${comps.length} traded comps: the regression has nothing to fit on\n`);
  process.exit(1);
}
const fit = fitModel(comps);
const board = buildBoard(snapshot, fit);
const validation = validateModel(snapshot, fit, comps, board);
const { radar } = buildRadar(snapshot, fit, validation);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 4) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 4, the board, a detail view, a filtered view and the method tab\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const five = radar.validation.splits[0]!;
const ts = radar.validation.splits[1]!;
const cc5 = radar.validation.cross_check.splits[0]!;
const ccts = radar.validation.cross_check.splits[1]!;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${comps.length} traded comps, ${board.length} rows ranked\n` +
    `token radar: fit log(mcap) = ${radar.model.coefficients.intercept} + ${radar.model.coefficients.log_tvl}*log(TVL) + ${radar.model.coefficients.growth}*growth (in-sample R2 ${radar.validation.in_sample_r2})\n` +
    `token radar: 5-fold R2 ${five.r2_out_of_sample}, median |log error| ${five.median_abs_log_error}, OOS multiple x${five.out_of_sample_multiple}; time-split R2 ${ts.r2_out_of_sample}, median |log error| ${ts.median_abs_log_error}, OOS multiple x${ts.out_of_sample_multiple}\n` +
    `token radar: cross-check on all ${radar.validation.cross_check.n_scored} core comps: 5-fold multiple x${cc5.out_of_sample_multiple}, time-split multiple x${ccts.out_of_sample_multiple}\n` +
    `token radar: verdicts FARM ${radar.verdict_counts.FARM}, WATCH ${radar.verdict_counts.WATCH}, SKIP ${radar.verdict_counts.SKIP}; top implied $${board[0]!.implied_value_usd.toLocaleString('en-US')} (${board[0]!.slug})\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
