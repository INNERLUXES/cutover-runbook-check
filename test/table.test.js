import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_LIMITS, TableError, parseCsv, tableProblem } from '../src/index.js';

// The CSV reader: the format of RFC 4180, the line and column of every field, and what it refuses.

const values = (records) => records.map((r) => r.fields.map((f) => f.value));
const problem = (text, limits) => {
  try {
    parseCsv(text, limits);
  } catch (error) {
    assert.ok(error instanceof TableError, error.message);
    return tableProblem(error);
  }
  return assert.fail('not refused');
};

test('table: plain fields, quoted fields with commas, doubled quotes and line breaks', () => {
  const records = parseCsv('a,b,c\n1,"x, y","say ""hi"""\n2,"two\nlines",z\n');
  assert.deepEqual(values(records), [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'two\nlines', 'z']]);
  assert.deepEqual(records.map((r) => r.line), [1, 2, 3]);
});

test('table: the line and column of every field, also after a quoted line break', () => {
  const records = parseCsv('id,phase\n"a\nb",x\nc,  y\n');
  assert.deepEqual(records[1].fields.map((f) => [f.line, f.column]), [[2, 1], [3, 4]]);
  assert.equal(records[2].line, 4);
  assert.deepEqual(records[2].fields.map((f) => [f.value, f.column]), [['c', 1], ['  y', 3]]);
});

test('table: CRLF, CR and LF end a record, blank lines are left out, and a byte order mark is skipped', () => {
  const want = [['a', 'b'], ['1', '2'], ['3', '4']];
  for (const eol of ['\n', '\r\n', '\r']) assert.deepEqual(values(parseCsv(['a,b', '1,2', '', '3,4', ''].join(eol))), want, JSON.stringify(eol));
  assert.deepEqual(values(parseCsv(`${String.fromCharCode(0xfeff)}a,b\n1,2`)), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n\r\n1,2').map((r) => r.line), [1, 3]);
  assert.deepEqual(values(parseCsv('')), []);
  assert.deepEqual(values(parseCsv('""\n')), [['']], 'a quoted empty field is a record, not a blank line');
});

test('table: empty fields, and a comma at the end of a line or of the text', () => {
  assert.deepEqual(values(parseCsv('a,,c\n,\n1,2,')), [['a', '', 'c'], ['', ''], ['1', '2', '']]);
  assert.deepEqual(parseCsv('a,b,').at(-1).fields.map((f) => f.column), [1, 3, 5]);
});

test('table: a quote out of place is refused with its line and column', () => {
  assert.equal(problem('a,b\n1,"open\n'), 'line 2, column 3: a quoted field that is not closed');
  assert.equal(problem('a,b\n1,"x"y\n'), 'line 2, column 6: text after the closing quote of a field; a double quote inside a quoted field is written twice');
  assert.equal(problem('a,b\n1,x"y\n'), 'line 2, column 4: a double quote inside a field that does not start with one; put the field in double quotes and write the quote twice');
  assert.equal(problem('a\n"x\ny"z'), 'line 3, column 3: text after the closing quote of a field; a double quote inside a quoted field is written twice');
});

test('table: the limits of records, fields and field length', () => {
  assert.match(problem('a\nb\nc\nd', { maxRecords: 3 }), /more than 3 records/);
  assert.match(problem('a,b,c', { maxFields: 2 }), /a record with more than 2 fields/);
  assert.match(problem(`${'x'.repeat(11)}`, { maxFieldLength: 10 }), /a field longer than 10 characters/);
  assert.match(problem(`"${'x'.repeat(11)}"`, { maxFieldLength: 10 }), /line 1, column 1: a field longer than 10 characters/);
  assert.equal(TABLE_LIMITS.maxRecords, 10000);
});
