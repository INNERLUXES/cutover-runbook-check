import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CSV_COLUMNS, NOTICE, USAGE, VERSION, csvField, escapeData, escapeProperty, parseArgs, toCsv, toGithub, toJson, toText } from '../src/index.js';
import { APP, STEPS, appFile, checkOf, cli, columnOf, csvRunbook, jsonRunbook, lineOf, run, stepsWith, withFiles } from './helpers.js';

const CLEAN = { 'r.json': jsonRunbook() };
const WARN = { 'r.json': jsonRunbook({ steps: stepsWith({ P1: { owner: '' } }) }) };
const ERROR = { 'r.json': jsonRunbook({ steps: stepsWith({ G1: { gate: false } }) }) };
const CSV = { 'r.csv': csvRunbook(), 'app.json': appFile() };
const ARGS = ['r.json'];

test('cli: exit 0 below the fail-on level, 1 at or above it, from the flag or the configuration', async () => {
  const clean = await run(CLEAN, ARGS);
  assert.equal(clean.code, 0, clean.err);
  assert.match(clean.out, /^cutover-runbook-check: r\.json\ninput: runbook r\.json \(JSON, UTF-8, 9 steps\); no application file\nconfig: built-in defaults: required phases backup, switch, verify and rollback; window phases freeze, backup, migrate-data, switch and verify; minimum severity info; fail on error\nrules: missing-phase \(error\); /);
  assert.match(clean.out, /\napplication: Order Desk; strategy rehost; downtime window 120 minutes; data owner Sales Ops; business sign-off Head of Sales; communication plan yes\nsteps: 9 in 7 phases, 105 minutes in all; critical path 80 minutes over 6 steps; downtime window 120 minutes, 40 minutes left after the critical path; rollback 15 minutes\nfindings: 0\n/);
  assert.match(clean.out, /RESULT: PASS - no finding at or above error\n$/);
  assert.equal(clean.err, '');
  assert.equal((await run(WARN, ARGS)).code, 0, 'a warning does not fail the run by default');
  assert.equal((await run(WARN, [...ARGS, '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(CLEAN, [...ARGS, '--fail-on', 'info'])).code, 0, 'nothing at all to report');
  const configured = await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, [...ARGS, '--config', 'c.json']);
  assert.equal(configured.code, 1);
  assert.match(configured.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)\n$/);
  assert.equal((await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, [...ARGS, '--config', 'c.json', '--fail-on', 'error'])).code, 0, 'the flag wins over the configuration');
  const error = await run(ERROR, ARGS);
  assert.equal(error.code, 1);
  assert.match(error.out, /RESULT: FAIL - 1 finding at or above error \(1 error\)\n$/);
  const broken = await run({ 'r.csv': 'id,phase\n1,"x\n' }, ['r.csv']);
  assert.equal(broken.code, 1, 'a file that cannot be parsed fails the run at the default level');
  assert.match(broken.out, /ERROR {4}unparsable-file +r\.csv:2\n {11}line 2, column 3: a quoted field that is not closed; nothing in the file is read/);
});

test('cli: a CSV runbook with its application file gives the report of the JSON runbook', async () => {
  const r = await run(CSV, ['r.csv', '--app', 'app.json', '--json']);
  const j = await run(CLEAN, ['r.json', '--json']);
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.deepEqual(out.input, { runbook: { file: 'r.csv', kind: 'csv', read: true, encoding: 'utf-8', steps: 9 }, application: { file: 'app.json', kind: 'json', read: true, encoding: 'utf-8' } });
  const other = JSON.parse(j.out);
  assert.deepEqual(out.summary.totals, other.summary.totals);
  assert.deepEqual(out.summary.phases, other.summary.phases);
  assert.deepEqual(out.findings, other.findings);
  assert.deepEqual(out.summary.criticalPath.steps.map((s) => s.id), ['F1', 'B1', 'M1', 'G1', 'S1', 'V1']);
  assert.match((await run(CSV, ['r.csv', '--app', 'app.json'])).out, /\ninput: runbook r\.csv \(CSV, UTF-8, 9 steps\); application file app\.json \(JSON, UTF-8\)\n/);
});

test('cli: --min-severity hides the findings below it and a note counts them', async () => {
  const r = await run(WARN, [...ARGS, '--min-severity', 'error']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0; 1 below error not shown/);
  assert.match(r.out, /note: 1 finding below error is not shown/);
});

test('cli: UTF-16 files with a byte order mark are read, little and big endian', async () => {
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csvRunbook(), 'utf16le')]);
  const be = Buffer.from(le);
  for (let i = 0; i < be.length; i += 2) [be[i], be[i + 1]] = [le[i + 1], le[i]];
  const a = await run({ 'r.csv': le, 'app.json': appFile() }, ['r.csv', '--app', 'app.json', '--json']);
  assert.equal(JSON.parse(a.out).input.runbook.encoding, 'utf-16le');
  assert.equal(JSON.parse(a.out).totals.findings, 0);
  const b = await run({ 'r.csv': be, 'app.json': appFile() }, ['r.csv', '--app', 'app.json']);
  assert.match(b.out, /\(CSV, UTF-16 BE, 9 steps\)/);
});

