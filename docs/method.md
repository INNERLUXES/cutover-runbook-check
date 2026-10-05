# Method

This document says exactly what the tool reads, how it reads each value, what each rule looks at and cannot see, how
the critical path is worked out, and how the report is built. The names used here are the defaults; docs/inputs.md
says how the configuration changes them. The tool reads one runbook as it is written. It is a check before the
migration night, not a go/no-go decision and not a certification: it runs no step and connects to no system.

## What is read

The input is one runbook and, for a CSV runbook, an application file, and if given, a configuration file. Each file is
read once, as UTF-8 or, after a UTF-16 byte order mark, as UTF-16 (docs/inputs.md).

A CSV runbook is read by the CSV reader of src/table.js
([decision 3](decisions/0003-read-csv-and-json-with-strict-readers-of-its-own.md)); its first line that holds anything
is the header, and each later line that holds anything is one step. The columns are matched to the fields of a step in
their field form. A JSON runbook is read by the JSON reader of src/json.js; it is an object with a `steps` list and an
optional `application` object. An application file is one JSON object. Every step keeps the line and column of each of
its fields, so a finding points at the value it is about; the line of a step is the line its record or object starts
on.

## How a value is read

1. **Ids.** Trimmed, and compared exactly, letter case included. An id must be 1 to 64 letters A to Z, digits, dots,
   underscores and hyphens, starting with a letter or a digit.
2. **Phases.** Compared in their word form with the phases of src/phases.js, their aliases and the `phaseAliases` of the
   configuration. A name that is none of them is an `invalid-field` finding, with a suggestion when one is close.
3. **Depends on.** A JSON list of ids, or a text with the ids separated by semicolons, commas or spaces; an id named
   twice is read once.
4. **Durations and the window.** Whole minutes from 0 to 10,080, as a number or a text of digits.
5. **Gates and the communication plan.** Yes or no (docs/inputs.md). An empty gate is no; an empty communication plan
   is missing.
6. **Strategies.** Compared in their word form with the seven strategies and their other names.
7. **Texts.** The action, the owner, the verification and the fields of the application are read with their runs of
   white space made one space. An owner or a verification that is empty or only white space is missing.

## The graph

The steps with a readable id make a graph: one node per id (the first step with it, when two share one), and one edge
from a step to each step it depends on that is in the runbook. Every walk of the graph is iterative, with no recursion,
and reads each node and edge a fixed number of times. **Dependency order** is the order of this graph: a step comes
before another when the other depends on it, directly or through others. The order of the rows of a CSV runbook and of
the objects of a JSON runbook is never used for it.

## The critical path

The critical path is the longest chain of dependencies, where each step weighs its duration when its phase is one of
the window phases (`windowPhases`: freeze, backup, migrate-data, switch and verify by default) and nothing otherwise
([decision 2](decisions/0002-measure-the-window-on-the-longest-chain-of-dependencies.md)). Before it is worked out, the
dependencies inside a cycle are left out, and a note counts them; a dependency on an unknown id is not an edge. Between
chains of the same length, the one whose steps come first in the file wins. The report lists the steps of the critical
path that count, with their minutes.

The downtime window is the `downtimeWindowMinutes` of the application. What is left of it is the window less the
critical path, and never less than zero. The rollback time is the sum of the durations of every step of the rollback
phase.

## Rules

Each finding has a rule, a level, the file, the line and column of the value it is about, the id and phase of its
step, what was found and what to change. `--explain` adds the rule, the points of the public pages it rests on, and the
tool's own choice. docs/rules-and-sources.md lists the points.

### `missing-phase`

One finding for each phase of `requiredPhases` (backup, switch, verify and rollback by default) with no step in it, at
the start of the steps: the header line of a CSV runbook, or the `steps` list of a JSON one. A step counts for a phase
when its phase, read with the aliases, is that phase.

### `change-without-rollback`

A step of the migrate-data or switch phase whose rollback step is empty, names an id that no step has, or names a step
whose phase is not the rollback phase. One finding per change step, at its rollback field. The tool cannot tell
whether the rollback step undoes the change.

### `no-backup-before-migrate`

A first data move: a migrate-data step that depends on no other migrate-data step, directly or through others. It must
depend, directly or through others, on a step of the backup phase. One finding per first data move that does not, with
the count of the steps it depends on. A later data move is covered by the backup before the first one.

### `missing-owner`

A step whose owner is empty or only white space.

### `missing-verification`

A step whose verification is empty or only white space.

### `no-go-gate`

A first switch step: a switch step that depends on no other switch step, directly or through others. A step whose gate
is yes must be among the steps it depends on, directly or through others. A gate that the switch does not depend on,
and the gate of the switch step itself, do not count.

### `unknown-dependency`

A step whose depends-on names an id that no step has. One finding per step, naming every unknown id; ids are compared
exactly. The later step of a duplicate id is checked too.

### `dependency-cycle`

Steps that depend on each other, directly or through others, so that no order can run them: a strongly connected part
of the graph of more than one step, or a step that depends on itself. One finding per cycle, at its first step in the
file, with the steps and a shortest way round the cycle.

### `duplicate-id`

A step whose id an earlier step has. Only the first step with an id is a node of the graph; each later one is
reported, at its id.

### `critical-path-over-window`

A critical path longer than the downtime window, with both numbers and the steps of the path, at the last step of the
path. Not checked when the application has no window.

### `rollback-over-window`

Rollback steps whose durations add up to more than what is left of the window after the critical path, at the first
rollback step. Not checked when the application has no window. A rollback of no minutes always fits.

### `strategy-mismatch`

A runbook of an application whose strategy is retire and that has migrate-data steps, or whose strategy is retain and
that has switch steps. One finding, at the first such step, with their count.

### `missing-application-field`

An application with no name, no strategy or no downtime window: one finding per field, at the field when it is there
and empty, else at the application. A CSV runbook given with no application file, and a JSON runbook with no
`application`, have none of them. A value that was given but could not be read is an `invalid-field` finding instead.

### `missing-business-sign-off`

An application whose `businessSignOff` is empty or not given.

### `missing-data-owner`

An application whose `dataOwner` is empty or not given.

### `no-communication-plan`

An application whose `communicationPlan` is no or not given.

### `invalid-field`

A value the tool cannot read: a step with no id or an id that is not one, no phase or a phase that is none of the
phases or their aliases, no duration or one that is not a whole number of minutes, a gate that is neither yes nor no, a
depends-on or rollback step that is not an id, a strategy that is none of the seven, a window that is not a whole
number, a communication plan that is neither yes nor no, a text field that is not a text, a column or key the tool does
not know, a column named twice, or a CSV record with another number of fields than the header. The step is still listed
with the value left empty. Always an error.

### `unreadable-file`

A runbook or application file that is over its size limit, holds binary data, is not valid UTF-8 or UTF-16 or cannot be
opened. Nothing in it is checked, and the application fields of an application file that was not read are not reported
as missing. Always an error.

### `unparsable-file`

A runbook or application file that the CSV or JSON reader refuses, a CSV runbook whose header has no id or phase
column, or a JSON runbook with no `steps` list or with more than 10,000 steps. Nothing in it is checked. Always an
error.

## The report

The findings are sorted by level, errors first, then by file (the runbook, then the application file), line, column and
the order of the rules. Findings below `minSeverity` are counted in a note and not shown; at most 500 findings of one
rule are listed, and the rest are counted in a note and still count for the result. The run fails when a finding shown
is at or above `failOn`. The same files and configuration always give the same report: no clock, no random number, no
locale, and no order taken from a hash
([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
