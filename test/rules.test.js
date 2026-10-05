import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, atOrAbove, decide, phaseSummary, ruleById } from '../src/index.js';
import { APP, STEPS, appFile, checkOf, configOf, csvRunbook, findingsOf, jsonRunbook, lineOf, reportOf, sortedRules, stepOf, stepsWith } from './helpers.js';

// Every rule on a runbook built inline, with the form that is reported and the form next to it that is not.

const rulesOf = (steps, app = APP, config = null) => sortedRules(checkOf(steps, app, config));
const foundOf = (r, rule) => findingsOf(r, rule).map((f) => f.found);

test('rules: the good runbook has no finding, and its summary adds up', () => {
  const r = checkOf();
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.summary.totals, { steps: 9, phases: 7, minutes: 105, criticalPath: 80, window: 120, rollback: 15, left: 40, cycles: 0, cycleDependencies: 0 });
  assert.deepEqual(r.summary.criticalPath.steps.map((s) => s.id), ['F1', 'B1', 'M1', 'G1', 'S1', 'V1']);
  assert.equal(r.result.pass, true);
});

test('rules: missing-phase for each required phase with no step, and the required phases of the configuration', () => {
  const r = checkOf(stepsWith({ V1: null, G1: { phase: 'freeze' } }));
  assert.deepEqual(foundOf(r, 'missing-phase'), ['the runbook has no step in the verify phase, which is required (backup, switch, verify and rollback)']);
  assert.equal(findingsOf(r, 'missing-phase')[0].line, lineOf(jsonRunbook(), '"steps"'));
  assert.deepEqual(rulesOf(stepsWith({ V1: null }), APP), [], 'one verify step is enough');
  assert.deepEqual(rulesOf(STEPS, APP, { requiredPhases: ['hypercare', 'post-cutover'] }), ['missing-phase']);
  assert.deepEqual(rulesOf(stepsWith({ B1: null, M1: { dependsOn: ['F1'] } }), APP, { requiredPhases: [], rules: { noBackupBeforeMigrate: 'off' } }), []);
  const csvAt = reportOf({ csv: csvRunbook(stepsWith({ R1: null, R2: null, S1: { rollbackStep: '' }, M1: { rollbackStep: '' } })), app: appFile() });
  assert.deepEqual(findingsOf(csvAt, 'missing-phase').map((f) => [f.file, f.line]), [['runbook.csv', 1]]);
});

test('rules: change-without-rollback for no rollback step, an unknown one and one outside the rollback phase', () => {
  const r = checkOf(stepsWith({ M1: { rollbackStep: undefined }, S1: { rollbackStep: 'R9' } }, [{ id: 'S2', phase: 'switch', action: 'x', owner: 'o', dependsOn: ['S1'], durationMinutes: 1, verification: 'v', rollbackStep: 'V1' }]));
  assert.deepEqual(foundOf(r, 'change-without-rollback'), ['the migrate-data step "M1" changes something and names no rollback step', 'the switch step "S1" names the rollback step "R9", which is not in the runbook', 'the switch step "S2" names "V1" as its rollback step, but "V1" is a verify step, not a step of the rollback phase']);
  assert.equal(findingsOf(r, 'change-without-rollback')[1].line, lineOf(jsonRunbook({ steps: stepsWith({ M1: { rollbackStep: undefined }, S1: { rollbackStep: 'R9' } }) }), '"R9"'));
  assert.deepEqual(rulesOf(stepsWith({ V1: { rollbackStep: undefined } })), [], 'a verify step needs no rollback step');
  assert.deepEqual(rulesOf(stepsWith({ S1: { rollbackStep: 'R2' } })), [], 'any step of the rollback phase will do');
});

test('rules: no-backup-before-migrate in dependency order, not in the order of the rows', () => {
  const r = checkOf(stepsWith({ M1: { dependsOn: ['F1'] } }));
  assert.deepEqual(foundOf(r, 'no-backup-before-migrate'), ['the migrate-data step "M1" is a first data move, and no backup step comes before it: none of the 2 steps it depends on, directly or through others, is in the backup phase']);
  assert.deepEqual(foundOf(checkOf(stepsWith({ M1: { dependsOn: [] } }), APP, { rules: { noGoGate: 'off' } }), 'no-backup-before-migrate'), ['the migrate-data step "M1" is a first data move, and no backup step comes before it: it depends on no step']);
  const moved = [STEPS[0], STEPS[1], STEPS[3], STEPS[2], ...STEPS.slice(4)];
  assert.deepEqual(rulesOf(moved), [], 'the backup row after the data move row is still before it in dependency order');
  const second = stepsWith({}, [{ id: 'M2', phase: 'migrate-data', action: 'x', owner: 'o', dependsOn: ['M1'], durationMinutes: 1, verification: 'v', rollbackStep: 'R2' }]);
  assert.deepEqual(rulesOf(second), [], 'a later data move is covered by the backup before the first');
  const indirect = stepsWith({ B1: { dependsOn: ['P1'] }, F1: { dependsOn: ['B1'] }, M1: { dependsOn: ['F1'] } });
  assert.deepEqual(rulesOf(indirect), [], 'a backup reached through another step counts');
});

