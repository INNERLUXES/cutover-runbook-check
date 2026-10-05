// A run: read the configuration, the runbook and the application file, check them, and build the report of the run. A
// path on the command line that cannot be used (missing, a link, a folder, a file of no kind the tool reads), a
// configuration with a problem, or an application file given with a JSON runbook stops the run with an InputError and
// no result. A runbook or application file that cannot be read, or that the reader refuses, is an error finding of its
// own, so the run fails at the default level and never passes because a part of the input was passed over.

import { ConfigError, defaultConfig, readConfig } from './config.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { FILE_LIMITS, inspectPath, readText, readTextFile } from './files.js';
import { fileKind } from './kinds.js';
import { checkRunbook } from './review.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { readApplicationFile, readRunbookCsv, readRunbookJson } from './runbook.js';
import { grouped, plural } from './size.js';
import { safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS, maxFindingsPerRule: 500 };
export const MAX_PROBLEMS = 20;

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A copy of a value with every text in it cleaned by safeText, for the parts of the report that come from the input.
export function cleanTexts(value) {
  if (typeof value === 'string') return safeText(value, 300);
  if (Array.isArray(value)) return value.map(cleanTexts);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanTexts(v)]));
  return value;
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

// The level of a rule under a configuration: the rules of input problems are always errors.
export function levelOf(rule, config) {
  return rule.key === null ? 'error' : config.rules[rule.key];
}

// A file that could not be read: no step, and an unreadable-file finding.
export function unreadableFile(file, kind, reason) {
  const at = { line: 1, column: 1 };
  return { file, kind, read: false, parsed: false, steps: [], application: null, stepsAt: at, problems: [{ rule: 'unreadable-file', file, line: 1, column: 1, step: '', phase: null, stepAt: '', found: `the file cannot be read: ${reason}; nothing in it is checked` }] };
}

// A step as the report shows it: the fields a reader needs, every text cleaned.
function shownStep(s, file, findings) {
  return cleanTexts({
    id: s.shownId,
    phase: s.phase,
    phaseText: s.phaseText,
    action: s.action,
    owner: s.owner,
    dependsOn: s.dependsOn,
    durationMinutes: s.duration,
    gate: s.gate,
    verification: s.verification,
    rollbackStep: s.rollbackStep,
    file,
    line: s.line,
    column: s.column,
    at: `${file}:${s.line}`,
    findings
  });
}

// The application as the report shows it.
function shownApplication(a) {
  if (!a) return null;
  return cleanTexts({ name: a.name, strategy: a.strategy, strategyText: a.strategyText, downtimeWindowMinutes: a.window, dataOwner: a.dataOwner, businessSignOff: a.businessSignOff, communicationPlan: a.communicationPlan, file: a.file, line: a.line, at: `${a.file}:${a.line}` });
}

