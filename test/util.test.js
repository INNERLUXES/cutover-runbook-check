import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { CHANGE_PHASES, KINDS, NO, PHASES, PHASE_NAMES, STRATEGIES, STRATEGY_NAMES, YES, asciiLower, baseName, byCode, capped, cleanTexts, decodeText, displayPath, encodingOf, fieldForm, fileError, fileKind, flat, grouped, inspectPath, lineStarts, listText, phaseMap, plural, positionOf, readBounded, readText, readTextFile, safeText, strategyOf, unreadableFile, wordForm, yesNo } from '../src/index.js';
import { withFiles } from './helpers.js';

// The small helpers: numbers and lists, text cleaning, words, phases and strategies, kinds, lines and columns, and the
// files the tool reads.

test('size: grouped numbers, lists and plurals', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText([]), '');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(plural(1, 'step'), '1 step');
  assert.equal(plural(2, 'step'), '2 steps');
  assert.equal(plural(2, 'dependency', 'dependencies'), '2 dependencies');
});

test('text: control, line separator and direction characters become spaces; long text is cut; every text of a value is cleaned', () => {
  assert.equal(safeText(`a${String.fromCharCode(27)}b${String.fromCharCode(0x202e)}c${String.fromCharCode(0x2028)}d${String.fromCharCode(0x9b)}e`), 'a b c d e');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n\t b '), 'a b');
  assert.deepEqual(cleanTexts({ a: [`x${String.fromCharCode(7)}`], b: 1, c: null, d: true }), { a: ['x '], b: 1, c: null, d: true });
  assert.deepEqual(capped(Array.from({ length: 25 }, (_, i) => `p${i}`)).slice(-2), ['p19', 'and 5 more']);
  assert.deepEqual(capped(['a']), ['a']);
});

test('words: lowercase for A to Z only, the last part of a path, the forms of names, and code order', () => {
  assert.equal(asciiLower('ABC-xyz'), 'abc-xyz');
  assert.equal(asciiLower(`${String.fromCharCode(0x130)}I`), `${String.fromCharCode(0x130)}i`, 'no letter past ASCII changes, whatever the locale');
  assert.equal(baseName('a/b/runbook.csv'), 'runbook.csv');
  assert.equal(baseName('runbook.csv'), 'runbook.csv');
  assert.equal(fieldForm('Depends-On'), 'dependson');
  assert.equal(fieldForm('Duration (min)'), 'durationmin');
  assert.equal(wordForm('  Data _ Sync '), 'data-sync');
  assert.equal(wordForm('--Go-Live--'), 'go-live');
  assert.notEqual(wordForm('datasync'), wordForm('data sync'));
  assert.deepEqual(['b', 'B', 'a'].sort(byCode), ['B', 'a', 'b']);
  assert.equal(byCode('a', 'a'), 0);
});

test('phases: eight phases in the order of a cutover, no alias named twice, and the change phases', () => {
  assert.deepEqual(PHASE_NAMES, ['prepare', 'freeze', 'backup', 'migrate-data', 'switch', 'verify', 'rollback', 'hypercare']);
  const forms = PHASES.flatMap((p) => [p.phase, ...p.aliases.map(wordForm)]);
  assert.equal(new Set(forms).size, forms.length);
  for (const p of PHASES) for (const a of p.aliases) assert.equal(a, wordForm(a), `${a} is written in its word form`);
  assert.deepEqual(CHANGE_PHASES, ['migrate-data', 'switch']);
  const map = phaseMap({ 'Night Run': 'switch' });
  assert.equal(map.get('night-run'), 'switch');
  assert.equal(map.get('fallback'), 'rollback');
  assert.equal(phaseMap().get('night-run'), undefined);
});

test('phases: the seven strategies and their other names, and yes and no', () => {
  assert.deepEqual(STRATEGY_NAMES, ['rehost', 'replatform', 'refactor', 'repurchase', 'retire', 'retain', 'relocate']);
  const forms = STRATEGIES.flatMap((s) => [s.strategy, ...s.aliases]);
  assert.equal(new Set(forms).size, forms.length);
  assert.equal(strategyOf(' Lift and Shift '), 'rehost');
  assert.equal(strategyOf('REARCHITECT'), 'refactor');
  assert.equal(strategyOf('lift'), null);
  assert.deepEqual([YES, NO], [['yes', 'y', 'true', '1'], ['no', 'n', 'false', '0']]);
  assert.equal(yesNo(' Yes '), true);
  assert.equal(yesNo('N'), false);
  assert.equal(yesNo(''), undefined);
  assert.equal(yesNo('maybe'), null);
  assert.equal(yesNo(false), false);
});

