// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// runbooks to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy/runbook.csv', '--app', 'examples/messy/application.json', '--config', 'examples/config.json'];
export const CLEAN = ['examples/clean/runbook.json'];
const FILE = 'examples/messy/runbook.csv';

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy runbook: the counts, one finding of every rule that fires, the notes and the
// result.
export const EXPECTED = [
  'input: runbook examples/messy/runbook.csv (CSV, UTF-8, 15 steps); application file examples/messy/application.json (JSON, UTF-8)',
  'config: examples/config.json (Brindlecombe cutover review): required phases backup, switch, verify, rollback and hypercare;',
  '1 phase alias from the configuration',
  'application: Brindlecombe Claims Portal; strategy retire (given as "Decommission"); downtime window 180 minutes',
  'steps: 15 in 6 phases, 390 minutes in all; critical path 200 minutes over 5 steps; downtime window 180 minutes, 0 minutes left after the critical path; rollback 85 minutes',
  'findings: 18 (12 error, 6 warning)',
  'the runbook has no step in the verify phase, which is required',
  'the runbook has no step in the hypercare phase, which is required',
  'the steps "P3" and "P4" depend on each other in a cycle (P3 -> P4 -> P3), so no order can run them',
  `the step id "F1" is used again; the step at ${FILE}:6 has it first`,
  'the migrate-data step "M1" is a first data move, and no backup step comes before it',
  'the migrate-data step "M2" changes something and names no rollback step',
  'the switch step "S1" starts the switch phase, and no go/no-go gate comes before it',
  'the step "S1" depends on "S99", which is not in the runbook',
  'the switch step "S1" names the rollback step "R7", which is not in the runbook',
  'the critical path takes 200 minutes, 20 more than the downtime window of 180 minutes: F1 10, M1 120, M2 45, S1 15, S2 10',
  'the switch step "S2" names "P1" as its rollback step, but "P1" is a prepare step, not a step of the rollback phase',
  'the communication plan of the application is no',
  'the step "P2" has no owner',
  'the step "R3" does not say how its success is checked',
  'the strategy is retire (given as "Decommission"), but the runbook moves data in 2 migrate-data steps',
  'the 3 rollback steps take 85 minutes in all, more than the 0 minutes left of the downtime window of 180 minutes',
  'no business sign-off is named for the application',
  'note: 2 dependencies inside a cycle are left out of the critical path',
  'not a go/no-go decision and not a certification',
  'RESULT: FAIL - 12 findings at or above error (12 error, 6 warning)'
];
// The gate G1 is not before the switch, so it does not count; the data owner is named; the backup step is read through
// the alias of the configuration; the second F1 is not used for the dependencies; and nothing about the clean runbook.
export const UNWANTED = ['RESULT: PASS', 'WARNING  missing-data-owner', 'ERROR    invalid-field', '"G1" has no', 'the step "G1"', 'ERROR    unreadable-file', 'ERROR    unparsable-file', 'WARNING  missing-application-field'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy runbook', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean runbook', clean, 0, ['input: runbook examples/clean/runbook.json (JSON, UTF-8, 10 steps); no application file', 'steps: 10 in 8 phases, 290 minutes in all; critical path 135 minutes over 6 steps; downtime window 240 minutes, 105 minutes left after the critical path; rollback 15 minutes', 'findings: 0', 'RESULT: PASS - no finding at or above error'], ['  WARNING  ', '  ERROR  ', 'RESULT: FAIL', 'note:']);

  // Without the configuration, the phase of B1 is not read and hypercare is not required.
  expect('messy, built-in configuration', await run(MESSY.slice(0, 3)), 1, ['config: built-in defaults', 'the step "B1" has the phase "Snapshot and Seal", which is none of the phases', 'the runbook has no step in the backup phase, which is required'], ['hypercare phase, which is required']);
  // Without the application file, the application fields are missing.
  expect('messy, no application file', await run(MESSY.slice(0, 1)), 1, ['application: none', 'the application has no downtime window (no application file was given with --app)'], ['ERROR    critical-path-over-window']);
  // Only the errors are shown with --min-severity error.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 12 (12 error); 6 below error not shown', 'RESULT: FAIL - 12 findings at or above error'], ['WARNING  ']);
  // The clean runbook passes when every level fails the run.
  expect('clean, fail on info', await run([...CLEAN, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // A JSON runbook holds its own application, so --app with it stops the run.
  expect('clean, with --app', await run([...CLEAN, '--app', 'examples/messy/application.json']), 2, ['a JSON runbook holds its application in its header; --app is for a CSV runbook'], [], 'err');
  // A file of no kind the tool reads stops the run.
  expect('a README named', await run(['examples/messy/README.md']), 2, ['examples/messy/README.md: not a kind of file the tool reads'], [], 'err');

  // The README shows the whole report of the messy runbook, the --explain lines of one finding, the GitHub annotations
  // of two findings, the start of the CSV report and the report of the clean runbook.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy runbook differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean runbook differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('no-go-gate') && l.includes(`${FILE}:12`));
  const sample = lines.slice(at, at + 8).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the go/no-go gate differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  const picked = github.out.split('\n').filter((x) => x.includes('title=cutover-runbook-check dependency-cycle::') || x.includes('title=cutover-runbook-check critical-path-over-window::'));
  if (picked.length !== 2) problems.push('github: the sample lines are not in the output');
  for (const l of picked) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const csv = await run([...MESSY, '--format', 'csv']);
  if (csv.code !== 1) problems.push(`csv: exit code ${csv.code}, expected 1`);
  const head = csv.out.split('\r\n').slice(0, 4).join('\n');
  if (!readme.includes(head)) problems.push('README: the CSV sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-findings.csv'), csv.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
