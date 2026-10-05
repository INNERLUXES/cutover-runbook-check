// The rules across the steps of a runbook and its application: the phases, the rollback steps, the backup before the
// first data move, the owners and checks, the go/no-go gate, the dependencies, the critical path against the downtime
// window, the rollback against what is left of it, the strategy, and the fields of the application. The findings it
// returns have no level yet; src/check.js gives each the level of its rule. It also builds the summary: the steps and
// minutes of each phase, the critical path and the totals.

import { ancestorsOf, buildGraph, cyclesOf, descendantsOf, longestPath } from './graph.js';
import { CHANGE_PHASES, PHASE_NAMES } from './phases.js';
import { grouped, listText, plural } from './size.js';

const q = (id) => `"${id}"`;
const phaseLabel = (p) => (p === null ? 'a step whose phase cannot be read' : `a ${p} step`);

// The summary of the phases: the steps and minutes of each phase, whether it counts toward the window and whether it is
// required, and a row for the steps whose phase could not be read.
export function phaseSummary(steps, config) {
  const rows = PHASE_NAMES.map((phase) => {
    const of = steps.filter((s) => s.phase === phase);
    return { phase, steps: of.length, minutes: of.reduce((n, s) => n + (s.duration ?? 0), 0), inWindow: config.windowPhases.includes(phase), required: config.requiredPhases.includes(phase) };
  });
  const unknown = steps.filter((s) => s.phase === null);
  if (unknown.length) rows.push({ phase: null, steps: unknown.length, minutes: unknown.reduce((n, s) => n + (s.duration ?? 0), 0), inWindow: false, required: false });
  return rows;
}

