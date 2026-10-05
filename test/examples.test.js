import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const FILE = 'examples/messy/runbook.csv';

test('examples: the messy runbook fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean runbook passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
  assert.equal((await run([...CLEAN, '--fail-on', 'info'])).code, 0);
  assert.equal((await run([...CLEAN, '--config', 'examples/config.json', '--fail-on', 'info'])).code, 0, 'the clean runbook also meets the configuration of the messy one, hypercare included');
});

test('examples: --explain, JSON, CSV, the GitHub commands and the defaults are the reports that are saved', async () => {
  const outputs = { 'messy-explain.txt': [...MESSY, '--explain'], 'messy.json': [...MESSY, '--json', '--explain'], 'messy-findings.csv': [...MESSY, '--format', 'csv'], 'messy-github.txt': [...MESSY, '--format', 'github'], 'defaults.json': ['--print-defaults'] };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the rules that fire on the messy runbook, each on the row built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const lines = (await readFile(resolve(root, FILE), 'utf8')).split('\n');
  // The line of the row of a step, the n-th one with that id.
  const at = (id, n = 1) => `${FILE}:${lines.map((l, i) => [l, i]).filter(([l]) => l.startsWith(`${id},`))[n - 1][1] + 1}`;
  const byRule = {};
  for (const x of report.findings) (byRule[x.rule] ??= []).push(x.at);
  assert.deepEqual(byRule, {
    'missing-phase': [`${FILE}:1`, `${FILE}:1`],
    'dependency-cycle': [at('P3')],
    'duplicate-id': [at('F1', 2)],
    'no-backup-before-migrate': [at('M1')],
    'change-without-rollback': [at('M2'), at('S1'), at('S2')],
    'no-go-gate': [at('S1')],
    'unknown-dependency': [at('S1')],
    'critical-path-over-window': [at('S2')],
    'no-communication-plan': ['examples/messy/application.json:7'],
    'missing-owner': [at('P2')],
    'missing-verification': [at('P2'), at('R3')],
    'strategy-mismatch': [at('M1')],
    'rollback-over-window': [at('R1')],
    'missing-business-sign-off': ['examples/messy/application.json:6']
  });
  assert.deepEqual(report.summary.criticalPath.steps.map((s) => s.id), ['F1', 'M1', 'M2', 'S1', 'S2']);
  assert.equal(report.steps.find((s) => s.id === 'B1').phase, 'backup', 'read through the alias of the configuration');
  assert.equal(report.application.strategy, 'retire');
});

test('examples: the same files written with CRLF line ends give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'cutover-runbook-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    const walk = async (sub) => {
      for (const e of await readdir(resolve(dir, sub), { withFileTypes: true })) {
        const rel = `${sub}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== 'output') await walk(rel);
        } else if (!e.name.endsWith('.md')) {
          const text = (await readFile(resolve(dir, rel), 'utf8')).split('\r\n').join('\n');
          await writeFile(resolve(dir, rel), text.split('\n').join('\r\n'));
        }
      }
    };
    await walk('examples');
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
