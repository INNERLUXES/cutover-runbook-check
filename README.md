# cutover-runbook-check

Application migration cutover runbook check for teams that move applications to the cloud or to new platforms. Give
it the runbook of one application, the checklist the team follows on migration day, as JSON or as CSV saved from a
sheet, and it reports what is missing or risky before the move: a required phase with no step, a change with no
rollback step, no backup before the first data move, a step with no owner or no check of success, no go/no-go gate
before the switch, a dependency on a step that is not there, steps that depend on each other in a cycle, two steps with
one id, a critical path longer than the downtime window, a rollback that does not fit in what is left of it, a
migration strategy that does not match the steps, and a missing business sign-off, data owner or communication plan.
It sums up the minutes of each phase, lists the critical path, and exits with a code a pipeline can act on.

**It is a check before the migration night, not a go/no-go decision and not a certification.** It reads what the
runbook says. It runs no step and connects to no system, and it cannot tell whether an owner, a duration or a rollback
step is true.

A cutover runbook is where a migration plan meets the clock: who does what, in which order, for how long, how each step
is checked, and how each change is undone. AWS Prescriptive Guidance describes a cutover as a freeze, a final backup
kept for a rollback, a final data sync, the routing change and testing, and asks for rollback checkpoints and a person
who decides
(https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html). The
Microsoft Cloud Adoption Framework asks for the downtime window, the rollback steps and go/no-go review points to be
written down and approved before the move
(https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration). This tool reads the runbook
on every change and says where it falls short of that.

- **One check per gap.** Sixteen rules, each with what it looks at, what it cannot see, the public pages it rests on
  and what to change, and three rules of input problems that are always errors.
- **The window in minutes.** The critical path is the longest chain of dependencies over the steps of the downtime
  phases, never the order of the rows; it is compared with the downtime window, and the rollback with what is left.
- **The 7 Rs.** Rehost, replatform, refactor, repurchase, retire, retain and relocate, with their other names; a retired
  application that moves data, or a retained one that switches, is reported.
- **Strict readers.** CSV as RFC 4180 writes it and JSON as RFC 8259 writes it, with no dependency; a quote out of
  place, a repeated name, a column or a phase the tool does not know is reported with its line, never guessed.
- Reports as text, JSON, CSV with one row per finding and GitHub workflow annotations, with an exit code for a
  pipeline: `0` no finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network; the same files always give the same report.

```
npm test
```

```
tests 122
pass 119
fail 0
skipped 3
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link, a device or file permissions (a runbook, an application file and a configuration named through a
symbolic link, `/dev/zero` named as an input, and a runbook with no read access); they are guarded with
`process.platform`, run on Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same
tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/cutover-runbook-check.git
cd cutover-runbook-check
node bin/cutover-runbook-check.js examples/messy/runbook.csv --app examples/messy/application.json --config examples/config.json
```

Or without a clone, on your own runbook:

```
npx --yes github:INNERLUXES/cutover-runbook-check cutover/runbook.csv --app cutover/application.json
```

`examples/` holds two made-up runbooks. `examples/messy/` is the claims portal of an insurer, saved from a sheet as CSV
with its application file: no verify and no hypercare step, two preparation steps that depend on each other, two steps
with one id, a backup that runs beside the first data move instead of before it, a go/no-go call that the switch does
not depend on, a data move with no rollback step, rollback steps that are not there or not in the rollback phase, a
dependency on a step that is not there, a critical path of 200 minutes for a window of 180, a step with no owner,
steps with no check, no business sign-off, no communication plan, and the strategy "Decommission" on a runbook that
moves data. It also holds what must not be reported: phase names written in other ways, an alias that
`examples/config.json` adds, `Y` and `N` for the gate, and a named data owner. `examples/clean/` is the order desk of a
seed merchant as a JSON runbook, in good order.

## Usage

```
cutover-runbook-check <runbook.json | runbook.csv> [--app <file>] [--config <file>] [options]
```

```
--app <file>              the application file of a CSV runbook: JSON with name, strategy, downtimeWindowMinutes,
                          dataOwner, businessSignOff and communicationPlan
--config <file>           settings in strict JSON: rules, requiredPhases, windowPhases, phaseAliases, minSeverity
                          and failOn (--print-defaults shows them)
--format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                          workflow commands that GitHub shows as annotations
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: minSeverity of
                          the configuration, else info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: failOn of
                          the configuration, else error)
--explain                 show the rule, the public sources and the tool's own choice behind each finding
--print-defaults          print the built-in configuration and exit
--help                    show the usage
--version                 show the version
```