test('cli: exit 2 for usage errors, with the usage and nothing on standard output', async () => {
  for (const [args, message] of [
    [[], /give the runbook to check: a \.json or \.csv file/],
    [['r.json', 'other.json'], /other\.json: one runbook per run; check each runbook in its own run/],
    [['r.json', '--bogus'], /unknown argument --bogus/],
    [['r.json', '--format', 'xml'], /unknown format xml \(text, json, csv or github\)/],
    [['r.json', '--format', 'json', '--format', 'text'], /--format was given twice/],
    [['r.json', '--json', '--format', 'csv'], /--json and --format csv ask for two formats; give one/],
    [['r.json', '--min-severity', 'notice'], /--min-severity: unknown level notice \(info, warning, error\)/],
    [['r.json', '--fail-on', 'fatal'], /--fail-on: unknown level fatal/],
    [['r.json', '--app', 'a.json', '--app', 'b.json'], /--app was given twice/],
    [['r.json', '--config'], /--config needs a value/],
    [['r.json', '--app', '--json'], /--app needs a value/],
    [['r.json', '--explain', '--format', 'github'], /--explain adds the sources of each finding to the text and JSON reports; the github format has no place for them/],
    [['r.json', '--explain', '--format', 'csv'], /the csv format has no place for them/],
    [['-'], /reading from standard input is not supported/],
    [['r.json', '--config', '-'], /reading from standard input is not supported/],
    [['https://example.test/r.json'], /give a local path; the tool never fetches a URL/],
    [['r.csv', '--app', 'file://a.json'], /give a local path/]
  ]) {
    const r = await run(CLEAN, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, message, args.join(' '));
    assert.ok(r.err.includes('Usage: cutover-runbook-check'), args.join(' '));
    assert.equal(r.out, '');
  }
  assert.deepEqual(parseArgs(['x.csv', '--app', 'a.json']).app, 'a.json');
});

