// A small strict CSV reader for a runbook, as RFC 4180 describes the format: records separated by line breaks, fields
// separated by commas, and a field that holds a comma, a double quote or a line break put in double quotes, with a
// double quote inside it written twice. CRLF, LF and a lone CR each end a record, and the line ends inside a quoted
// field are kept as they are. A double quote inside a field that does not start with one, and text after the closing
// quote of a field, are refused with the line and column, because a reader that guessed would give a step a value its
// author did not write. Each character is read once, with no regular expression and no recursion, and the number of
// records, the number of fields and the length of a field are limited. Lines that hold nothing are left out.

export const TABLE_LIMITS = { maxRecords: 10000, maxFields: 64, maxFieldLength: 4096 };

export class TableError extends Error {
  constructor(reason, line, column) {
    super(reason);
    this.reason = reason;
    this.line = line;
    this.column = column;
  }
}

// Reads the text of a CSV file: a list of records { line, fields: [{ value, line, column }] }, the line of a record
// being the line it starts on. Throws TableError with the line and column of the problem.
export function parseCsv(text, limits = TABLE_LIMITS) {
  const lim = { ...TABLE_LIMITS, ...limits };
  const n = text.length;
  const records = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let lineStart = i;
  let record = null;
  const fail = (reason, at = i, atLine = line, atStart = lineStart) => {
    throw new TableError(reason, atLine, at - atStart + 1);
  };
  const finish = () => {
    if (!(record.fields.length === 1 && record.fields[0].value === '' && !record.fields[0].quoted)) {
      records.push({ line: record.line, fields: record.fields.map(({ value, line: l, column }) => ({ value, line: l, column })) });
      if (records.length > lim.maxRecords) fail(`more than ${lim.maxRecords.toLocaleString('en-US')} records`, i);
    }
    record = null;
  };
  // Counts the line ends between two offsets, so the place of a later problem is right.
  const passLines = (from, to) => {
    for (let k = from; k < to; k += 1) {
      const c = text.charCodeAt(k);
      if (c === 10 || (c === 13 && text.charCodeAt(k + 1) !== 10)) {
        line += 1;
        lineStart = k + 1;
      }
    }
  };
  while (i < n) {
    if (record === null) record = { line, fields: [] };
    const startLine = line;
    const startColumn = i - lineStart + 1;
    let value;
    let quoted = false;
    if (text.charCodeAt(i) === 34) {
      quoted = true;
      const openAt = i;
      const openLine = line;
      const openStart = lineStart;
      i += 1;
      value = '';
      for (;;) {
        const q = text.indexOf('"', i);
        if (q < 0) fail('a quoted field that is not closed', openAt, openLine, openStart);
        passLines(i, q);
        value += text.slice(i, q);
        if (value.length > lim.maxFieldLength) fail(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, openAt, openLine, openStart);
        i = q + 1;
        if (text.charCodeAt(i) === 34) {
          value += '"';
          i += 1;
          continue;
        }
        break;
      }
      const c = text.charCodeAt(i);
      if (i < n && c !== 44 && c !== 10 && c !== 13) fail('text after the closing quote of a field; a double quote inside a quoted field is written twice');
    } else {
      let j = i;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === 44 || c === 10 || c === 13) break;
        if (c === 34) fail('a double quote inside a field that does not start with one; put the field in double quotes and write the quote twice', j);
        j += 1;
        if (j - i > lim.maxFieldLength) fail(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, i);
      }
      value = text.slice(i, j);
      i = j;
    }
    record.fields.push({ value, line: startLine, column: startColumn, quoted });
    if (record.fields.length > lim.maxFields) fail(`a record with more than ${lim.maxFields} fields`, i);
    if (i >= n) {
      finish();
      break;
    }
    const c = text.charCodeAt(i);
    if (c === 44) {
      i += 1;
      if (i >= n) {
        record.fields.push({ value: '', line, column: i - lineStart + 1, quoted: false });
        finish();
      }
      continue;
    }
    i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
    line += 1;
    lineStart = i;
    finish();
  }
  return records;
}

// The reason of a TableError with its line and column, for a finding.
export function tableProblem(error) {
  return `line ${error.line}, column ${error.column}: ${error.reason}`;
}