One runbook per run. The path in the report is relative to the folder you run the command in, with forward slashes on
every system, followed by the line.

The report of the messy example starts with what was read, the configuration, the rules, the application, the steps in
one line and the count of findings; then the minutes of each phase, the critical path and every step; then the
findings, errors first, each with what to change:

```
cutover-runbook-check: examples/messy/runbook.csv
input: runbook examples/messy/runbook.csv (CSV, UTF-8, 15 steps); application file examples/messy/application.json (JSON, UTF-8)
config: examples/config.json (Brindlecombe cutover review): required phases backup, switch, verify, rollback and hypercare; window phases freeze, backup, migrate-data, switch and verify; 1 phase alias from the configuration; minimum severity info; fail on error
rules: missing-phase (error); change-without-rollback (error); no-backup-before-migrate (error); missing-owner (warning); missing-verification (warning); no-go-gate (error); unknown-dependency (error); dependency-cycle (error); duplicate-id (error); critical-path-over-window (error); rollback-over-window (warning); strategy-mismatch (warning); missing-application-field (warning); missing-business-sign-off (warning); missing-data-owner (warning); no-communication-plan (error); invalid-field (error); unreadable-file (error); unparsable-file (error)
application: Brindlecombe Claims Portal; strategy retire (given as "Decommission"); downtime window 180 minutes; data owner Claims Operations (Hal Mercer); business sign-off none; communication plan no
steps: 15 in 6 phases, 390 minutes in all; critical path 200 minutes over 5 steps; downtime window 180 minutes, 0 minutes left after the critical path; rollback 85 minutes
findings: 18 (12 error, 6 warning)

Phases (8)

  phase         steps  minutes  window  required
  prepare       4      50       no      no
  freeze        3      25       yes     no
  backup        1      40       yes     yes
  migrate-data  2      165      yes     no
  switch        2      25       yes     yes
  verify        0      0        yes     yes
  rollback      3      85       no      yes
  hypercare     0      0        no      yes

Critical path (5 steps, 200 minutes)

  step  phase         minutes  action
  F1    freeze        10       Stop the nightly claims import job
  M1    migrate-data  120      Copy the claims database to the target server
  M2    migrate-data  45       Copy the document store to the target file share
  S1    switch        15       Point claims.brindlecombe.test at the target load balancer
  S2    switch        10       Start the claims import job on the target

Steps (15)

  step  phase         minutes  gate  depends on  rollback  owner                         line
  P1    prepare       30       -     -           -         Infrastructure (Ines Varga)   2
  P2    prepare       10       -     P1          -         -                             3
  P3    prepare       5        -     P4          -         Service desk (Tom Achebe)     4
  P4    prepare       5        -     P3          -         Service desk (Tom Achebe)     5
  F1    freeze        10       -     P1          -         Operations (Dana Pryce)       6
  F1    freeze        5        -     P1          -         Operations (Dana Pryce)       7
  B1    backup        40       -     F1          -         Database team (Ravi Osei)     8
  G1    freeze        10       yes   B1          -         Claims lead (Hal Mercer)      9
  M1    migrate-data  120      -     F1          R1        Database team (Ravi Osei)     10
  M2    migrate-data  45       -     M1          -         Storage team (Ama Lindqvist)  11
  S1    switch        15       -     M2, S99     R7        Network team (Lee Marsh)      12
  S2    switch        10       -     S1          P1        Operations (Dana Pryce)       13
  R1    rollback      60       -     M1          -         Database team (Ravi Osei)     14
  R2    rollback      15       -     R1          -         Network team (Lee Marsh)      15
  R3    rollback      10       -     R2          -         Operations (Dana Pryce)       16

Findings (18)

  ERROR    missing-phase              examples/messy/runbook.csv:1
           the runbook has no step in the verify phase, which is required (backup, switch, verify, rollback and hypercare)
           fix: add the steps of the phase, each with an owner, a duration and how its success is checked

  ERROR    missing-phase              examples/messy/runbook.csv:1
           the runbook has no step in the hypercare phase, which is required (backup, switch, verify, rollback and hypercare)
           fix: add the steps of the phase, each with an owner, a duration and how its success is checked

  ERROR    dependency-cycle           examples/messy/runbook.csv:4
           the steps "P3" and "P4" depend on each other in a cycle (P3 -> P4 -> P3), so no order can run them
           fix: break the cycle: decide which step comes first and take the other dependency out

  ERROR    duplicate-id               examples/messy/runbook.csv:7
           the step id "F1" is used again; the step at examples/messy/runbook.csv:6 has it first, and only that one is used for the dependencies
           fix: give every step its own id

  ERROR    no-backup-before-migrate   examples/messy/runbook.csv:10
           the migrate-data step "M1" is a first data move, and no backup step comes before it: none of the 2 steps it depends on, directly or through others, is in the backup phase
           fix: make the first data move depend on a backup step, and test the restore of that backup before the cutover

  ERROR    change-without-rollback    examples/messy/runbook.csv:11
           the migrate-data step "M2" changes something and names no rollback step
           fix: name a step of the rollback phase that undoes this change, and add it to the runbook if it is not there

  ERROR    no-go-gate                 examples/messy/runbook.csv:12
           the switch step "S1" starts the switch phase, and no go/no-go gate comes before it: none of the 4 steps it depends on, directly or through others, is a gate
           fix: add a go/no-go gate step that the switch depends on, and name who decides and on what criteria

  ERROR    unknown-dependency         examples/messy/runbook.csv:12
           the step "S1" depends on "S99", which is not in the runbook
           fix: correct the id, or add the step it names

  ERROR    change-without-rollback    examples/messy/runbook.csv:12
           the switch step "S1" names the rollback step "R7", which is not in the runbook
           fix: name a step of the rollback phase that undoes this change, and add it to the runbook if it is not there

  ERROR    critical-path-over-window  examples/messy/runbook.csv:13
           the critical path takes 200 minutes, 20 more than the downtime window of 180 minutes: F1 10, M1 120, M2 45, S1 15, S2 10
           fix: shorten or split the steps on the critical path, run steps side by side where they do not depend on each other, or agree a longer window

  ERROR    change-without-rollback    examples/messy/runbook.csv:13
           the switch step "S2" names "P1" as its rollback step, but "P1" is a prepare step, not a step of the rollback phase
           fix: name a step of the rollback phase that undoes this change, and add it to the runbook if it is not there

  ERROR    no-communication-plan      examples/messy/application.json:7
           the communication plan of the application is no
           fix: plan who tells users and support teams about the outage, when, and how they hear that it is over or rolled back

  WARNING  missing-owner              examples/messy/runbook.csv:3
           the step "P2" has no owner
           fix: name the person or team who runs the step and answers for it

  WARNING  missing-verification       examples/messy/runbook.csv:3
           the step "P2" does not say how its success is checked
           fix: write how success is checked: a count that matches, a health check that answers, or a test that passes

  WARNING  strategy-mismatch          examples/messy/runbook.csv:10
           the strategy is retire (given as "Decommission"), but the runbook moves data in 2 migrate-data steps; a retired application is shut down, not moved
           fix: correct the strategy of the application, or take the steps out of the runbook

  WARNING  rollback-over-window       examples/messy/runbook.csv:14
           the 3 rollback steps take 85 minutes in all, more than the 0 minutes left of the downtime window of 180 minutes after the critical path of 200 minutes
           fix: plan a rollback that fits what is left of the window, set the go/no-go point early enough that a rollback still fits, or agree a longer window

  WARNING  missing-verification       examples/messy/runbook.csv:16
           the step "R3" does not say how its success is checked
           fix: write how success is checked: a count that matches, a health check that answers, or a test that passes

  WARNING  missing-business-sign-off  examples/messy/application.json:6
           no business sign-off is named for the application
           fix: name the business owner who signs off the cutover and the rollback plan

note: 2 dependencies inside a cycle are left out of the critical path

This check reads the runbook as it is written. It runs no step and connects to no system, and a passing result is not a go/no-go decision and not a certification (docs/limits.md).

RESULT: FAIL - 12 findings at or above error (12 error, 6 warning)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and the tool's own
choice:

```
  ERROR    no-go-gate                 examples/messy/runbook.csv:12
           the switch step "S1" starts the switch phase, and no go/no-go gate comes before it: none of the 4 steps it depends on, directly or through others, is a gate
           fix: add a go/no-go gate step that the switch depends on, and name who decides and on what criteria
           rule: a first switch step with no go/no-go gate among the steps it depends on, directly or through others
           basis: stakeholders approve the plan and the rollback steps in writing, the authority to roll back is named, and review points are set for go/no-go decisions (Plan your migration (Microsoft Cloud Adoption Framework), https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration)
           basis: a rollback plan names the checkpoints whose criteria start a rollback, how the rollback treats the data, and the person who decides to fix forward or roll back (Cutover stage (AWS Prescriptive Guidance, migration cutover), https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html)
           the tool's own choice: a switch step that depends on no other switch step starts the switch phase, and a step with the gate set to yes must be among the steps it depends on, directly or through others; a gate that the switch does not depend on does not count