test('rules: missing-owner and missing-verification for empty or blank values', () => {
  const r = checkOf(stepsWith({ P1: { owner: '  ' }, F1: { verification: undefined }, B1: { owner: null, verification: '' } }));
  assert.deepEqual(r.findings.map((f) => [f.rule, f.step]), [['missing-owner', 'P1'], ['missing-verification', 'F1'], ['missing-owner', 'B1'], ['missing-verification', 'B1']]);
  assert.deepEqual(foundOf(r, 'missing-owner')[0], 'the step "P1" has no owner');
  assert.deepEqual(foundOf(r, 'missing-verification')[0], 'the step "F1" does not say how its success is checked');
  assert.deepEqual(rulesOf(stepsWith({ P1: { owner: 'x' } })), []);
});

test('rules: no-go-gate when no gate is among the steps the first switch depends on', () => {
  const r = checkOf(stepsWith({ G1: { gate: false } }));
  assert.deepEqual(foundOf(r, 'no-go-gate'), ['the switch step "S1" starts the switch phase, and no go/no-go gate comes before it: none of the 5 steps it depends on, directly or through others, is a gate']);
  const beside = stepsWith({ G1: { gate: false } }, [{ id: 'G2', phase: 'verify', action: 'x', owner: 'o', dependsOn: ['B1'], durationMinutes: 1, gate: true, verification: 'v' }]);
  assert.deepEqual(rulesOf(beside), ['no-go-gate'], 'a gate the switch does not depend on does not count');
  assert.deepEqual(rulesOf(stepsWith({ G1: { gate: false }, P1: { gate: true } })), [], 'a gate far back in the chain counts');
  assert.deepEqual(rulesOf(stepsWith({ G1: { gate: false }, S1: { gate: true } })), ['no-go-gate'], 'the switch step itself is not before the switch');
  const second = stepsWith({}, [{ id: 'S2', phase: 'switch', action: 'x', owner: 'o', dependsOn: ['S1'], durationMinutes: 1, verification: 'v', rollbackStep: 'R1' }]);
  assert.deepEqual(rulesOf(second), [], 'a later switch step is covered by the gate before the first');
});

test('rules: unknown-dependency, per step with every unknown id, and exact letter case', () => {
  const r = checkOf(stepsWith({ V1: { dependsOn: ['S1', 's1', 'X9'] } }));
  assert.deepEqual(foundOf(r, 'unknown-dependency'), ['the step "V1" depends on "s1" and "X9", which are not in the runbook']);
  assert.equal(findingsOf(r, 'unknown-dependency')[0].step, 'V1');
  const dup = checkOf(stepsWith({}, [{ id: 'V1', phase: 'verify', action: 'x', owner: 'o', dependsOn: ['Q1'], durationMinutes: 1, verification: 'v' }]));
  assert.deepEqual(foundOf(dup, 'unknown-dependency'), ['the step "V1" depends on "Q1", which is not in the runbook'], 'the later step with a duplicate id is still checked');
});

test('rules: dependency-cycle, once per cycle, with the way round it, and a step that depends on itself', () => {
  const r = checkOf(stepsWith({ P1: { dependsOn: ['V1'] }, R2: { dependsOn: ['R2'] } }));
  assert.deepEqual(foundOf(r, 'dependency-cycle'), ['the steps "P1", "F1", "B1", "M1", "G1", "S1" and "V1" depend on each other in a cycle (P1 -> V1 -> S1 -> G1 -> M1 -> B1 -> F1 -> P1), so no order can run them', 'the step "R2" depends on itself']);
  assert.deepEqual(r.notes, ['8 dependencies inside cycles are left out of the critical path']);
  assert.equal(r.summary.totals.criticalPath, 30, 'with the cycle broken, the longest single weight is left');
  assert.deepEqual(rulesOf(stepsWith({ P1: { dependsOn: [] } })), []);
});