test('cli: exit 2 for input errors, with the problems and no result', async () => {
  for (const [files, args, message] of [
    [CLEAN, ['missing.json'], /missing\.json: no such file/],
    [{ 'f.txt': 'x' }, ['f.txt'], /f\.txt: not a kind of file the tool reads \(a runbook whose name ends in \.json or \.csv\)/],
    [{ 'd/r.json': '{}' }, ['d'], /d: is a folder; give the file itself/],
    [CLEAN, ['r.json', '--app', 'r.json'], /a JSON runbook holds its application in its header; --app is for a CSV runbook/],
    [CSV, ['r.csv', '--app', 'r.csv'], /r\.csv: an application file is JSON, and its name ends in \.json/],
    [CSV, ['r.csv', '--app', 'nope.json'], /nope\.json: no such file/],
    [{ ...CSV, 'c.json': '{"failOm": "info"}' }, ['r.csv', '--config', 'c.json'], /c\.json: line 1: "failOm" is not a key of the configuration; did you mean "failOn"\?/],
    [CLEAN, ['r.json', '--config', 'nope.json'], /nope\.json: no such file/]
  ]) {
    const r = await run(files, args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.err}`);
    assert.match(r.err, /^cutover-runbook-check: no result, the input has (?:a problem|problems):\n/);
    assert.match(r.err, message);
    assert.equal(r.out, '');
  }
});

test('cli: a binary or invalid runbook or application file is an error finding', async () => {
  const bin = await run({ 'r.csv': Buffer.from([0x69, 0, 0x64]) }, ['r.csv']);
  assert.equal(bin.code, 1);
  assert.match(bin.out, /r\.csv:1\n {11}the file cannot be read: holds binary data \(a null byte\); a UTF-16 file needs its byte order mark; save the file again as UTF-8; nothing in it is checked/);
  assert.match(bin.out, /input: runbook r\.csv \(CSV, not read, 0 steps\)/);
  assert.doesNotMatch(bin.out, /(?:ERROR|WARNING) +(?:missing-phase|missing-application-field)/, 'nothing is reported of a file that was not read');
  const app = await run({ 'r.csv': csvRunbook(), 'a.json': Buffer.from([0x7b, 0xe9, 0x7d]) }, ['r.csv', '--app', 'a.json']);
  assert.equal(app.code, 1);
  assert.match(app.out, /a\.json:1\n {11}the file cannot be read: is not valid UTF-8/);
  assert.doesNotMatch(app.out, /(?:ERROR|WARNING) +(?:missing-application-field|missing-data-owner|no-communication-plan)/, 'the fields of an application file that was not read are not reported as missing');
  const bad = await run({ 'r.csv': csvRunbook(), 'a.json': '{"name": 1' }, ['r.csv', '--app', 'a.json']);
  assert.match(bad.out, /ERROR {4}unparsable-file +a\.json:1\n {11}line 1, column 11: a comma or a closing brace was expected; nothing in the file is read/);
  const big = await run(CLEAN, ARGS, { maxFileBytes: 10 });
  assert.match(big.out, /r\.json:1\n {11}the file cannot be read: [\d,]+ bytes is over the 10 byte limit/);
});

test('cli: --help, --version and --print-defaults', async () => {
  const help = await cli(['--help'], '.');
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const s of ['--app', '--config', '--fail-on', '--min-severity', '--format', 'github', 'csv', 'no-go-gate (rules.noGoGate)', 'invalid-field (always error)', 'Exit codes: 0 no finding at or above the fail-on level']) assert.ok(USAGE.includes(s), s);
  const version = await cli(['--version'], '.');
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const defaults = await cli(['--print-defaults'], '.');
  assert.equal(defaults.code, 0);
  assert.deepEqual(Object.keys(JSON.parse(defaults.out)), ['name', 'rules', 'requiredPhases', 'windowPhases', 'phaseAliases', 'minSeverity', 'failOn']);
});

test('text: the phases, the critical path, the steps, the findings with the fix, and --explain', () => {
  const r = checkOf(stepsWith({ G1: { gate: false }, P1: { phase: 'warm-up' } }));
  const out = toText(r);
  assert.ok(out.includes('Phases (8)\n\n  phase         steps  minutes  window  required\n  prepare       0      0        no      no\n'));
  assert.ok(out.includes('  (unknown)     1      10       no      no\n'));
  assert.ok(out.includes('Critical path (6 steps, 80 minutes)\n\n  step  phase         minutes  action\n  F1    freeze        5        Do F1\n'));
  assert.ok(out.includes('  P1    (warm-up)     10       -     -           -         Ops team  '));
  assert.ok(out.includes('  S1    switch        10       -     G1          R1        Ops team  '));
  assert.match(out, /\n {2}ERROR {4}no-go-gate {17}runbook\.json:\d+\n {11}the switch step "S1" starts the switch phase/);
  assert.ok(out.includes(NOTICE));
  assert.ok(!out.includes('basis:'));
  const explained = toText(r, { explain: true });
  assert.match(explained, /\n {11}rule: a first switch step with no go\/no-go gate among the steps it depends on, directly or through others\n {11}basis: stakeholders approve the plan .+ \(Plan your migration \(Microsoft Cloud Adoption Framework\), https:\/\/learn\.microsoft\.com\/en-us\/azure\/cloud-adoption-framework\/migrate\/plan-migration\)\n/);
  assert.match(explained, /the tool's own choice: a switch step that depends on no other switch step starts the switch phase/);
  const none = toText(checkOf([], null));
  assert.match(none, /Critical path \(0 steps, 0 minutes\)\n\n {2}none\n\nSteps \(0\)\n\n {2}none\n/);
  assert.match(none, /application: none\n/);
  assert.match(none, /note: the runbook holds no step/);
});

test('json: the whole report, without the sources unless --explain', () => {
  const r = checkOf(stepsWith({ P1: { owner: '' } }));
  const out = JSON.parse(toJson(r));
  assert.deepEqual(Object.keys(out), ['tool', 'version', 'input', 'config', 'application', 'summary', 'steps', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.deepEqual(Object.keys(out.findings[0]), ['rule', 'level', 'file', 'line', 'column', 'at', 'step', 'phase', 'found', 'fix']);
  assert.deepEqual(Object.keys(out.summary), ['phases', 'criticalPath', 'totals']);
  assert.deepEqual(Object.keys(out.steps[0]), ['id', 'phase', 'phaseText', 'action', 'owner', 'dependsOn', 'durationMinutes', 'gate', 'verification', 'rollbackStep', 'file', 'line', 'column', 'at', 'findings']);
  assert.deepEqual(out.steps[0].findings, ['warning missing-owner']);
  assert.deepEqual(Object.keys(out.application), ['name', 'strategy', 'strategyText', 'downtimeWindowMinutes', 'dataOwner', 'businessSignOff', 'communicationPlan', 'file', 'line', 'at']);
  const explained = JSON.parse(toJson(r, { explain: true }));
  assert.ok(explained.findings[0].basis.length > 0);
  assert.deepEqual(out.result, { pass: true, failOn: 'error', failing: 0, byLevel: { error: 0, warning: 1, info: 0 }, text: 'PASS - no finding at or above error (1 warning)' });
  assert.equal(out.tool, 'cutover-runbook-check');
});

test('csv: one row per finding, with its place, step and phase', () => {
  const r = checkOf(stepsWith({ P1: { owner: '', id: '=P1' }, S1: { rollbackStep: undefined } }), APP);
  const rows = toCsv(r).split('\r\n');
  assert.equal(rows[0], CSV_COLUMNS.join(','));
  assert.equal(rows[0], 'level,rule,file,line,column,step,phase,found,fix');
  assert.ok(rows.some((x) => x.startsWith(`error,invalid-field,runbook.json,${lineOf(jsonRunbook({ steps: stepsWith({ P1: { owner: '', id: '=P1' } }) }), '"=P1"')},`)));
  assert.ok(rows.some((x) => x.startsWith('error,change-without-rollback,runbook.json,') && x.includes(',S1,switch,"the switch step ""S1"" changes something and names no rollback step",')), 'a field with a double quote is quoted, the quote written twice');
  assert.ok(rows.some((x) => x.includes(",'=P1,prepare,")), 'a leading = is not a formula');
  assert.equal(rows.at(-1), '');
  assert.equal(csvField('a,"b"'), '"a,""b"""');
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField(null), '');
  assert.equal(csvField(3), '3');
  assert.equal(toCsv(checkOf()), 'level,rule,file,line,column,step,phase,found,fix\r\n');
});

test('github: one workflow command per finding, with its properties and message escaped, then a summary line', () => {
  const text = jsonRunbook({ steps: stepsWith({ P1: { owner: '' } }) });
  const r = checkOf(stepsWith({ P1: { owner: '' } }));
  const lines = toGithub(r).trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], `::warning file=runbook.json,line=${lineOf(text, '"owner": ""')},col=${columnOf(text, '""')},title=cutover-runbook-check missing-owner::the step "P1" has no owner; fix: name the person or team who runs the step and answers for it`);
  assert.equal(lines[1], 'cutover-runbook-check: 9 steps, critical path 80 minutes, downtime window 120 minutes, 1 finding; RESULT: PASS - no finding at or above error (1 warning)');
  assert.match(toGithub(checkOf(stepsWith({ G1: { gate: false } }))), /^::error file=runbook\.json,line=\d+,col=\d+,title=cutover-runbook-check no-go-gate::/);
  assert.match(toGithub(checkOf(STEPS, APP, { rules: { missingOwner: 'info' } })), /^cutover-runbook-check: 9 steps/);
  assert.match(toGithub(checkOf(stepsWith({ P1: { owner: '' } }), APP, { rules: { missingOwner: 'info' } })), /^::notice file=runbook\.json/);
  assert.equal(escapeData('a%\r\nb'), 'a%25%0D%0Ab');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
});

test('cli: a run writes nothing to disk', async () => {
  await withFiles(CSV, async (dir) => {
    const before = await readdir(resolve(dir), { recursive: true });
    for (const format of ['text', 'json', 'csv', 'github']) assert.equal((await cli(['r.csv', '--app', 'app.json', '--format', format], dir)).code, 0);
    assert.deepEqual(await readdir(resolve(dir), { recursive: true }), before);
  });
});