```

The clean example passes:

```
cutover-runbook-check: examples/clean/runbook.json
input: runbook examples/clean/runbook.json (JSON, UTF-8, 10 steps); no application file
config: built-in defaults: required phases backup, switch, verify and rollback; window phases freeze, backup, migrate-data, switch and verify; minimum severity info; fail on error
rules: missing-phase (error); change-without-rollback (error); no-backup-before-migrate (error); missing-owner (warning); missing-verification (warning); no-go-gate (error); unknown-dependency (error); dependency-cycle (error); duplicate-id (error); critical-path-over-window (error); rollback-over-window (warning); strategy-mismatch (warning); missing-application-field (warning); missing-business-sign-off (warning); missing-data-owner (warning); no-communication-plan (warning); invalid-field (error); unreadable-file (error); unparsable-file (error)
application: Ostrander Seed Order Desk; strategy replatform; downtime window 240 minutes; data owner Sales Operations (Mina Holt); business sign-off Head of Sales (Piet Quarles); communication plan yes
steps: 10 in 8 phases, 290 minutes in all; critical path 135 minutes over 6 steps; downtime window 240 minutes, 105 minutes left after the critical path; rollback 15 minutes
findings: 0

Phases (8)

  phase         steps  minutes  window  required
  prepare       1      20       no      no
  freeze        1      10       yes     no
  backup        1      25       yes     yes
  migrate-data  1      60       yes     no
  switch        1      10       yes     yes
  verify        2      30       yes     yes
  rollback      2      15       no      yes
  hypercare     1      120      no      no

