# Limits

The tool reads one cutover runbook as it is written: its steps with their phases, owners, dependencies, durations,
gates, checks and rollback steps, and the application they belong to. It is a check to run before the migration night,
not a go/no-go decision and not a certification. It runs no step, connects to no system, and asks nobody anything. A
finding points at something in a file; a run without findings says only that the runbook holds none of the problems of
docs/method.md. Every report ends with a sentence that says so.

## What it cannot see

- **Whether a step is right.** The tool reads that a step has an owner, a duration and a check; it cannot tell whether
  the owner knows, the duration is honest or the check proves anything. A runbook with every field filled can still be
  wrong.
- **Whether a rollback works.** It reads that a change step names a step of the rollback phase; it cannot tell whether
  that step undoes the change, whether the backup restores, or how long a restore with the new data takes. The pages
  behind the checks ask for rollback steps to be tested; the tool cannot test them.
- **The real time.** The critical path is the longest chain of dependencies over the durations written down
  ([decision 2](decisions/0002-measure-the-window-on-the-longest-chain-of-dependencies.md)). A step with no
  dependency starts at the start of the window, steps that do not depend on each other run in parallel, and nothing is
  read from the order of the rows or from times of day. Waiting, hand-overs between teams and the time to decide at a
  gate count only when they are steps.
- **Which rollback steps would run.** The rollback time is the sum of every rollback step; the tool does not work out
  which steps a given failure would need.
- **A gate that is not in the chain.** A go/no-go gate counts only when the first switch step depends on it, directly
  or through others. A gate written as a meeting that nothing depends on is not seen.
- **Names it does not know.** A phase, strategy, column or yes/no value that is none of the documented names is an
  `invalid-field` finding; the tool never matches it to a near name. Add the names of your team with `phaseAliases`.
- **The plan around the runbook.** The schedule, the change ticket, the approvals that were given, the people on call,
  the monitoring and the communication itself are not read. The application file says whether there is a
  communication plan and who signs off; the tool cannot tell whether either is real.
- **Time.** The tool reads no clock and no dates
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)); the runbook has no field for a
  date.
- **Other formats.** A spreadsheet file (`.xlsx`), a project plan or a ticket export is not read; save the runbook as
  CSV or write it as JSON.

## The readers

- The CSV reader follows RFC 4180 and refuses a quote out of place with the line and column
  ([decision 3](decisions/0003-read-csv-and-json-with-strict-readers-of-its-own.md)). Lines that hold nothing are left
  out.
- The JSON reader follows RFC 8259 and refuses comments, trailing commas, single quotes and a name given twice in one
  object.
- A file is read as UTF-8, with or without a byte order mark, or as UTF-16 after its byte order mark. A UTF-16 file
  without a byte order mark holds null bytes and is an `unreadable-file` finding.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, the file is an error finding, or, where the limit
is on the work and not the input, the report says so in a note.

| What | Limit |
| --- | --- |
| a runbook | 16 MB; a larger file is an `unreadable-file` finding |
| an application file or a configuration | 1 MB |
| steps in a runbook | 10,000; more is an `unparsable-file` finding |
| fields in a CSV record | 64 |
| characters in a CSV field or a JSON string | 4,096 |
| ids a step depends on | 200 |
| a duration or the downtime window | 10,080 minutes |
| JSON nesting | 32 deep |
| `phaseAliases` | 200 names |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests check a chain of ten thousand steps and a cycle of ten thousand, three thousand steps each on up to two
hundred others, runs of hundreds of thousands of quotes, commas and line ends, and JSON nested a hundred thousand deep,
each with a time check.
