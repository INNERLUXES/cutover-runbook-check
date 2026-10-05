import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATION_FIELDS, ID_FORM, MAX_MINUTES, RUNBOOK_KEYS, RUNBOOK_LIMITS, STEP_FIELDS, readApplication, readApplicationFile, readRunbookCsv, readRunbookJson, readStep } from '../src/index.js';
import { APP, STEPS, appFile, columnOf, configOf, csvRunbook, jsonRunbook, lineOf } from './helpers.js';

// Reading a runbook: the columns of a CSV runbook and the keys of a JSON one, every field of a step and of the
// application with its good and bad values, and the files the readers refuse.

const cfg = configOf();
const csv = (text) => readRunbookCsv(text, 'r.csv', cfg);
const json = (text) => readRunbookJson(text, 'r.json', cfg);
const found = (r) => r.problems.map((p) => p.found);
const one = (raw) => {
  const problems = [];
  const s = readStep(raw, {}, { line: 7, column: 1 }, 'r.csv', cfg, problems);
  return { s, found: problems.map((p) => p.found) };
};

test('runbook: a CSV runbook with the usual columns gives the same steps as the JSON runbook', () => {
  const a = csv(csvRunbook());
  const b = json(jsonRunbook());
  assert.deepEqual(a.problems, []);
  assert.deepEqual(b.problems, []);
  const fields = (r) => r.steps.map((s) => [s.id, s.phase, s.action, s.owner, s.dependsOn, s.duration, s.gate, s.verification, s.rollbackStep]);
  assert.deepEqual(fields(a), fields(b));
  assert.equal(a.steps[3].rollbackStep, 'R2');
  assert.deepEqual(a.steps.map((s) => s.line), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(a.kind, 'csv');
  assert.equal(b.application.window, 120);
  assert.equal(b.steps[0].line, lineOf(jsonRunbook(), '"id": "P1"') - 1);
});

test('runbook: the other names of the columns are read, in any case and with any separators', () => {
  const header = ['Step ID', 'Stage', 'Task', 'Responsible', 'Predecessors', 'Duration (min)', 'Go/No-Go', 'Success check', 'Back-out'];
  const r = csv(csvRunbook(STEPS, header));
  assert.deepEqual(r.problems, []);
  assert.equal(r.steps[4].gate, true);
  assert.deepEqual(r.steps[5].dependsOn, ['G1']);
  for (const [key, forms] of Object.entries(STEP_FIELDS)) for (const f of forms) assert.match(f, /^[a-z]+$/, `${key}: ${f}`);
});

test('runbook: an unknown column, a column named twice and a record of another length are invalid fields; a header with no id or phase column is refused', () => {
  const text = 'id,phase,ownr,duration,owner,Owner\nA1,prepare,x,5,o,p\nA2,prepare,x,5\n';
  const r = csv(text);
  assert.deepEqual(found(r), ['the column "ownr" is not a column the tool reads; did you mean "owner"?; its values are not read', 'the column "Owner" names the field owner a second time; its values are not read', 'the record has 4 fields and the header line 6; the missing fields are read as empty']);
  assert.deepEqual(r.problems.map((p) => [p.line, p.column]), [[1, 10], [1, 30], [3, 1]]);
  assert.equal(r.steps[0].owner, 'o');
  const noId = csv('step name,phase\nx,prepare\n');
  assert.equal(noId.parsed, false);
  assert.deepEqual(noId.problems.map((p) => p.rule), ['invalid-field', 'unparsable-file']);
  assert.match(noId.problems[1].found, /the header line has no id column \(id, stepid, step\)/);
  assert.match(csv('id\nx\n').problems[0].found, /no phase column/);
  assert.match(csv('\n\n').problems[0].found, /the file holds no header line and no step/);
  assert.match(csv('id,phase\n"x,prepare\n').problems[0].found, /^line 2, column 1: a quoted field that is not closed; nothing in the file is read/);
  assert.match(csv('id,phase\nA,prepare,extra\n').problems[0].found, /the record has 3 fields and the header line 2; the fields past the header are not read/);
});

test('runbook: a JSON runbook keeps the line and column of each field; unknown keys are invalid fields with a suggestion', () => {
  const text = '{\n  "steps": [\n    { "id": "A", "phase": "prepare", "durationMinutes": 5, "owner": "o", "verfication": "v" }\n  ],\n  "aplication": {},\n  "application": { "name": "N", "windowMinutes": 5 }\n}\n';
  const r = json(text);
  assert.deepEqual(found(r), ['"aplication" is not a key of a runbook; did you mean "application"?', '"windowMinutes" is not a field of the application', '"verfication" is not a field of a step; did you mean "verification"?']);
  assert.deepEqual(r.problems.map((p) => p.line), [5, 6, 3]);
  assert.equal(r.problems[2].column, columnOf(text, '"v"'), 'the place of a key is the place of its value');
  assert.deepEqual(r.steps[0].places.phase, { line: 3, column: columnOf(text, '"prepare"') });
  assert.equal(r.application.name, 'N');
  assert.deepEqual(RUNBOOK_KEYS, ['application', 'steps']);
});

test('runbook: a JSON runbook that is not an object, has no steps list or is not JSON is refused; a step that is not an object is left out', () => {
  assert.match(json('[]').problems[0].found, /the runbook must be a JSON object with a steps list, not a list/);
  assert.match(json('{"application": {}}').problems[0].found, /the runbook has no steps list; nothing in the file is read/);
  assert.match(json('{"steps": {}}').problems[0].found, /the runbook has no steps list \(steps is an object\)/);
  assert.match(json('{"steps": [], "steps": []}').problems[0].found, /line 1, column 15: the name "steps" appears twice/);
  assert.match(json('{"steps": [1, null]}').problems[0].found, /steps\[0\] must be a JSON object, not a number; it is not read/);
  assert.equal(json('{"steps": [1, null]}').steps.length, 0);
  assert.equal(json('{"steps": []}').parsed, true);
  assert.ok(json('{"steps": [1, null]}').problems.every((p) => p.rule === 'invalid-field'));
  assert.equal(json('{').problems[0].rule, 'unparsable-file');
  const many = JSON.stringify({ steps: Array.from({ length: RUNBOOK_LIMITS.maxSteps + 1 }, () => ({})) });
  assert.match(json(many).problems[0].found, /more than 10,000 steps/);
});

test('runbook: ids, and the steps with no id or an id that is not one', () => {
  assert.deepEqual(one({ id: ' A-1.b_2 ', phase: 'prepare', durationMinutes: '5' }).s.id, 'A-1.b_2');
  assert.deepEqual(one({ phase: 'prepare', durationMinutes: 5 }).found, ['a step has no id; it is listed, and no other step can depend on it']);
  assert.match(one({ id: 'a b', phase: 'prepare', durationMinutes: 5 }).found[0], /the id "a b" is not an id the tool reads/);
  assert.match(one({ id: '-a', phase: 'prepare', durationMinutes: 5 }).found[0], /starting with a letter or a digit/);
  assert.equal(one({ id: 'x'.repeat(65), phase: 'prepare', durationMinutes: 5 }).s.id, '');
  assert.match(one({ id: 3, phase: 'prepare', durationMinutes: 5 }).found[0], /the id of the step must be a text, not a number/);
  assert.ok(ID_FORM.test('Z9'));
});

test('runbook: phases and their aliases, a phase that is none of them with a suggestion, and the aliases of the configuration', () => {
  for (const [name, phase] of [['Prepare', 'prepare'], ['Change Freeze', 'freeze'], ['change_freeze', 'freeze'], ['Snapshot', 'backup'], ['Data Sync', 'migrate-data'], ['Cut-Over', 'switch'], ['go live', 'switch'], ['Smoke Test', 'verify'], ['Back-out', 'rollback'], ['backout', 'rollback'], ['Hyper Care', 'hypercare']]) {
    assert.equal(one({ id: 'A', phase: name, durationMinutes: 5 }).s.phase, phase, name);
  }
  assert.deepEqual(one({ id: 'A', phase: 'rolback', durationMinutes: 5 }).found, ['the step "A" has the phase "rolback", which is none of the phases (prepare, freeze, backup, migrate-data, switch, verify, rollback, hypercare) or their aliases; did you mean "rollback"?']);
  assert.match(one({ id: 'A', phase: 'datasync', durationMinutes: 5 }).found[0], /"datasync", which is none of the phases/);
  assert.deepEqual(one({ id: 'A', durationMinutes: 5 }).found, ['the step "A" has no phase']);
  const own = configOf({ phaseAliases: { 'Run Book Warm Up': 'prepare' } });
  const problems = [];
  assert.equal(readStep({ id: 'A', phase: 'run-book warm up', durationMinutes: 1 }, {}, { line: 1, column: 1 }, 'r', own, problems).phase, 'prepare');
  assert.deepEqual(problems, []);
});

test('runbook: durations are whole minutes from 0 to a week; anything else is an invalid field', () => {
  assert.equal(one({ id: 'A', phase: 'prepare', durationMinutes: ' 45 ' }).s.duration, 45);
  assert.equal(one({ id: 'A', phase: 'prepare', durationMinutes: 0 }).s.duration, 0);
  assert.equal(one({ id: 'A', phase: 'prepare', durationMinutes: MAX_MINUTES }).s.duration, MAX_MINUTES);
  for (const bad of ['45m', '1.5', '-5', 1.5, -1, MAX_MINUTES + 1, true, '1 0']) {
    const r = one({ id: 'A', phase: 'prepare', durationMinutes: bad });
    assert.equal(r.s.duration, null, String(bad));
    assert.match(r.found[0], /is not a whole number of minutes from 0 to 10,080/, String(bad));
  }
  assert.deepEqual(one({ id: 'A', phase: 'prepare', durationMinutes: '' }).found, ['the step "A" has no duration']);
  assert.deepEqual(one({ id: 'A', phase: 'prepare' }).found, ['the step "A" has no duration']);
});

test('runbook: gates, depends-on and rollback steps', () => {
  for (const [v, want] of [['yes', true], ['Y', true], ['TRUE', true], ['1', true], [true, true], ['no', false], ['n', false], ['', false], [false, false], [null, false]]) assert.equal(one({ id: 'A', phase: 'prepare', durationMinutes: 1, gate: v }).s.gate, want, String(v));
  assert.match(one({ id: 'A', phase: 'prepare', durationMinutes: 1, gate: 'maybe' }).found[0], /the go\/no-go gate of the step "A", "maybe", is neither yes nor no/);
  assert.match(one({ id: 'A', phase: 'prepare', durationMinutes: 1, gate: 1 }).found[0], /a number, is neither yes nor no/);
  assert.deepEqual(one({ id: 'A', phase: 'prepare', durationMinutes: 1, dependsOn: 'B; C,D  E;B' }).s.dependsOn, ['B', 'C', 'D', 'E']);
  assert.deepEqual(one({ id: 'A', phase: 'prepare', durationMinutes: 1, dependsOn: ['B', ' C '] }).s.dependsOn, ['B', 'C']);
  assert.match(one({ id: 'A', phase: 'prepare', durationMinutes: 1, dependsOn: ['B', 3] }).found[0], /the depends-on of the step "A" holds a number, which is not an id/);
  assert.match(one({ id: 'A', phase: 'prepare', durationMinutes: 1, dependsOn: 'B, -x' }).found[0], /holds "-x", which is not an id/);
  assert.match(one({ id: 'A', phase: 'prepare', durationMinutes: 1, dependsOn: {} }).found[0], /must be a list of ids or a text, not an object/);
  assert.match(one({ id: 'A', phase: 'prepare', durationMinutes: 1, dependsOn: Array.from({ length: 201 }, (_, i) => `d${i}`) }).found[0], /depends on more than 200 steps/);
  assert.equal(one({ id: 'A', phase: 'switch', durationMinutes: 1, rollbackStep: ' R1 ' }).s.rollbackStep, 'R1');
  assert.match(one({ id: 'A', phase: 'switch', durationMinutes: 1, rollbackStep: 'R 1' }).found[0], /the rollback step of the step "A", "R 1", is not an id/);
  assert.equal(one({ id: 'A', phase: 'switch', durationMinutes: 1, action: 'two\n  lines' }).s.action, 'two lines');
});

test('runbook: the application, with the strategies and their other names, the window and the communication plan', () => {
  const read = (raw) => {
    const problems = [];
    return { a: readApplication(raw, {}, { line: 2, column: 3 }, 'app.json', problems), found: problems.map((p) => p.found) };
  };
  for (const [name, strategy] of [['Lift and Shift', 'rehost'], ['lift-and-reshape', 'replatform'], ['Re-architect', 'refactor'], ['rebuild', 'refactor'], ['Replace', 'repurchase'], ['drop and shop', 'repurchase'], ['Decommission', 'retire'], ['retain', 'retain'], ['Relocate', 'relocate']]) assert.equal(read({ strategy: name }).a.strategy, strategy, name);
  assert.deepEqual(read({ strategy: 'lift' }).found, ['the strategy "lift" is none of the seven migration strategies (rehost, replatform, refactor, repurchase, retire, retain, relocate) or their other names']);
  assert.equal(read({ downtimeWindowMinutes: '90' }).a.window, 90);
  assert.match(read({ downtimeWindowMinutes: 'four hours' }).found[0], /the downtime window of the application, "four hours", is not a whole number of minutes/);
  assert.equal(read({ downtimeWindowMinutes: '' }).a.window, null);
  for (const [v, want] of [['yes', true], [true, true], ['No', false], [false, false], ['', null]]) assert.equal(read({ communicationPlan: v }).a.communicationPlan, want, String(v));
  assert.match(read({ communicationPlan: 'soon' }).found[0], /the communication plan of the application, "soon", is neither yes nor no/);
  assert.match(read({ name: 5 }).found[0], /the name of the application must be a text, not a number/);
  assert.deepEqual([...read({ communicationPlan: 'soon', name: 5 }).a.invalid].sort(), ['communicationPlan', 'name']);
  assert.deepEqual(APPLICATION_FIELDS, Object.keys(APP));
});

test('runbook: an application file is one JSON object; anything else is refused', () => {
  const good = readApplicationFile(appFile(), 'app.json');
  assert.deepEqual(good.problems, []);
  assert.equal(good.application.name, 'Order Desk');
  assert.equal(good.application.line, 1);
  assert.equal(good.application.places.dataOwner.line, lineOf(appFile(), '"dataOwner"'));
  assert.match(readApplicationFile('[]', 'a.json').problems[0].found, /the application file must be a JSON object, not a list/);
  assert.match(readApplicationFile('{"name": "a",}', 'a.json').problems[0].found, /line 1, column 14: a comma before the closing brace/);
  assert.match(readApplicationFile('{"nmae": "a"}', 'a.json').problems[0].found, /"nmae" is not a field of the application; did you mean "name"\?/);
  assert.match(json('{"application": [], "steps": []}').problems[0].found, /the application must be a JSON object, not a list/);
});