Critical path (6 steps, 135 minutes)

  step  phase         minutes  action
  F1    freeze        10       Put the order desk in read-only mode
  B1    backup        25       Take a full backup of the order database
  M1    migrate-data  60       Copy the order database to the managed database service
  G1    verify        10       Go/no-go: the business lead confirms the data checks
  S1    switch        10       Point orders.ostrander.test at the new app service
  V1    verify        20       Place and cancel a test order end to end

Steps (10)

  step  phase         minutes  gate  depends on  rollback  owner                         line
  P1    prepare       20       -     -           -         Platform team (Mina Holt)     11
  F1    freeze        10       -     P1          -         Operations (Joss Ferrand)     12
  B1    backup        25       -     F1          -         Database team (Uma Castell)   13
  M1    migrate-data  60       -     B1          R2        Database team (Uma Castell)   14
  G1    verify        10       yes   M1          -         Head of Sales (Piet Quarles)  15
  S1    switch        10       -     G1          R1        Network team (Ike Brannigan)  16
  V1    verify        20       -     S1          -         Sales Operations (Mina Holt)  17
  R1    rollback      10       -     S1          -         Network team (Ike Brannigan)  18
  R2    rollback      5        -     R1          -         Operations (Joss Ferrand)     19
  H1    hypercare     120      -     V1          -         Service desk (Rhea Dunmore)   20

Findings (0)

  none

This check reads the runbook as it is written. It runs no step and connects to no system, and a passing result is not a go/no-go decision and not a certification (docs/limits.md).

