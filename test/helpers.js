// Shared test helpers: runbooks built inline, checked in memory or written into a temporary folder that is removed after
// the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and Windows.
// The line a test expects is found with lineOf(), which counts lines the way the tool does, so a test never holds a line
// number worked out by hand for one system only. No test reads the clock, the time zone or the locale.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { buildReport, defaultConfig, lineStarts, main, positionOf, readApplicationFile, readConfig, readRunbookCsv, readRunbookJson } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'cutover-runbook-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// The column (from 1) of the n-th place where needle starts in text.
export const columnOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).column;

// The configuration of a configuration object, through the real reader, or the defaults.
export const configOf = (object = null) => (object === null ? defaultConfig() : readConfig(JSON.stringify(object), 'config.json'));

// A good step of every phase: the runbook every test changes. Its critical path is 80 minutes (F1 5, B1 20, M1 30,
// G1 5, S1 10, V1 10), its rollback 15, and the window of APP is 120.
const step = (id, phase, dependsOn, durationMinutes, more = {}) => ({ id, phase, action: `Do ${id}`, owner: 'Ops team', dependsOn, durationMinutes, gate: false, verification: `Check ${id}`, ...more });
export const STEPS = [
  step('P1', 'prepare', [], 10),
  step('F1', 'freeze', ['P1'], 5),
  step('B1', 'backup', ['F1'], 20),
  step('M1', 'migrate-data', ['B1'], 30, { rollbackStep: 'R2' }),
  step('G1', 'verify', ['M1'], 5, { gate: true }),
  step('S1', 'switch', ['G1'], 10, { rollbackStep: 'R1' }),
  step('V1', 'verify', ['S1'], 10),
  step('R1', 'rollback', ['S1'], 10),
  step('R2', 'rollback', ['R1'], 5)
];
export const APP = { name: 'Order Desk', strategy: 'rehost', downtimeWindowMinutes: 120, dataOwner: 'Sales Ops', businessSignOff: 'Head of Sales', communicationPlan: true };

// The steps with some changed: an object of id to the fields to change, or to null to take the step out; extra steps
// are added at the end.
export function stepsWith(changes = {}, extra = []) {
  return [...STEPS.filter((s) => changes[s.id] !== null).map((s) => ({ ...s, ...(changes[s.id] ?? {}) })), ...extra];
}

// A JSON runbook.
export const jsonRunbook = ({ application = APP, steps = STEPS } = {}) => `${JSON.stringify({ ...(application === undefined || application === null ? {} : { application }), steps }, null, 2)}\n`;

// A CSV runbook of the same steps, with the header given or the usual one.
export const HEADER = ['id', 'phase', 'action', 'owner', 'depends-on', 'duration', 'gate', 'verification', 'rollback'];
const csvCell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export function csvRunbook(steps = STEPS, header = HEADER) {
  const rows = steps.map((s) => [s.id, s.phase, s.action, s.owner, (s.dependsOn ?? []).join(';'), s.durationMinutes ?? '', s.gate ? 'yes' : 'no', s.verification, s.rollbackStep ?? ''].map((v) => csvCell(v ?? '')).join(','));
  return `${[header.join(','), ...rows].join('\n')}\n`;
}

// An application file.
export const appFile = (application = APP) => `${JSON.stringify(application, null, 2)}\n`;

// The report object of a runbook checked in memory: JSON text with its application, or CSV text with an application
// file or none.
export function reportOf({ json = null, csv = null, app = null }, config = null, { minSeverity = 'info', failOn = 'error' } = {}) {
  const cfg = configOf(config);
  const runbook = json !== null ? readRunbookJson(json, 'runbook.json', cfg) : readRunbookCsv(csv, 'runbook.csv', cfg);
  const application = app === null ? null : readApplicationFile(app, 'app.json');
  return buildReport({ runbook, application, applicationFile: app === null ? null : { file: 'app.json', read: true, encoding: 'utf-8' }, config: cfg, minSeverity, failOn, version: 'test' });
}

// The report of a JSON runbook of these steps and this application.
export const checkOf = (steps = STEPS, application = APP, config = null, options = {}) => reportOf({ json: jsonRunbook({ steps, application }) }, config, options);

// The findings of a report, of one rule or of all.
export const findingsOf = (r, rule) => r.findings.filter((f) => !rule || f.rule === rule);

// The rule ids of the findings of a report, sorted.
export const sortedRules = (r) => r.findings.map((f) => f.rule).sort();

// The step of a report with this id.
export const stepOf = (r, id) => r.steps.find((s) => s.id === id);

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = [], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}