test('kinds: .csv and .json in any case, and nothing else', () => {
  assert.deepEqual(KINDS, ['csv', 'json']);
  assert.equal(fileKind('a/runbook.csv'), 'csv');
  assert.equal(fileKind('RUNBOOK.JSON'), 'json');
  assert.equal(fileKind('x/Runbook.Csv'), 'csv');
  for (const name of ['runbook.txt', 'runbook.csv.bak', 'csv', '.csv', '.json', 'a/b.xlsx', 'a/b.md']) assert.equal(fileKind(name), null, name);
});

test('lines: LF, CRLF and a lone CR each end a line; positions count from 1', () => {
  const starts = lineStarts('a\nb\r\nc\rd');
  assert.deepEqual(starts, [0, 2, 5, 7]);
  assert.deepEqual(positionOf(starts, 6), { line: 3, column: 2 });
});

test('files: UTF-8 with or without a byte order mark, UTF-16 little and big endian after their byte order marks, and nothing else', () => {
  const base = resolve('base');
  assert.equal(displayPath(resolve(base, 'a/b.csv'), base), 'a/b.csv');
  assert.equal(displayPath(base, base), '.');
  assert.ok(displayPath(resolve(base, '../x.csv'), base).endsWith('/x.csv'));
  assert.equal(fileError('a.csv', 'why').message, 'a.csv: why');
  assert.equal(fileError('a.csv', 'why').reason, 'why');
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('id,phase', 'utf16le')]);
  const be = Buffer.from(le);
  for (let i = 0; i < be.length; i += 2) [be[i], be[i + 1]] = [le[i + 1], le[i]];
  assert.equal(encodingOf(le), 'utf-16le');
  assert.equal(encodingOf(be), 'utf-16be');
  assert.equal(encodingOf(Buffer.from('id')), 'utf-8');
  assert.equal(decodeText(le), 'id,phase');
  assert.equal(decodeText(be), 'id,phase');
  assert.equal(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
  assert.equal(decodeText(Buffer.from([0xc3])), null);
  assert.equal(decodeText(Buffer.from([0xfe, 0xff, 0x00])), null, 'an odd number of bytes is not UTF-16');
  assert.equal(decodeText(Buffer.from([0xff, 0xfe, 0x00, 0xd8])), null, 'a lone surrogate is not UTF-16');
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('a\u0000b', 'utf16le')])), null, 'a null character is refused');
  assert.deepEqual(unreadableFile('a.csv', 'csv', 'why').problems.map((p) => [p.rule, p.found]), [['unreadable-file', 'the file cannot be read: why; nothing in it is checked']]);
});

test('files: a file is read whole, and a missing file, a folder, binary data or one over its limit is refused', async () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('id,phase', 'utf16le')]);
  await withFiles({ 'a.csv': 'id\n', 'd/b.csv': 'x', 'w.csv': utf16, 'n.csv': Buffer.from([0x69, 0, 0x64]), 'u.csv': Buffer.from([0x69, 0xe9, 0x64]) }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.csv'), 100)).toString(), 'id\n');
    await assert.rejects(readBounded(resolve(dir, 'a.csv'), 2), /3 bytes is over the 2 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'nope.csv'), 100), /no such file/);
    await assert.rejects(readBounded(resolve(dir, 'd'), 100), /is a folder/);
    assert.deepEqual(await readText(resolve(dir, 'w.csv'), 'w.csv', 100), { size: utf16.length, encoding: 'utf-16le', text: 'id,phase' });
    await assert.rejects(readText(resolve(dir, 'n.csv'), 'n.csv', 100), /n\.csv: holds binary data \(a null byte\); a UTF-16 file needs its byte order mark/);
    await assert.rejects(readText(resolve(dir, 'u.csv'), 'u.csv', 100), /u\.csv: is not valid UTF-8/);
    const t = await readTextFile('a.csv', dir, 100);
    assert.deepEqual([t.file, t.text, t.encoding], ['a.csv', 'id\n', 'utf-8']);
    assert.deepEqual(await inspectPath('a.csv', dir), { full: resolve(dir, 'a.csv'), shown: 'a.csv' });
    await assert.rejects(inspectPath('d', dir), /d: is a folder; give the file itself/);
    await assert.rejects(inspectPath('nope.csv', dir), /nope\.csv: no such file/);
  });
});