// Checks the steps and the application of a runbook: { findings, summary }. runbook is what src/runbook.js read;
// application is the application (from the header of a JSON runbook or from the application file), or null. When the
// application file was given but could not be read, its fields are not reported as missing: the file is a finding of
// its own.
export function checkRunbook(runbook, application, config, { applicationUnread = false } = {}) {
  const steps = runbook.steps;
  const file = runbook.file;
  const findings = [];
  const add = (rule, at, found, step = null) => findings.push({ rule, file: at.file ?? file, line: at.line, column: at.column, step: step ? step.shownId : '', phase: step ? step.phase : null, stepAt: step ? `${step.line}:${step.column}` : '', found });
  const stepAt = (s, key = null) => (key && s.places[key] ? s.places[key] : { line: s.line, column: s.column });
  const graph = buildGraph(steps);
  const nodeOf = (s) => (s.id !== '' && graph.nodes[graph.index.get(s.id)] === s ? graph.index.get(s.id) : -1);

  // Duplicate ids: every later step with the id of an earlier one.
  for (const s of steps) {
    if (s.id === '') continue;
    const first = graph.nodes[graph.index.get(s.id)];
    if (first !== s) add('duplicate-id', stepAt(s, 'id'), `the step id ${q(s.id)} is used again; the step at ${file}:${first.line} has it first, and only that one is used for the dependencies`, s);
  }

  // Required phases.
  if (runbook.parsed) {
    for (const phase of config.requiredPhases) {
      if (!steps.some((s) => s.phase === phase)) add('missing-phase', runbook.stepsAt, `the runbook has no step in the ${phase} phase, which is required (${listText(config.requiredPhases, 10)})`);
    }
  }

  // Owners and checks.
  for (const s of steps) {
    const who = s.shownId ? `the step ${q(s.shownId)}` : 'a step with no id';
    if (s.owner === '') add('missing-owner', stepAt(s, 'owner'), `${who} has no owner`, s);
    if (s.verification === '') add('missing-verification', stepAt(s, 'verification'), `${who} does not say how its success is checked`, s);
  }

  // Rollback steps of the change steps.
  const byId = new Map(graph.nodes.map((s) => [s.id, s]));
  for (const s of steps) {
    if (!CHANGE_PHASES.includes(s.phase)) continue;
    const who = `the ${s.phase} step ${s.shownId ? q(s.shownId) : 'with no id'}`;
    const at = stepAt(s, s.rollbackStep ? 'rollbackStep' : null);
    if (s.rollbackStep === '') add('change-without-rollback', at, `${who} changes something and names no rollback step`, s);
    else if (!byId.has(s.rollbackStep)) add('change-without-rollback', at, `${who} names the rollback step ${q(s.rollbackStep)}, which is not in the runbook`, s);
    else {
      const r = byId.get(s.rollbackStep);
      if (r.phase !== 'rollback') add('change-without-rollback', at, `${who} names ${q(r.id)} as its rollback step, but ${q(r.id)} is ${phaseLabel(r.phase)}, not a step of the rollback phase`, s);
    }
  }

  // Unknown dependencies.
  graph.nodes.forEach((s, i) => {
    const ids = graph.unknown[i];
    if (ids.length) add('unknown-dependency', stepAt(s, 'dependsOn'), `the step ${q(s.id)} depends on ${listText(ids.map(q), 10)}, which ${ids.length === 1 ? 'is' : 'are'} not in the runbook`, s);
  });
  // A later step with a duplicate id is not in the graph; its dependencies are still compared with the ids.
  for (const s of steps) {
    if (s.id === '' || nodeOf(s) !== -1) continue;
    const ids = s.dependsOn.filter((d) => !graph.index.has(d));
    if (ids.length) add('unknown-dependency', stepAt(s, 'dependsOn'), `the step ${q(s.id)} depends on ${listText(ids.map(q), 10)}, which ${ids.length === 1 ? 'is' : 'are'} not in the runbook`, s);
  }

  // Cycles.
  const cycles = cyclesOf(graph);
  for (const c of cycles) {
    const first = graph.nodes[c.nodes[0]];
    const names = c.nodes.map((v) => q(graph.nodes[v].id));
    const path = c.path.map((v) => graph.nodes[v].id).join(' -> ');
    add('dependency-cycle', stepAt(first, 'dependsOn'), c.nodes.length === 1 ? `the step ${q(first.id)} depends on itself` : `the steps ${listText(names, 10)} depend on each other in a cycle (${path}), so no order can run them`, first);
  }

  // The backup before the first data move, and the gate before the switch, in dependency order. A first data move or
  // switch is one that depends on no other step of its phase.
  const after = (test) => descendantsOf(graph, graph.nodes.flatMap((s, i) => (test(s) ? [i] : [])));
  const afterMove = after((s) => s.phase === 'migrate-data');
  const afterSwitch = after((s) => s.phase === 'switch');
  const afterBackup = after((s) => s.phase === 'backup');
  const afterGate = after((s) => s.gate);
  const before = (i) => {
    const set = ancestorsOf(graph, i);
    set.delete(i);
    return set.size;
  };
  graph.nodes.forEach((s, i) => {
    if (s.phase === 'migrate-data' && !afterMove.has(i) && !afterBackup.has(i)) {
      const n = before(i);
      add('no-backup-before-migrate', stepAt(s), `the migrate-data step ${q(s.id)} is a first data move, and no backup step comes before it: ${n ? `none of the ${plural(n, 'step')} it depends on, directly or through others, is in the backup phase` : 'it depends on no step'}`, s);
    }
    if (s.phase === 'switch' && !afterSwitch.has(i) && !afterGate.has(i)) {
      const n = before(i);
      add('no-go-gate', stepAt(s), `the switch step ${q(s.id)} starts the switch phase, and no go/no-go gate comes before it: ${n ? `none of the ${plural(n, 'step')} it depends on, directly or through others, is a gate` : 'it depends on no step'}`, s);
    }
  });

  // The critical path, the window and the rollback.
  const counts = (s) => s.phase !== null && config.windowPhases.includes(s.phase);
  const path = longestPath(graph, (s) => (counts(s) ? s.duration ?? 0 : 0));
  const chain = path.chain.map((v) => graph.nodes[v]).filter(counts);
  const critical = path.weight;
  const rollbackSteps = steps.filter((s) => s.phase === 'rollback');
  const rollback = rollbackSteps.reduce((n, s) => n + (s.duration ?? 0), 0);
  const window = application ? application.window : null;
  const left = window === null ? null : Math.max(0, window - critical);
  if (window !== null && critical > window) {
    const last = chain[chain.length - 1];
    add('critical-path-over-window', stepAt(last), `the critical path takes ${grouped(critical)} minutes, ${grouped(critical - window)} more than the downtime window of ${grouped(window)} minutes: ${chain.map((s) => `${s.id} ${grouped(s.duration ?? 0)}`).join(', ')}`, last);
  }
  if (window !== null && rollback > left) {
    const firstRollback = rollbackSteps[0];
    add('rollback-over-window', stepAt(firstRollback), `the ${plural(rollbackSteps.length, 'rollback step')} take ${grouped(rollback)} minutes in all, more than the ${grouped(left)} ${left === 1 ? 'minute' : 'minutes'} left of the downtime window of ${grouped(window)} minutes after the critical path of ${grouped(critical)} minutes`, firstRollback);
  }

  // The application.
  const appAt = application ? { file: application.file, line: application.line, column: application.column } : { file, line: 1, column: 1 };
  const none = application ? '' : runbook.kind === 'csv' ? ' (no application file was given with --app)' : ' (the runbook has no application header)';
  const fieldAt = (key) => (application ? { file: application.file, ...application.places[key] } : appAt);
  const invalid = (key) => Boolean(application && application.invalid.has(key));
  if (runbook.parsed && !applicationUnread) {
    for (const [field, empty, label] of [['name', (application?.name ?? '') === '', 'name'], ['strategy', (application?.strategyText ?? '') === '', 'migration strategy'], ['downtimeWindowMinutes', (application?.window ?? null) === null, 'downtime window']]) {
      if (empty && !invalid(field)) add('missing-application-field', fieldAt(field), `the application has no ${label}${none}${field === 'downtimeWindowMinutes' ? ', so the critical path is not compared with a window' : ''}`);
    }
    if ((application?.businessSignOff ?? '') === '') add('missing-business-sign-off', fieldAt('businessSignOff'), `no business sign-off is named for the application${none}`);
    if ((application?.dataOwner ?? '') === '') add('missing-data-owner', fieldAt('dataOwner'), `no data owner is named for the application${none}`);
    if ((application?.communicationPlan ?? null) !== true && !invalid('communicationPlan')) add('no-communication-plan', fieldAt('communicationPlan'), application?.communicationPlan === false ? 'the communication plan of the application is no' : `no communication plan is named for the application${none}`);
  }
  if (application && application.strategy === 'retire') {
    const moves = steps.filter((s) => s.phase === 'migrate-data');
    if (moves.length) add('strategy-mismatch', stepAt(moves[0]), `the strategy is retire${application.strategyText && application.strategyText.toLowerCase() !== 'retire' ? ` (given as "${application.strategyText}")` : ''}, but the runbook moves data in ${plural(moves.length, 'migrate-data step')}; a retired application is shut down, not moved`, moves[0]);
  }
  if (application && application.strategy === 'retain') {
    const switches = steps.filter((s) => s.phase === 'switch');
    if (switches.length) add('strategy-mismatch', stepAt(switches[0]), `the strategy is retain${application.strategyText && application.strategyText.toLowerCase() !== 'retain' ? ` (given as "${application.strategyText}")` : ''}, but the runbook moves users or traffic in ${plural(switches.length, 'switch step')}; a retained application stays where it is`, switches[0]);
  }

  const cycleOf = new Map();
  cycles.forEach((c, k) => c.nodes.forEach((v) => cycleOf.set(v, k)));
  let inCycle = 0;
  for (const [v, k] of cycleOf) inCycle += graph.deps[v].filter((w) => cycleOf.get(w) === k).length;
  const phases = phaseSummary(steps, config);
  return {
    findings,
    summary: {
      phases,
      criticalPath: { minutes: critical, steps: chain.map((s) => ({ id: s.id, phase: s.phase, minutes: s.duration ?? 0, line: s.line, action: s.action })) },
      totals: { steps: steps.length, phases: phases.filter((p) => p.phase !== null && p.steps > 0).length, minutes: steps.reduce((n, s) => n + (s.duration ?? 0), 0), criticalPath: critical, window, rollback, left, cycles: cycles.length, cycleDependencies: inCycle }
    }
  };
}
