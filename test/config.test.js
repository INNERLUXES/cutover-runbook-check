import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_FAIL_ON, DEFAULT_MIN_SEVERITY, DEFAULT_REQUIRED_PHASES, DEFAULT_RULES, DEFAULT_WINDOW_PHASES, KEYS, RULES, defaultConfig, defaultsAsConfig, distance, isObject, kindOf, readConfig, suggestion, validateConfig } from '../src/index.js';

// The configuration file: every key with a good value and a bad one, the suggestions, and the defaults.

const problems = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems;
  }
  return assert.fail('not refused');
};

test('config: the defaults, and --print-defaults read back gives them', () => {
  const d = defaultConfig();
  assert.deepEqual(d.rules, DEFAULT_RULES);
  assert.deepEqual(d.requiredPhases, DEFAULT_REQUIRED_PHASES);
  assert.deepEqual(d.windowPhases, DEFAULT_WINDOW_PHASES);
  assert.deepEqual([d.minSeverity, d.failOn], [DEFAULT_MIN_SEVERITY, DEFAULT_FAIL_ON]);
  assert.equal(d.phases.get('cutover'), 'switch');
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null, phases: null }, { ...d, phases: null });
  assert.deepEqual([...back.phases.entries()], [...d.phases.entries()]);
  assert.deepEqual(Object.keys(defaultsAsConfig()), ['name', ...Object.keys(KEYS).filter((k) => k !== 'name')]);
  for (const r of RULES.filter((x) => x.key)) assert.ok(Object.hasOwn(DEFAULT_RULES, r.key), r.key);
  assert.deepEqual(Object.keys(DEFAULT_RULES), RULES.filter((x) => x.key).map((x) => x.key), 'the defaults are in the order of the rules');
});

test('config: every key with a good value', () => {
  const c = readConfig(JSON.stringify({ name: 'Review', rules: { missingOwner: 'error', strategyMismatch: 'off' }, phaseAliases: { 'Warm Up': 'prepare', DR_Test: 'verify' }, requiredPhases: ['rollback', 'Back-out', 'warm up', 'backup'], windowPhases: ['cutover', 'freeze'], minSeverity: 'warning', failOn: 'warning' }), 'c.json');
  assert.equal(c.file, 'c.json');
  assert.equal(c.name, 'Review');
  assert.equal(c.rules.missingOwner, 'error');
  assert.equal(c.rules.strategyMismatch, 'off');
  assert.deepEqual(c.phaseAliases, { 'Warm Up': 'prepare', DR_Test: 'verify' });
  assert.equal(c.phases.get('warm-up'), 'prepare');
  assert.equal(c.phases.get('dr-test'), 'verify');
  assert.deepEqual(c.requiredPhases, ['prepare', 'backup', 'rollback'], 'aliases are read, repeats dropped, and the list kept in the order of the phases');
  assert.deepEqual(c.windowPhases, ['freeze', 'switch']);
  assert.deepEqual([c.minSeverity, c.failOn], ['warning', 'warning']);
  assert.deepEqual(readConfig('{"requiredPhases": []}', 'c.json').requiredPhases, []);
});

test('config: an unknown key is an error with its line and a suggestion', () => {
  assert.deepEqual(problems('{\n  "failOm": "info",\n  "rules": {\n    "missingOwnr": "off"\n  }\n}'), ['c.json: line 2: "failOm" is not a key of the configuration; did you mean "failOn"?', 'c.json: line 4: "missingOwnr" is not a key of rules; did you mean "missingOwner"?']);
  assert.deepEqual(problems('{"requiredPhase": []}'), ['c.json: line 1: "requiredPhase" is not a key of the configuration; did you mean "requiredPhases"?']);
  assert.deepEqual(problems('{"colour": 1}'), ['c.json: line 1: "colour" is not a key of the configuration']);
});