test('rules: duplicate-id for each later step with an id', () => {
  const extra = (n) => ({ id: 'F1', phase: 'freeze', action: `again ${n}`, owner: 'o', dependsOn: ['P1'], durationMinutes: 1, verification: 'v' });
  const steps = stepsWith({}, [extra(1), extra(2)]);
  const r = checkOf(steps);
  const first = lineOf(jsonRunbook({ steps }), '"id": "F1"') - 1;
  assert.deepEqual(foundOf(r, 'duplicate-id'), [1, 2].map(() => `the step id "F1" is used again; the step at runbook.json:${first} has it first, and only that one is used for the dependencies`));
  assert.deepEqual(findingsOf(r, 'duplicate-id').map((f) => f.line), [2, 3].map((n) => lineOf(jsonRunbook({ steps }), '"id": "F1"', n)));
  assert.equal(r.findings.length, 2);
  assert.deepEqual(rulesOf(stepsWith({}, [{ ...extra(1), id: 'f1' }])), [], 'ids are compared with their letter case');
});

test('rules: critical-path-over-window with both numbers, only the window phases counting', () => {
  const r = checkOf(STEPS, { ...APP, downtimeWindowMinutes: 79 });
  assert.deepEqual(foundOf(r, 'critical-path-over-window'), ['the critical path takes 80 minutes, 1 more than the downtime window of 79 minutes: F1 5, B1 20, M1 30, G1 5, S1 10, V1 10']);
  assert.equal(findingsOf(r, 'critical-path-over-window')[0].step, 'V1');
  assert.deepEqual(rulesOf(STEPS, { ...APP, downtimeWindowMinutes: 80 }), ['rollback-over-window'], 'a path that fills the window exactly fits, and leaves no time to roll back');
  assert.deepEqual(rulesOf(stepsWith({ P1: { durationMinutes: 500 } }, [{ id: 'H1', phase: 'hypercare', action: 'x', owner: 'o', dependsOn: ['V1'], durationMinutes: 900, verification: 'v' }])), [], 'preparation and hypercare add nothing');
  assert.deepEqual(rulesOf(STEPS, { ...APP, downtimeWindowMinutes: 40 }, { windowPhases: ['switch', 'verify'] }), [], 'with only switch and verify in the window, the path is 25 minutes and the rollback fits');
  assert.equal(checkOf(STEPS, APP, { windowPhases: ['switch', 'verify'] }).summary.totals.criticalPath, 25);
  const side = stepsWith({}, [{ id: 'X1', phase: 'freeze', action: 'x', owner: 'o', dependsOn: [], durationMinutes: 70, verification: 'v' }]);
  assert.equal(checkOf(side).summary.totals.criticalPath, 80, 'a step beside the chain does not add to it');
});

test('rules: rollback-over-window when the rollback steps do not fit what is left', () => {
  const r = checkOf(STEPS, { ...APP, downtimeWindowMinutes: 94 });
  assert.deepEqual(foundOf(r, 'rollback-over-window'), ['the 2 rollback steps take 15 minutes in all, more than the 14 minutes left of the downtime window of 94 minutes after the critical path of 80 minutes']);
  assert.deepEqual(rulesOf(STEPS, { ...APP, downtimeWindowMinutes: 95 }), []);
  assert.deepEqual(rulesOf(STEPS, { ...APP, downtimeWindowMinutes: undefined }), ['missing-application-field'], 'with no window, neither is compared');
  assert.deepEqual(rulesOf(stepsWith({ R1: { durationMinutes: 0 }, R2: { durationMinutes: 0 } }), { ...APP, downtimeWindowMinutes: 80 }), [], 'a rollback of no minutes fits in none');
});

test('rules: strategy-mismatch for a retired application that moves data and a retained one that switches', () => {
  assert.deepEqual(foundOf(checkOf(STEPS, { ...APP, strategy: 'Decommission' }), 'strategy-mismatch'), ['the strategy is retire (given as "Decommission"), but the runbook moves data in 1 migrate-data step; a retired application is shut down, not moved']);
  assert.deepEqual(foundOf(checkOf(STEPS, { ...APP, strategy: 'retain' }), 'strategy-mismatch'), ['the strategy is retain, but the runbook moves users or traffic in 1 switch step; a retained application stays where it is']);
  assert.deepEqual(rulesOf(stepsWith({ M1: null, S1: { dependsOn: ['G1'] }, G1: { dependsOn: ['B1'] } }), { ...APP, strategy: 'retire' }), [], 'a retired application may freeze, back up and switch off');
  for (const s of ['rehost', 'replatform', 'refactor', 'repurchase', 'relocate']) assert.deepEqual(rulesOf(STEPS, { ...APP, strategy: s }), [], s);
});