RESULT: PASS - no finding at or above error
```

## How a runbook is read

1. The runbook is read as UTF-8 or UTF-16, then by the tool's own CSV or JSON reader, which refuses a quote out of place
   or a repeated name with the line and column.
2. Each step is read with its id, phase, action, owner, dependencies, duration, gate, check and rollback step; the
   columns of a CSV runbook are matched by their names in any order, and phases and strategies by their documented
   names and aliases. A value that cannot be read is a finding, and the step is still listed.
3. The steps make a graph of their dependencies. Cycles are found, and the critical path is the longest chain over the
   steps of the window phases, walked with no recursion.
4. The rules look at each step, at the chain before the first data move and the first switch, and at the application.

[docs/method.md](docs/method.md) gives the details, and
[decision 2](docs/decisions/0002-measure-the-window-on-the-longest-chain-of-dependencies.md) says why the window is
measured on the dependencies and not on the rows.

## What it reports

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `missing-phase` | `rules.missingPhase` | error | a required phase (backup, switch, verify, rollback by default) with no step |
| `change-without-rollback` | `rules.changeWithoutRollback` | error | a migrate-data or switch step with no rollback step, an unknown one, or one outside the rollback phase |
| `no-backup-before-migrate` | `rules.noBackupBeforeMigrate` | error | a first data move with no backup step before it in dependency order |
| `missing-owner` | `rules.missingOwner` | warning | a step with no owner |
| `missing-verification` | `rules.missingVerification` | warning | a step that does not say how its success is checked |
| `no-go-gate` | `rules.noGoGate` | error | a first switch step with no go/no-go gate before it in dependency order |
| `unknown-dependency` | `rules.unknownDependency` | error | a step that depends on an id no step has |
| `dependency-cycle` | `rules.dependencyCycle` | error | steps that depend on each other, with the way round the cycle |
| `duplicate-id` | `rules.duplicateId` | error | a step whose id an earlier step has |
| `critical-path-over-window` | `rules.criticalPathOverWindow` | error | a critical path longer than the downtime window, with both numbers |
| `rollback-over-window` | `rules.rollbackOverWindow` | warning | rollback steps that take longer than what is left of the window |
| `strategy-mismatch` | `rules.strategyMismatch` | warning | a retired application that moves data, or a retained one that switches |
| `missing-application-field` | `rules.missingApplicationField` | warning | no application name, strategy or downtime window |
| `missing-business-sign-off` | `rules.missingBusinessSignOff` | warning | no business sign-off person |
| `missing-data-owner` | `rules.missingDataOwner` | warning | no data owner |
| `no-communication-plan` | `rules.noCommunicationPlan` | warning | a communication plan of no, or none |
| `invalid-field` | none | error | a value, column or key the tool cannot read |
| `unreadable-file` | none | error | a file that cannot be read as UTF-8 or UTF-16 text |
| `unparsable-file` | none | error | a file the CSV or JSON reader refuses, or a runbook with no id or phase column or no steps list |

The three rules of input problems are always errors. [docs/method.md](docs/method.md) says exactly what each rule looks
at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public
pages each rule rests on.

## Phases and strategies

The phases of `src/phases.js`, in the order a cutover runs them; `phaseAliases` in the configuration adds names.

| Phase | Holds | Some of its aliases |
| --- | --- | --- |
| `prepare` | work done before the downtime starts | `preparation`, `pre-cutover` |
| `freeze` | the source stops changing | `change-freeze`, `quiesce` |
| `backup` | the final backup, kept for a rollback | `back-up`, `snapshot` |
| `migrate-data` | the final copy or sync of the data | `data-migration`, `data-sync` |
| `switch` | users and traffic move to the target | `cutover`, `go-live` |
| `verify` | the checks that the move worked | `validation`, `smoke-test` |
| `rollback` | the steps that undo a change | `back-out`, `fallback` |
| `hypercare` | the closer support after the move | `post-cutover`, `stabilization` |

The steps of `migrate-data` and `switch` change something and need a rollback step. The window phases, whose steps
count on the critical path, are freeze, backup, migrate-data, switch and verify by default.

| Strategy | Some of its other names | What the tool does with it |
| --- | --- | --- |
| `rehost` | `lift-and-shift` | nothing more |
| `replatform` | `lift-and-reshape` | nothing more |
| `refactor` | `re-architect`, `rebuild` | nothing more |
| `repurchase` | `replace`, `drop-and-shop` | nothing more |
| `retire` | `decommission` | a migrate-data step is a `strategy-mismatch` |
| `retain` | `keep` | a switch step is a `strategy-mismatch` |
| `relocate` | `re-locate` | nothing more |

[docs/inputs.md](docs/inputs.md) lists every alias and other name.

## What is not checked

The tool reads what the runbook says and never guesses. It does not:

- run a step, connect to a system, or read a ticket, a schedule or a monitoring tool;
- tell whether an owner, a duration or a check is true, or whether a rollback step undoes its change;
- read times of day or the order of the rows: the order is the dependencies, and steps that do not depend on each
  other run in parallel;
- work out which rollback steps a given failure would need: the rollback time is the sum of all of them;
- see a gate that the switch does not depend on, or a name of a phase it does not know;
- decide whether the move goes ahead: it is not a go/no-go decision and not a certification.

So a clean run means the runbook holds none of the problems the rules look for, and every report says so.

## The runbook

A JSON runbook holds its application in a header and its steps in a list:

```json
{
  "application": { "name": "Order Desk", "strategy": "replatform", "downtimeWindowMinutes": 240, "dataOwner": "Sales Operations", "businessSignOff": "Head of Sales", "communicationPlan": true },
  "steps": [
    { "id": "M1", "phase": "migrate-data", "action": "Copy the database", "owner": "Database team", "dependsOn": ["B1"], "durationMinutes": 60, "gate": false, "verification": "Row counts match", "rollbackStep": "R2" }
  ]
}
```

A CSV runbook has a header line and one record per step, with the application in a JSON file named with `--app`:

```
id,phase,action,owner,depends-on,duration,gate,verification,rollback
M1,migrate-data,Copy the database,Database team,B1,60,no,Row counts match,R2
```

The columns may be in any order and named in other ways (`Step ID`, `Depends On`, `Duration (min)`, `Go/No-Go`); the
`id` and `phase` columns are required. Depends-on holds ids separated by semicolons, commas or spaces, durations and
the window are whole minutes, and a gate is yes or no. [docs/inputs.md](docs/inputs.md) lists every field, column name
and value.

## The configuration file

```json
{
  "name": "Brindlecombe cutover review",
  "requiredPhases": ["backup", "switch", "verify", "rollback", "hypercare"],
  "phaseAliases": { "Snapshot and Seal": "backup" },
  "rules": { "noCommunicationPlan": "error" }
}
```

Every key is optional, and without `--config` the defaults apply. `rules` sets the level of each rule (`info`,
`warning`, `error` or `off`), `requiredPhases` the phases that must each have a step, `windowPhases` the phases whose
steps count on the critical path, `phaseAliases` adds names of phases, `minSeverity` sets the lowest level shown and
`failOn` the lowest level that fails the run. A key the tool does not know is an error with its line and a suggestion,
and a key named twice is refused. [docs/inputs.md](docs/inputs.md) describes every key, and `--print-defaults` writes
the whole default configuration out.

## Formats

- `text`: for a terminal: what was read, the configuration, the rules, the application, the steps in one line, the
  minutes of each phase, the critical path, every step, the findings with the file and line and what to change, the
  notes, the notice and the result. With `--explain` also the rule, the points of the public pages and the tool's own
  choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the application, the summary with the phases
  and the critical path, every step with its fields and findings, every finding with its file, line, column and step,
  the totals, the result, the notes and the notice.
- `csv`: one record per finding, ready for a sheet: the level, the rule, the file, the line, the column, the step, the
  phase, what was found and what to change, with CRLF line ends as RFC 4180 writes. A field that a spreadsheet could
  read as a formula gets a single quote in front. The start of the messy example:

```
level,rule,file,line,column,step,phase,found,fix
error,missing-phase,examples/messy/runbook.csv,1,1,,,"the runbook has no step in the verify phase, which is required (backup, switch, verify, rollback and hypercare)","add the steps of the phase, each with an owner, a duration and how its success is checked"
error,missing-phase,examples/messy/runbook.csv,1,1,,,"the runbook has no step in the hypercare phase, which is required (backup, switch, verify, rollback and hypercare)","add the steps of the phase, each with an owner, a duration and how its success is checked"
error,dependency-cycle,examples/messy/runbook.csv,4,71,P3,prepare,"the steps ""P3"" and ""P4"" depend on each other in a cycle (P3 -> P4 -> P3), so no order can run them",break the cycle: decide which step comes first and take the other dependency out
```

- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` (for info) with the file, line and
  column, which GitHub shows as an annotation in the pull request, then a summary line. The characters a command gives
  a meaning to are escaped. Two findings of the messy example:

