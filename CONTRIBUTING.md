# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux,
Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure
development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`,
with `!` for a breaking change.

This tool checks a cutover runbook as it is written; a passing result is not a go/no-go decision and not a certification.
A change must keep it that way: a rule reports what the runbook says or does not say, and the tool never decides whether
a move should go ahead.

## Changing a rule

1. Describe the change in docs/method.md first: what the rule looks at and what it can and cannot see, and add what it
   cannot see to docs/limits.md. Where the tool makes its own choice, say so in `own` in src/rules.js and say why.
2. Keep the rules to what is written. A finding must point at something a reader can check in a file: a field at a
   line. Never add a rule that guesses how long a step really takes or whether a rollback works.
3. A rule says what to change, in `fix` in src/rules.js, and names the points of the public pages it rests on in
   `basis`; a new page goes into src/data.js and research/sources.md.
4. A run must never pass because something could not be read: a file that cannot be read or parsed and a value that
   cannot be read are error findings, and the three rules of input problems keep no key in the configuration.
5. Add a test with the runbook written inline (`STEPS`, `stepsWith()`, `checkOf()`, `reportOf()`, `jsonRunbook()` and
   `csvRunbook()` in test/helpers.js), small enough to work out by hand, with a near miss on each side: the form that is
   reported and the form next to it that is not.
6. A rule id, once released, keeps its meaning: pipelines and other tools read it from the JSON output and the GitHub
   annotations.

## Changing the graph

1. Every walk of the dependency graph in src/graph.js uses a list of its own, never recursion, and reads each step and
   dependency a fixed number of times. A test in test/repo.test.js fails when a function of src/graph.js calls itself.
2. The order of the rows is never used for the order of the steps; only the dependencies are
   ([decision 2](docs/decisions/0002-measure-the-window-on-the-longest-chain-of-dependencies.md)).
3. A change to how the critical path is worked out gets a test of a chain of ten thousand steps with a time check.

## Changing the readers and the names

1. The CSV reader reads each character once, with no recursion and no regular expression, and refuses a quote out of
   place with the line and column ([decision 3](docs/decisions/0003-read-csv-and-json-with-strict-readers-of-its-own.md)).
   A new form gets a test of the form itself and of the same form left open or broken, and a hostile test with a time
   check.
2. A new column name, phase alias or strategy name goes into src/runbook.js or src/phases.js, docs/inputs.md and the
   README. A name is never matched to a near one; a name the tool does not know is a finding.
3. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only
   when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold
   the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
4. A file written with LF, CRLF or CR line ends, with or without a byte order mark, as UTF-8 or UTF-16, must give the
   same output. The example files are stored as written (`.gitattributes`), and a test reads them with CRLF line ends.

## Changing the configuration file

1. A new key is added to `KEYS` in src/config.js, documented in docs/inputs.md and tested with a good value and a bad
   one. Every key the tool does not know stays an error, and a key named twice stays refused.
2. Never add a key that takes a regular expression.

## Changing a source

1. Every point the reports show is in src/data.js, written in this project's own words, with the page it comes from. A
   short phrase of a page may be named; a long quotation may not.
2. research/sources.md lists every page with a note on what it says, and docs/rules-and-sources.md lists every rule
   with its points and what to change. A test checks all three against each other. Fetch and read a page before it is
   listed, and leave out a web address that holds a number that reads like a year.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device, file permissions, a character that a file name
cannot hold on every system) is guarded with `process.platform`, says why in its `t.skip`, and asserts no line of its
own: a line is asserted only in a test that runs on every system, and is worked out there with `lineOf()` of
test/helpers.js or from the text itself, never written by hand. `test/repo.test.js` fails when a guarded test asserts a
line. Every other test builds its paths with `resolve()` from names with forward slashes.

A test never reads the clock, the time zone of the machine or the locale.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files it is given and writes only to standard output and standard error. It opens no network
  connection, runs no program and evaluates nothing it reads.
- Text from the input, file names included, goes through `safeText` before it reaches the output or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No prose file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, RFC 4180,
  1.0.0) are fine.
- Examples and tests use made-up companies, applications, hosts and people, never the runbook of a real organisation.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
