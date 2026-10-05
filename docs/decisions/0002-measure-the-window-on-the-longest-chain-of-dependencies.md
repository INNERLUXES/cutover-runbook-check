# 2. Measure the window on the longest chain of dependencies

## Status

Accepted

## Context

The question a runbook must answer before a migration night is whether the work fits the downtime window, and whether
a rollback still fits after it. Adding up every step overstates the time, because steps that do not depend on each
other run side by side. Reading start times from a sheet trusts numbers someone typed and that drift as the plan
changes. Following the order of the rows trusts the order the sheet happens to be sorted in.

The pages behind the checks ask for each task with its owner, its sequence and its planned time, for the downtime to be
weighed against the cost of an overrun, and for the time a rollback takes to be known (docs/rules-and-sources.md).
The dependencies of the steps are the sequence, written once, and the durations are the time.

## Decision

1. The critical path is the longest chain of dependencies in the runbook, weighted by the durations of its steps. It is
   worked out from the depends-on ids alone, never from the order of the rows or from times of day.
2. Only the steps of the window phases count (`windowPhases`; by default freeze, backup, migrate-data, switch and
   verify). Preparation runs before the window, hypercare after it, and the rollback steps run only when a change is
   undone, so they add nothing to the path.
3. A dependency on an id that is not in the runbook is reported and left out. The dependencies inside a cycle are
   reported, left out, and counted in a note, so the rest of the runbook still gets a critical path.
4. The rollback time is the sum of every rollback step, as if all of them ran one after the other, and is compared with
   what is left of the window after the critical path. The tool does not guess which rollback steps would run for which
   failure.
5. Every walk of the graph is iterative and reads each step and dependency a fixed number of times, so a runbook of ten
   thousand steps in one chain, or with wide fans of dependencies, is checked in seconds.

## Consequences

- A runbook whose steps run side by side is not reported as too long, and one whose rows are sorted by owner or phase
  gives the same result as one sorted by time.
- A step with no dependency starts at the start of the window. A team that runs it later must say so with a dependency.
- The sum of the rollback steps is a cautious figure; a runbook whose rollback paths are short but many may be reported
  when one path alone would fit. The finding gives both numbers, so a reader can judge.
- The critical path is listed in every report, so a reader can check it against the plan.