```
::error file=examples/messy/runbook.csv,line=4,col=71,title=cutover-runbook-check dependency-cycle::the steps "P3" and "P4" depend on each other in a cycle (P3 -> P4 -> P3), so no order can run them; fix: break the cycle: decide which step comes first and take the other dependency out
::error file=examples/messy/runbook.csv,line=13,col=1,title=cutover-runbook-check critical-path-over-window::the critical path takes 200 minutes, 20 more than the downtime window of 180 minutes: F1 10, M1 120, M2 45, S1 15, S2 10; fix: shorten or split the steps on the critical path, run steps side by side where they do not depend on each other, or agree a longer window
```

## Exit codes

`0`: no finding at or above the fail-on level (`error` by default). `1`: at least one finding at or above it; with the
default, a missing required phase, a change step with no rollback step, no backup before the first data move, no gate
before the switch, an unknown dependency, a cycle, a duplicate id, a critical path over the window, or a file or value
the tool could not read; with `--fail-on warning`, missing owners and checks, a rollback over the window, a strategy
mismatch and missing application fields too. `2`: a usage or input error: no runbook named, two runbooks named, an
unknown option, an option given twice, `--explain` with the csv or github format, a URL in place of a path, a path that
cannot be read, a symbolic link, a file whose name does not end in `.json` or `.csv`, `--app` with a JSON runbook, or a
configuration with an unknown key, a key named twice or a value of the wrong kind. With exit code `2` the tool gives no
result and prints the problems on standard error.