test('config: a value of the wrong kind for every key', () => {
  assert.deepEqual(problems('[]'), ['c.json: line 1: the configuration must be a JSON object, not a list']);
  assert.match(problems('{"name": " "}')[0], /name must be a text of 1 to 120 characters/);
  assert.match(problems('{"rules": []}')[0], /rules must be an object, not a list/);
  assert.match(problems('{"rules": {"missingOwner": "fatal"}}')[0], /rules\.missingOwner must be one of info, warning, error, off, not "fatal"/);
  assert.match(problems('{"rules": {"missingOwner": 1}}')[0], /not 1/);
  assert.match(problems('{"requiredPhases": "backup"}')[0], /requiredPhases must be a list of phases, not a string/);
  assert.match(problems('{"windowPhases": ["swich"]}')[0], /windowPhases\[0\] must be one of the phases prepare, freeze, backup, migrate-data, switch, verify, rollback, hypercare or an alias of one, not "swich"; did you mean "switch"\?/);
  assert.match(problems('{"windowPhases": [3]}')[0], /windowPhases\[0\] must be one of the phases .+, not a number$/);
  assert.match(problems(JSON.stringify({ requiredPhases: Array(51).fill('backup') }))[0], /requiredPhases holds more than 50 entries/);
  assert.match(problems('{"phaseAliases": []}')[0], /phaseAliases must be an object of names to phases, not a list/);
  assert.match(problems('{"phaseAliases": {"x": "rolback"}}')[0], /phaseAliases\.x must be one of the phases .+, not "rolback"; did you mean "rollback"\?/);
  assert.match(problems('{"phaseAliases": {"x": "cutover"}}')[0], /not "cutover"/, 'an alias names a phase, not another alias');
  assert.match(problems('{"phaseAliases": {"Back Up": "backup", "back_up": "backup"}}')[0], /"back_up" is the same name as "Back Up" once compared \(back-up\)/);
  assert.match(problems('{"phaseAliases": {"Switch": "verify"}}')[0], /"Switch" is a phase itself and cannot be an alias/);
  assert.match(problems('{"phaseAliases": {"--": "verify"}}')[0], /the name "--" must hold 1 to 60 characters with a letter or a digit/);
  const many = Object.fromEntries(Array.from({ length: CONFIG_LIMITS.maxAliases + 1 }, (_, i) => [`a${i}`, 'verify']));
  assert.match(problems(JSON.stringify({ phaseAliases: many }))[0], /phaseAliases holds more than 200 names/);
  assert.match(problems('{"minSeverity": "fatal"}')[0], /minSeverity must be one of info, warning, error/);
  assert.match(problems('{"failOn": null}')[0], /failOn must be one of info, warning, error/);
});

test('config: a repeated name and JSON that does not parse are refused, and the problems are in the order of their lines', () => {
  assert.match(problems('{"failOn": "info", "failOn": "error"}')[0], /^c\.json: line 1, column 20: the name "failOn" appears twice/);
  assert.match(problems('{"failOn": "info",}')[0], /^c\.json: line 1, column 19: a comma before the closing brace/);
  assert.deepEqual(problems('{\n"failOn": 1,\n"minSeverity": 2,\n"zz": 3\n}').map((p) => p.split(':')[1].trim()), ['line 2', 'line 3', 'line 4']);
});

test('config: suggestions, edit distance and the kinds of values', () => {
  assert.equal(distance('nmae', 'name'), 1);
  assert.equal(distance('', 'abc'), 3);
  assert.equal(distance('kitten', 'sitting'), 3);
  assert.equal(suggestion('windowPhase', ['windowPhases', 'rules']), '; did you mean "windowPhases"?');
  assert.equal(suggestion('x', ['rules']), '');
  assert.equal(suggestion('y'.repeat(65), ['rules']), '');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf([]), 'a list');
  assert.equal(kindOf({}), 'an object');
  assert.equal(kindOf(1), 'a number');
  assert.equal(isObject({}), true);
  assert.equal(isObject([]), false);
  assert.throws(() => validateConfig(1), /the configuration must be a JSON object, not a number/);
  assert.deepEqual(validateConfig({}).rules, DEFAULT_RULES);
});
