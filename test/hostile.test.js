import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, LIMITS, MAX_PROBLEMS, TableError, parseCsv } from '../src/index.js';
import { APP, appFile, checkOf, cli, csvRunbook, jsonRunbook, reportOf, run, stepsWith, withFiles } from './helpers.js';

// Hostile input: files built to exhaust the memory, the stack or the time, to make the tool follow a link, to rewrite
// the terminal, to start a second workflow command, to slip a formula into a spreadsheet or to change how objects
// behave. Each heavy test also checks the time, because work that grows faster than the input is a failure even when
// the answer is right. Tests that need a symbolic link, a device or file permissions are guarded with process.platform,
// and none of them asserts a line: lines are asserted in the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

const GOOD = { 'r.json': jsonRunbook() };
const step = (id, phase, dependsOn, more = {}) => ({ id, phase, action: 'a', owner: 'o', dependsOn, durationMinutes: 1, verification: 'v', ...more });

test('hostile: a chain of ten thousand steps is walked with no recursion, its critical path found in seconds', LIMIT, async () => {
  const n = 10000;
  const steps = Array.from({ length: n }, (_, i) => step(`S${i}`, i % 2 ? 'migrate-data' : 'switch', i ? [`S${i - 1}`] : [], { rollbackStep: 'S0' }));
  const r = await fast(() => checkOf(steps, { ...APP, downtimeWindowMinutes: 10 }), 20000);
  assert.equal(r.summary.totals.criticalPath, n);
  assert.equal(r.summary.criticalPath.steps.length, n);
  assert.ok(r.findings.some((f) => f.rule === 'critical-path-over-window'));
  assert.ok(r.notes.some((x) => /findings past the limit of 500 per rule are counted but not listed/.test(x)));
  const cycle = Array.from({ length: n }, (_, i) => step(`C${i}`, 'prepare', [`C${(i + 1) % n}`]));
  const c = await fast(() => checkOf(cycle, APP, { requiredPhases: [] }), 20000);
  assert.deepEqual(c.findings.map((f) => f.rule), ['dependency-cycle']);
  assert.match(c.findings[0].found, /^the steps "C0", "C1".+ and 9,990 more depend on each other in a cycle \(C0 -> C1 -> /);
  assert.deepEqual(c.notes, ['10,000 dependencies inside a cycle are left out of the critical path']);
});

test('hostile: wide fans of dependencies, every step on two hundred others, are checked in seconds', LIMIT, async () => {
  const n = 3000;
  const steps = Array.from({ length: n }, (_, i) => step(`W${i}`, ['prepare', 'migrate-data', 'switch', 'backup'][i % 4], Array.from({ length: Math.min(i, 200) }, (_, k) => `W${i - 1 - k}`), { rollbackStep: `W${i}` }));
  const r = await fast(() => checkOf(steps, APP), 30000);
  assert.equal(r.summary.totals.steps, n);
  assert.ok(r.totals.findings > 0);
});

test('hostile: a file over its size limit is an error finding, a configuration over its limit stops the run', LIMIT, async () => {
  const big = await fast(() => run({ 'big.csv': `id,phase\n${' '.repeat(FILE_LIMITS.maxFileBytes)}` }, ['big.csv']));
  assert.equal(big.code, 1);
  assert.match(big.out, /big\.csv:1\n {11}the file cannot be read: [\d,]+ bytes is over the 16 MB limit; nothing in it is checked/);
  const config = await run({ ...GOOD, 'c.json': ' '.repeat(FILE_LIMITS.maxConfigBytes + 1) }, ['r.json', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const app = await run({ 'r.csv': csvRunbook(), 'a.json': ' '.repeat(FILE_LIMITS.maxConfigBytes + 1) }, ['r.csv', '--app', 'a.json']);
  assert.match(app.out, /a\.json:1\n {11}the file cannot be read: [\d,]+ bytes is over the 1 MB limit/);
});

test('hostile: long runs of quotes, commas, line ends and fields are read or refused in one pass', LIMIT, async () => {
  const texts = ['"'.repeat(500001), '""'.repeat(200000), ','.repeat(500000), '\n'.repeat(500000), '\r'.repeat(500000), `"${'""'.repeat(1000)}"`, `${'a,'.repeat(63)}a\n`.repeat(5000), `"${'x\n'.repeat(1000)}"`, `x${'"'.repeat(1000)}`, `${'a'.repeat(4096)},`.repeat(60)];
  for (const text of texts) {
    await fast(() => {
      try {
        parseCsv(text);
      } catch (error) {
        assert.ok(error instanceof TableError, error.message);
      }
    });
  }
});

test('hostile: JSON nested deep, long strings and many values are refused or read in one pass', LIMIT, async () => {
  for (const text of [`{"steps": ${'['.repeat(100000)}`, `{"steps": [{"id": "${'x'.repeat(300000)}"}]}`, `{"steps": [${'{},'.repeat(9999)}{}]}`, `{"steps": [], "application": {"name": "${'\\n'.repeat(100000)}"}}`]) {
    const r = await fast(() => reportOf({ json: text }));
    assert.ok(r.findings.length > 0);
  }
});

test('hostile: a configuration with thirty problems lists twenty and a count', LIMIT, async () => {
  const c = await run({ ...GOOD, 'c.json': JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 1]))) }, ['r.json', '--config', 'c.json']);
  assert.equal(c.code, 2);
  assert.match(c.err, /\n {2}and 10 more\n$/);
  assert.equal(c.err.split('\n').filter((l) => l.startsWith('  c.json')).length, MAX_PROBLEMS);
});