## Limits

The tool reads files; it does not run a step, connect to a system or track time. A run reports what the runbook holds
in the forms of docs/method.md. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 16 MB
for a runbook, 10,000 steps, 200 dependencies per step, 500 findings listed per rule.
[docs/threat-model.md](docs/threat-model.md) lists the risks of reading runbooks from a pull request and their controls,
and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration, the runbook and the application file, and builds the report of the run |
| `src/files.js`, `src/kinds.js` | the bounded reading of files with no link followed, UTF-8 and UTF-16, and the kind of each file |
| `src/table.js`, `src/json.js` | the strict CSV and JSON readers |
| `src/runbook.js` | the steps and the application of a runbook, and the values that cannot be read |
| `src/phases.js` | the phases, the strategies, their other names and the yes and no values, as a documented data file |
| `src/graph.js` | the graph of the dependencies: ancestors, cycles and the longest chain, with no recursion |
| `src/review.js` | the rules across the steps and the application, and the summary of the phases |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults |
| `src/rules.js` | the rules, their levels and the result |
| `src/report.js`, `src/csv.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON, CSV and GitHub output, the cleaning of text from the input, number formats and compared words |
| `src/data.js` | the public pages and the points the rules rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| The seven migration strategies, and what retire and retain mean | AWS Prescriptive Guidance, https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html |
| The strategies of the Cloud Adoption Framework | Microsoft Learn, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/plan/select-cloud-migration-strategy |
| The kinds of migration of the Google Cloud guide | Google Cloud, https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started |
| A runbook of tasks with owners, sequence and times; downtime and rollback time | AWS Prescriptive Guidance, https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/pre-cutover-stage.html |
| The phases of a cutover, and a rollback plan with checkpoints and a decider | AWS Prescriptive Guidance, https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html |
| Dependencies, the downtime window, rollback criteria, approval and go/no-go points | Microsoft Learn, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration |
| Communication, change freeze, checks, fallback and stabilization | Microsoft Learn, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration |
| Approval before the source is shut down | Microsoft Learn, https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/decommission-source-workload |
| A rollback strategy for each step, and downtime tolerance | Google Cloud, https://docs.cloud.google.com/architecture/migration-to-google-cloud-best-practices |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object, and UTF-8 | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Formulas hidden in CSV files | OWASP, https://community.owasp.org/attacks/CSV_Injection |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

Most migrations that go wrong on the night do not fail for lack of a tool; they fail on a step nobody owned, a backup
taken after the data had already moved, a rollback that needed more time than the window had left, or a switch made
before anyone said go. Those gaps are visible in the runbook long before the night, if someone reads it with them in
mind on every change. How such moves are planned and run is described on the page
[Application Migration Consulting Services](https://innerluxes.dev/application/migration/services).

## License

MIT
