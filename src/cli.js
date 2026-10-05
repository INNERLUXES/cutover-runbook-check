// Command line: cutover-runbook-check <runbook.json | runbook.csv> [--app <file>] [--config <file>] [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkPaths } from './check.js';
import { defaultsAsConfig } from './config.js';
import { toCsv } from './csv.js';
import { LEVELS } from './data.js';
import { toGithub, toJson, toText } from './report.js';
import { RULES } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, json: toJson, csv: toCsv, github: toGithub };

export const USAGE = `Usage: cutover-runbook-check <runbook.json | runbook.csv> [--app <file>] [--config <file>] [options]

Checks the cutover runbook of one application, the checklist a team follows on migration day, for what is missing or
risky before the move. A runbook is JSON with an application header and a list of steps, or CSV with one record per
step and the application in a JSON file named with --app. Each step has an id, a phase (prepare, freeze, backup,
migrate-data, switch, verify, rollback or hypercare, or an alias of one), an action, an owner, the ids it depends on,
a duration in minutes, a go/no-go gate (yes or no), how its success is checked and, for a step that changes
something, its rollback step. It reports required phases with no step, change steps with no rollback step, no backup
before the first data move, steps with no owner or no check, no go/no-go gate before the switch, unknown
dependencies, cycles and duplicate ids, a critical path longer than the downtime window, a rollback that does not fit
what is left of it, a strategy that does not match the steps, and a missing business sign-off, data owner or
communication plan, with the minutes of each phase and the critical path. It reads no clock, opens no network
connection and writes nothing to disk.

Options:
  --app <file>              the application file of a CSV runbook: JSON with name, strategy, downtimeWindowMinutes,
                            dataOwner, businessSignOff and communicationPlan
  --config <file>           settings in strict JSON: rules, requiredPhases, windowPhases, phaseAliases, minSeverity
                            and failOn (--print-defaults shows them)
  --format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                            workflow commands that GitHub shows as annotations
  --json                    the same as --format json
  --min-severity <level>    the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: minSeverity of
                            the configuration, else info)
  --fail-on <level>         the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: failOn of
                            the configuration, else error)
  --explain                 show the rule, the public sources and the tool's own choice behind each finding
  --print-defaults          print the built-in configuration and exit
  --help                    show this text
  --version                 show the version

Rules: ${RULES.map((r) => `${r.id} (${r.key === null ? 'always error' : `rules.${r.key}`})`).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { runbook: null, app: null, config: null, format: null, json: false, minSeverity: null, failOn: null, explain: false, printDefaults: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--json') o.json = true;
    else if (a === '--print-defaults') o.printDefaults = true;
    else if (a === '--app') o.app = once(a, o.app, next());
    else if (a === '--config') o.config = once(a, o.config, next());
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else if (o.runbook !== null) throw new Error(`${a}: one runbook per run; check each runbook in its own run`);
    else o.runbook = a;
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!o.help && !o.version && !o.printDefaults) {
    if (o.runbook === null) throw new Error('give the runbook to check: a .json or .csv file, such as cutover-runbook-check runbook.csv --app application.json');
    for (const p of [o.runbook, ...(o.app === null ? [] : [o.app]), ...(o.config === null ? [] : [o.config])]) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, json, csv or github)`);
    for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${v} (${LEVELS.join(', ')})`);
    if (o.explain && (o.format === 'github' || o.format === 'csv')) throw new Error(`--explain adds the sources of each finding to the text and JSON reports; the ${o.format} format has no place for them`);
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`cutover-runbook-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.printDefaults) {
    io.out(`${JSON.stringify(defaultsAsConfig(), null, 2)}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkPaths({ runbook: o.runbook, app: o.app, config: o.config, minSeverity: o.minSeverity, failOn: o.failOn, version: VERSION, limits: { ...LIMITS, ...(limits ?? {}) }, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`cutover-runbook-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`cutover-runbook-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.result.pass ? 0 : 1;
}