test('hostile: CRLF, CR, a byte order mark and UTF-16 give the same report as LF', async () => {
  const text = csvRunbook(stepsWith({ P1: { owner: '' }, G1: { gate: false } }));
  const lf = await run({ 'r.csv': text, 'a.json': appFile() }, ['r.csv', '--app', 'a.json', '--json']);
  assert.equal(lf.code, 1, lf.err);
  assert.equal(JSON.parse(lf.out).totals.findings, 2);
  const plain = (out) => out.replace(/"encoding": "[^"]+"/g, '');
  for (const eol of ['\r\n', '\r']) {
    const r = await run({ 'r.csv': `${String.fromCharCode(0xfeff)}${text.split('\n').join(eol)}`, 'a.json': appFile().split('\n').join(eol) }, ['r.csv', '--app', 'a.json', '--json']);
    assert.equal(r.out, lf.out, JSON.stringify(eol));
  }
  const utf16 = await run({ 'r.csv': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]), 'a.json': appFile() }, ['r.csv', '--app', 'a.json', '--json']);
  assert.equal(plain(utf16.out), plain(lf.out));
});

test('hostile: control, escape and direction characters in file names and values never reach the reports', async () => {
  const escape = String.fromCharCode(27);
  const rlo = String.fromCharCode(0x202e);
  const ls = String.fromCharCode(0x2028);
  const name = `r${rlo}.csv`;
  const steps = stepsWith({ P1: { action: `x${escape}[2J`, owner: `o${rlo}`, phase: `pre${ls}pare` }, F1: { verification: `v${escape}]0;title` } });
  for (const format of ['text', 'json', 'csv', 'github']) {
    const r = await run({ [name]: csvRunbook(steps), 'a.json': appFile({ ...APP, name: `N${rlo}`, dataOwner: `D${escape}` }) }, [name, '--app', 'a.json', ...(format === 'text' ? ['--explain'] : ['--format', format])]);
    assert.equal(r.code, 1, r.err);
    for (const c of [escape, rlo, ls]) assert.ok(!r.out.includes(c) && !r.err.includes(c), `${format}: ${c.charCodeAt(0)}`);
  }
  const bad = await run({ [`bad${rlo}.txt`]: 'x' }, [`bad${rlo}.txt`]);
  assert.equal(bad.code, 2);
  assert.ok(!bad.err.includes(rlo));
});

test('hostile: a text cannot start a second workflow command', async () => {
  const r = await run({ 'r.json': jsonRunbook({ steps: stepsWith({ P1: { owner: '', action: '%0A::error::x\n::error file=x::y' } }) }) }, ['r.json', '--format', 'github']);
  const lines = r.out.trimEnd().split('\n');
  assert.ok(lines.every((l) => l.startsWith('::error ') || l.startsWith('::warning ') || l.startsWith('::notice ') || l.startsWith('cutover-runbook-check: ')), r.out);
  const shown = await run({ 'r.json': jsonRunbook({ steps: stepsWith({ P1: { owner: '', id: 'P%0A' } }) }) }, ['r.json', '--format', 'github']);
  assert.ok(shown.out.includes('"P%250A"'));
  assert.equal(lines.length, 2, 'one finding and the summary line');
});

test('hostile: a value that starts with a formula character is not a formula in the CSV report', async () => {
  const r = await run({ 'r.json': jsonRunbook({ steps: stepsWith({ P1: { owner: '', id: '@P1' }, F1: { dependsOn: ['@P1'] } }) }) }, ['r.json', '--format', 'csv']);
  assert.equal(r.code, 1, r.err);
  const rows = r.out.split('\r\n');
  assert.ok(rows.some((x) => x.includes(",'@P1,prepare,")), r.out);
  assert.ok(rows.every((x) => !/(?:^|,)[=+\-@]/.test(x)), 'no field starts with a formula character');
});

