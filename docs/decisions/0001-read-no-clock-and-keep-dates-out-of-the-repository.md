# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

A cutover runbook is tempting to tie to the calendar: the night of the cutover, a start time for each step, a change
freeze that begins on a given day, a hypercare period that ends on another, the age of the last backup test. Each of
these would make the same runbook give a different result on a different day, so a pipeline that passed yesterday could
fail today with no change to the repository, and two people reading the same commit could see two reports. The output
could never be saved and compared.

The checks do not need a date. Whether a phase has a step, whether a change step names a rollback step, whether a
backup comes before the first data move in dependency order, and whether the critical path fits the downtime window can
all be read from the runbook as it is: the window is a number of minutes, and so is each step. When the cutover is
scheduled is for the team and its change calendar, not for this tool.

## Decision

1. The tool reads no clock, no time zone and no locale. The same runbook, application file and configuration give the
   same output on every machine and on every day.
2. The runbook has no field for a date or a time of day. A duration and the downtime window are whole minutes, and
   the order of the steps comes from their dependencies, never from start times or the order of the rows.
3. No file of this repository holds a date or a number that reads like a year: not the licence, not the changelog, not
   the examples, not the documents, not the comments of the code. `npm run check` and a test fail on any number that
   reads like a year. Version numbers such as Node 22, RFC 4180 or 1.0.0 are not years and are fine, and web addresses
   that hold a year are left out of the sources.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it does
  not move with the calendar.
- A team that wants the cutover night in the runbook keeps it in the name of the file, the change ticket or the
  `action` of a step, where the tool shows it as text and reads nothing from it.
- The example runbooks carry no date, and their values are chosen so that no id, duration or count reads like a year.
