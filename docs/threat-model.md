# Threat model

## What the tool touches

- It reads the runbook named on the command line, the application file named with `--app` and the configuration named
  with `--config`. Nothing else is opened.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, follows no symbolic link, evaluates nothing it reads, starts no program and reads no
  clock. The actions of the steps are only text: no step is ever run.

## What the input may hold

Runbooks come from sheets, from repositories and from other teams, and in a pipeline that checks every pull request
they may be written by whoever opened the pull request. Through them, a person can try to:

- make the tool read another file or reach the network: a file named through a symbolic link, a file swapped for a link
  between the check and the read, a path written as a web address;
- exhaust the memory, the stack or the time: a file of megabytes, ten thousand steps in one long chain or in one long
  cycle, wide fans of dependencies, runs of quotes, commas or line ends, JSON nested very deep, very long values;
- move the result: a rule set to off, a required phase taken out, a phase alias that turns any step into a backup, a
  `failOn` raised to `error`, a gate that nothing depends on;
- slip in something that is not text: a binary file renamed to `.csv`, bytes that are not valid in their encoding;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators in
  a file name or in any value;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the GitHub
  format writes into a command;
- hide a formula in the CSV report: an id, an owner or an action that starts with `=`, `+`, `-` or `@`, which a
  spreadsheet may run when the report is opened;
- change how objects behave: an id, a column, a key or an alias named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read another file | A path named on the command line is looked at without following a link, and a link is refused; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle. Tests name a runbook, an application file and a configuration through links |
| The tool fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, an action is only text, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Files have size limits checked on the open handle before they are read; the CSV reader reads each character once and finds the end of a quoted field with one search; the JSON reader limits depth, values and string length; every walk of the dependency graph is iterative, with no recursion, and the steps after the backups and after the gates are found in one walk each; cycles are found with one pass of Tarjan's method; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input or the configuration; a test looks for `new RegExp` in src |
| A quote out of place moves a value into another column | The CSV reader refuses a double quote inside a field that does not start with one, text after a closing quote and a quoted field that is never closed, with the line and column; a record with another number of fields than the header is a finding |
| The result is moved through the input or the configuration | A file or a value that cannot be read is an error finding that cannot be set off; a rule set to off is named in a note; a name that is none of the phases, strategies or columns is reported, never matched to a near name; a gate counts only when the switch depends on it. Review a change to the configuration or the runbook like a change to code (docs/secure-defaults.md) |
| A binary file or bytes in another encoding are read as text | A null byte without a UTF-16 byte order mark, or bytes that are not valid UTF-8 or UTF-16, make the file an error finding; nothing in it is checked |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts escapes, direction controls and line separators in a file name and in the values, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%0A::error::` and `::error file=` into an action and an id |
| A formula runs when the CSV report is opened | A field that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote in front. The OWASP page on CSV injection says no one escape is safe in every program, so treat a report built from files you do not trust as untrusted data, and open it with formulas off |
| `__proto__` changes how objects behave | Ids are kept in maps, the readers define own properties, and names are looked up in lists or with `Object.hasOwn`. A test uses `__proto__`, `constructor` and `toString` as ids, columns, keys and aliases |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the runbook is the plan the team will follow, whether its owners, durations and checks are true, whether its
rollback steps work (docs/limits.md), who may change the runbook or the configuration in your repository, and where
your pipeline keeps the output.

A passing result is not a go/no-go decision and not a certification.
