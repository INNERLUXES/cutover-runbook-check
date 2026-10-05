# 3. Read CSV and JSON with strict readers of its own

## Status

Accepted

## Context

Runbooks live in sheets. A CSV file saved from a sheet can hold a quote out of place, a field with a line break, a
header with a column renamed, or values typed in many ways (`Y`, `yes`, `TRUE`; `Cutover`, `go live`, `switch`). A
reader that guesses would give a step a value its author did not write, or quietly drop a column, and the check would
pass on a runbook it did not read. JSON runbooks and configuration files can repeat a name in one object, which RFC
8259 says leaves the result to the software that reads it.

Node has no CSV reader of its own, and this project takes no dependency.

## Decision

1. The CSV reader is the tool's own and follows RFC 4180: fields separated by commas, a field with a comma, a quote or
   a line break put in double quotes, a quote inside it written twice. A double quote inside a field that does not
   start with one, text after the closing quote of a field, and a quoted field that is never closed are refused with
   the line and column, as an `unparsable-file` finding. CRLF, LF and CR are read the same way.
2. The JSON reader is the tool's own and refuses comments, trailing commas, single quotes and a name given twice in one
   object, with the line and column.
3. A column or key the tool does not know, a record with another number of fields than the header, a phase, strategy
   or yes/no value that is none of the documented names, and a duration that is not a whole number of minutes are
   `invalid-field` findings, always errors, with a suggestion when a known name is close. Nothing is matched to a near
   name.
4. Both readers read each character once, with no recursion and no regular expression built from the input, and limit
   the records, the fields, the length of a field, the depth and the number of values.

## Consequences

- A runbook that passes was read whole: no column was dropped and no value was guessed.
- A team whose sheet uses its own phase names adds them with `phaseAliases` in the configuration, where a reviewer
  sees them.
- The same runbook written with LF or CRLF line ends, with or without a byte order mark, as UTF-8 or UTF-16 gives the
  same report, and a test reads the examples with CRLF line ends.