// The run as a report object, from the runbook and the application that were read, and the configuration.
export function buildReport({ runbook, application = null, applicationFile = null, config, minSeverity, failOn, version, limits = LIMITS }) {
  const app = application ? application.application : runbook.application;
  const { findings: checked, summary } = checkRunbook(runbook, app, config, { applicationUnread: Boolean(applicationFile && !application?.application) });
  const raw = [...runbook.problems, ...(application ? application.problems : []), ...checked];
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const files = [runbook.file, ...(applicationFile ? [applicationFile.file] : [])];
  const fileOrder = (f) => files.indexOf(f);
  const level = (id) => levelOf(RULES.find((r) => r.id === id), config);
  const order = (a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || fileOrder(a.file) - fileOrder(b.file) || a.line - b.line || a.column - b.column || ruleOrder.get(a.rule) - ruleOrder.get(b.rule);
  const all = raw.filter((f) => level(f.rule) !== 'off').map((f) => ({ ...f, level: level(f.rule) })).sort(order);
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) cut += 1;
    else {
      const rule = RULES.find((r) => r.id === f.rule);
      const file = safeText(f.file);
      findings.push({
        rule: f.rule,
        level: f.level,
        file,
        line: f.line,
        column: f.column,
        at: `${file}:${f.line}`,
        step: safeText(f.step, 64),
        phase: f.phase,
        found: safeText(f.found, 800),
        fix: rule.fix,
        basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })),
        own: rule.own
      });
    }
  }
  // The result counts every finding at or above the minimum severity, including the ones past the limit of a rule.
  const result = decide(shown, failOn);
  const notes = [];
  if (runbook.parsed && !runbook.steps.length) notes.push('the runbook holds no step');
  if (summary.totals.cycleDependencies) notes.push(`${plural(summary.totals.cycleDependencies, 'dependency', 'dependencies')} inside ${summary.totals.cycles === 1 ? 'a cycle' : 'cycles'} ${summary.totals.cycleDependencies === 1 ? 'is' : 'are'} left out of the critical path`);
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown`);
  const off = RULES.filter((r) => r.key !== null && levelOf(r, config) === 'off');
  if (off.length) notes.push(`${plural(off.length, 'rule')} ${off.length === 1 ? 'is' : 'are'} off: ${off.map((r) => r.id).join(', ')}`);
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  const owned = new Map();
  for (const f of shown) {
    if (f.file !== runbook.file || !f.stepAt) continue;
    owned.set(f.stepAt, [...(owned.get(f.stepAt) ?? []), `${f.level} ${f.rule}`]);
  }
  const fileInfo = (r, kind) => ({ file: safeText(r.file), kind, read: r.read, encoding: r.encoding ?? null });
  return {
    tool: 'cutover-runbook-check',
    version,
    input: {
      runbook: { ...fileInfo(runbook, runbook.kind), steps: runbook.steps.length },
      application: applicationFile ? fileInfo(applicationFile, 'json') : null
    },
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      requiredPhases: config.requiredPhases,
      windowPhases: config.windowPhases,
      phaseAliases: cleanTexts(config.phaseAliases),
      minSeverity,
      failOn,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: levelOf(r, config), rule: safeText(r.rule(config), 600) }))
    },
    application: shownApplication(app),
    summary: cleanTexts(summary),
    steps: runbook.steps.map((s) => shownStep(s, runbook.file, owned.get(`${s.line}:${s.column}`) ?? [])),
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut },
    result,
    notes: notes.map((n) => safeText(n, 600)),
    notice: NOTICE
  };
}

// Reads one runbook file, or gives the unreadable file.
async function readRunbook(g, kind, config, limits) {
  let read;
  try {
    read = await readText(g.full, g.shown, limits.maxFileBytes);
  } catch (error) {
    return unreadableFile(g.shown, kind, error.reason ?? error.message);
  }
  const r = kind === 'csv' ? readRunbookCsv(read.text, g.shown, config) : readRunbookJson(read.text, g.shown, config);
  return { ...r, encoding: read.encoding };
}

// Reads the configuration, the runbook and the application file named and checks them: the report object of the run.
export async function checkPaths({ runbook: runbookPath, app: appPath = null, config: configPath = null, minSeverity = null, failOn = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  let config;
  try {
    if (configPath) {
      const c = await readTextFile(configPath, base, limits.maxConfigBytes);
      config = readConfig(c.text, c.file);
    } else config = defaultConfig();
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  const problems = [];
  let g = null;
  let a = null;
  try {
    g = await inspectPath(runbookPath, base);
    if (fileKind(g.shown) === null) problems.push(`${g.shown}: not a kind of file the tool reads (a runbook whose name ends in .json or .csv)`);
  } catch (error) {
    problems.push(error.message);
  }
  if (appPath !== null) {
    try {
      a = await inspectPath(appPath, base);
      if (fileKind(a.shown) !== 'json') problems.push(`${a.shown}: an application file is JSON, and its name ends in .json`);
      else if (g && a.full === g.full) problems.push(`${a.shown}: is the runbook itself; give the application file`);
    } catch (error) {
      problems.push(error.message);
    }
    if (g && fileKind(g.shown) === 'json') problems.push(`${g.shown}: a JSON runbook holds its application in its header; --app is for a CSV runbook`);
  }
  if (problems.length) throw new InputError(capped(problems));
  const kind = fileKind(g.shown);
  const runbook = await readRunbook(g, kind, config, limits);
  let application = null;
  let applicationFile = null;
  if (a) {
    try {
      const read = await readText(a.full, a.shown, limits.maxConfigBytes);
      application = readApplicationFile(read.text, a.shown);
      applicationFile = { file: a.shown, read: true, encoding: read.encoding };
    } catch (error) {
      const u = unreadableFile(a.shown, 'json', error.reason ?? error.message);
      application = { application: null, problems: u.problems };
      applicationFile = { file: a.shown, read: false, encoding: null };
    }
  }
  return buildReport({ runbook, application, applicationFile, config, minSeverity: minSeverity ?? config.minSeverity, failOn: failOn ?? config.failOn, version, limits });
}