test('rules: the application fields, from the header, an application file or neither', () => {
  const r = checkOf(STEPS, { name: 'A' });
  assert.deepEqual(r.findings.map((f) => [f.rule, f.found]), [
    ['missing-application-field', 'the application has no migration strategy'],
    ['missing-application-field', 'the application has no downtime window, so the critical path is not compared with a window'],
    ['missing-business-sign-off', 'no business sign-off is named for the application'],
    ['missing-data-owner', 'no data owner is named for the application'],
    ['no-communication-plan', 'no communication plan is named for the application']
  ]);
  assert.deepEqual(sortedRules(checkOf(STEPS, null)), ['missing-application-field', 'missing-application-field', 'missing-application-field', 'missing-business-sign-off', 'missing-data-owner', 'no-communication-plan']);
  assert.match(foundOf(checkOf(STEPS, null), 'missing-data-owner')[0], /\(the runbook has no application header\)$/);
  const csvOnly = reportOf({ csv: csvRunbook() });
  assert.match(foundOf(csvOnly, 'missing-data-owner')[0], /\(no application file was given with --app\)$/);
  assert.deepEqual(findingsOf(csvOnly, 'missing-data-owner').map((f) => [f.file, f.line]), [['runbook.csv', 1]]);
  const file = appFile({ ...APP, communicationPlan: 'no', dataOwner: '' });
  const withFile = reportOf({ csv: csvRunbook(), app: file });
  assert.deepEqual(withFile.findings.map((f) => [f.rule, f.file, f.line]), [['missing-data-owner', 'app.json', lineOf(file, '"dataOwner"')], ['no-communication-plan', 'app.json', lineOf(file, '"communicationPlan"')]]);
  assert.deepEqual(sortedRules(checkOf(STEPS, { ...APP, strategy: 'lift', communicationPlan: 'soon' })), ['invalid-field', 'invalid-field'], 'a value that cannot be read is not also missing');
});

test('rules: the levels of the configuration, off, and the input rules that are always errors', () => {
  const r = checkOf(stepsWith({ P1: { owner: '' } }), APP, { rules: { missingOwner: 'error' } });
  assert.deepEqual(r.findings.map((f) => f.level), ['error']);
  assert.equal(r.result.pass, false);
  const off = checkOf(stepsWith({ P1: { owner: '' } }), APP, { rules: { missingOwner: 'off' } });
  assert.deepEqual(off.findings, []);
  assert.deepEqual(off.notes, ['1 rule is off: missing-owner']);
  assert.ok(RULES.filter((x) => x.key === null).every((x) => ['invalid-field', 'unreadable-file', 'unparsable-file'].includes(x.id)));
  const bad = checkOf(stepsWith({ P1: { durationMinutes: 'soon' } }), APP, { minSeverity: 'error' });
  assert.deepEqual(bad.findings.map((f) => [f.rule, f.level]), [['invalid-field', 'error']]);
});

test('rules: the summary of the phases, and the result', () => {
  const rows = phaseSummary(stepsWith({}, [{ id: 'X', phase: null, duration: 7 }]).map((s) => ({ ...s, duration: s.durationMinutes ?? s.duration })), configOf());
  assert.deepEqual(rows.map((p) => [p.phase, p.steps, p.minutes, p.inWindow, p.required]), [['prepare', 1, 10, false, false], ['freeze', 1, 5, true, false], ['backup', 1, 20, true, true], ['migrate-data', 1, 30, true, false], ['switch', 1, 10, true, true], ['verify', 2, 15, true, true], ['rollback', 2, 15, false, true], ['hypercare', 0, 0, false, false], [null, 1, 7, false, false]]);
  assert.equal(ruleById('no-go-gate').key, 'noGoGate');
  assert.ok(atOrAbove('error', 'warning'));
  assert.ok(!atOrAbove('info', 'warning'));
  assert.deepEqual(decide([{ level: 'warning' }, { level: 'info' }], 'warning'), { pass: false, failOn: 'warning', failing: 1, byLevel: { error: 0, warning: 1, info: 1 }, text: 'FAIL - 1 finding at or above warning (1 warning, 1 info)' });
  assert.equal(decide([], 'error').text, 'PASS - no finding at or above error');
  assert.equal(stepOf(checkOf(), 'S1').rollbackStep, 'R1');
});