test('hostile: constructor, toString and __proto__ as ids, columns, keys and aliases are only data', async () => {
  const steps = stepsWith({ P1: { id: 'toString' }, F1: { id: 'constructor', dependsOn: ['toString', 'valueOf'] }, B1: { dependsOn: ['constructor'] } });
  const r = checkOf(steps);
  assert.deepEqual(r.findings.map((f) => [f.rule, f.step, f.found]), [['unknown-dependency', 'constructor', 'the step "constructor" depends on "valueOf", which is not in the runbook']]);
  assert.match(checkOf(stepsWith({ P1: { id: '__proto__' } })).findings[0].found, /the id "__proto__" is not an id the tool reads/);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.equal({}.x, undefined);
  const csv = reportOf({ csv: 'id,phase,__proto__,constructor\nA,prepare,x,y\n' });
  assert.deepEqual(csv.findings.filter((f) => f.rule === 'invalid-field').map((f) => f.found.slice(0, 26)), ['the column "__proto__" is ', 'the column "constructor" i', 'the step "A" has no durati']);
  const json = reportOf({ json: '{"steps": [{"id": "A", "__proto__": {"phase": "x"}}], "application": {"__proto__": 1}}' });
  assert.ok(json.findings.some((f) => f.found.startsWith('"__proto__" is not a field of a step')));
  assert.ok(json.findings.some((f) => f.found.startsWith('"__proto__" is not a field of the application')));
  const cfg = await run({ ...GOOD, 'c.json': '{"rules": {"toString": "off"}, "phaseAliases": {"__proto__": "verify", "constructor": 1}}' }, ['r.json', '--config', 'c.json']);
  assert.equal(cfg.code, 2);
  assert.match(cfg.err, /"toString" is not a key of rules/);
  assert.match(cfg.err, /phaseAliases\.constructor must be one of the phases/);
  const alias = reportOf({ json: jsonRunbook({ steps: stepsWith({ V1: { phase: '__proto__' } }) }) }, JSON.parse('{"phaseAliases": {"__proto__": "verify"}}'));
  assert.deepEqual(alias.findings, []);
});

test('hostile: empty files and files that are not runbooks are reported without a crash', async () => {
  const r = await run({ 'a.csv': '', 'b.json': '', 'c.json': 'null', 'd.csv': '\n\n' }, ['a.csv']);
  assert.equal(r.code, 1, r.err);
  assert.match(r.out, /the file holds no header line and no step; nothing in the file is read/);
  for (const [file, message] of [['b.json', /the text ends where a value was expected/], ['c.json', /the runbook must be a JSON object with a steps list, not null/], ['d.csv', /the file holds no header line/]]) {
    const x = await run({ [file]: file === 'b.json' ? '' : file === 'c.json' ? 'null' : '\n\n' }, [file]);
    assert.equal(x.code, 1, file);
    assert.match(x.out, message, file);
  }
});

test('hostile: a runbook, an application file or a configuration named through a symbolic link is refused', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows needs extra rights to make a symbolic link');
    return;
  }
  await withFiles({ 'real.csv': csvRunbook(), 'a.json': appFile(), 'c.json': '{}' }, async (dir) => {
    await symlink(resolve(dir, 'real.csv'), resolve(dir, 'linked.csv'));
    await symlink(resolve(dir, 'a.json'), resolve(dir, 'a-link.json'));
    await symlink(resolve(dir, 'c.json'), resolve(dir, 'c-link.json'));
    const r = await cli(['linked.csv'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /linked\.csv: is a symbolic link, which is not followed/);
    const a = await cli(['real.csv', '--app', 'a-link.json'], dir);
    assert.equal(a.code, 2);
    assert.match(a.err, /a-link\.json: is a symbolic link/);
    const c = await cli(['real.csv', '--config', 'c-link.json'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /c-link\.json: is a symbolic link/);
  });
});

test('hostile: a device named as a runbook or the configuration is refused', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no /dev/zero to name as an input');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    const config = await fast(() => cli(['r.json', '--config', '/dev/zero'], dir));
    assert.equal(config.code, 2);
    assert.match(config.err, /is not a regular file/);
    const input = await fast(() => cli(['/dev/zero'], dir));
    assert.equal(input.code, 2);
    assert.match(input.err, /is not a regular file/);
  });
});

test('hostile: a runbook without read access is an error finding', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not take away read access with chmod');
    return;
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user can read a file without read access');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    await chmod(resolve(dir, 'r.json'), 0o000);
    try {
      const r = await cli(['r.json'], dir);
      assert.equal(r.code, 1);
      assert.match(r.out, /the file cannot be read: cannot be read \(EACCES\)/);
    } finally {
      await chmod(resolve(dir, 'r.json'), 0o644);
    }
  });
});

test('hostile: the limit of findings per rule still counts every finding for the result', async () => {
  const steps = Array.from({ length: LIMITS.maxFindingsPerRule + 5 }, (_, i) => step(`O${i}`, 'prepare', [], { owner: '' }));
  const r = checkOf(steps, APP, { requiredPhases: [] });
  assert.equal(r.findings.length, LIMITS.maxFindingsPerRule);
  assert.equal(r.totals.findings, LIMITS.maxFindingsPerRule + 5);
  assert.equal(r.totals.notListed, 5);
});
