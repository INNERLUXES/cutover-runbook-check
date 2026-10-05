# Inputs

## The files

```
cutover-runbook-check <runbook.json | runbook.csv> [--app <file>] [--config <file>] [options]
```

One runbook per run: the cutover runbook of one application, as JSON or as CSV. A runbook is read when its name ends in
`.json` or `.csv`, compared without regard to case. A JSON runbook holds the application in its header; a CSV runbook
takes the application from a JSON file named with `--app`, and without one, the fields of the application are reported
as missing. Naming `--app` with a JSON runbook stops the run.

```
cutover-runbook-check runbook.json
cutover-runbook-check runbook.csv --app application.json
cutover-runbook-check runbook.csv --app application.json --config cutover.json --format github
```

A file is read as UTF-8, with or without a byte order mark, or as UTF-16 little or big endian when it starts with the
byte order mark of UTF-16, which is how some spreadsheet programs save CSV. LF, CR LF and CR line ends give the same
report.

## The steps

Each step has these fields. In a JSON runbook they are the keys of a step object; in a CSV runbook they are the columns
named in the header line, in any order, compared in their field form (the letters A to Z lowered and everything else
taken out, so `Depends On`, `depends_on` and `dependsOn` are one name).

| Field | JSON key | CSV column names | Value |
| --- | --- | --- | --- |
| id | `id` | `id`, `stepid`, `step` | 1 to 64 letters A to Z, digits, dots, underscores and hyphens, starting with a letter or a digit; compared exactly |
| phase | `phase` | `phase`, `stage` | one of the phases below or an alias of one |
| action | `action` | `action`, `task`, `description` | a text |
| owner | `owner` | `owner`, `responsible`, `assignee` | a text |
| depends on | `dependsOn` | `dependson`, `dependencies`, `depends`, `predecessors` | ids; a JSON list, or a text with the ids separated by semicolons, commas or spaces; up to 200 |
| duration | `durationMinutes` | `durationminutes`, `duration`, `minutes`, `durationmin`, `mins` | a whole number of minutes from 0 to 10,080 (a week), as a number or a text of digits |
| go/no-go gate | `gate` | `gate`, `gonogo`, `gonogogate` | yes or no (below); empty is no |
| verification | `verification` | `verification`, `verify`, `validation`, `successcheck` | a text: how success is checked |
| rollback step | `rollbackStep` | `rollbackstep`, `rollback`, `rollbackid`, `backout` | the id of the step that undoes this one; needed for a migrate-data or switch step |

The `id` and `phase` columns must be in the header line of a CSV runbook; the others may be left out and are then
empty. A text is read with its runs of white space made one space. A step with a value the tool cannot read is still
listed, with that value left empty, and the value is an `invalid-field` finding.

A JSON runbook:

```json
{
  "application": {
    "name": "Order Desk",
    "strategy": "replatform",
    "downtimeWindowMinutes": 240,
    "dataOwner": "Sales Operations",
    "businessSignOff": "Head of Sales",
    "communicationPlan": true
  },
  "steps": [
    { "id": "B1", "phase": "backup", "action": "Back up the order database", "owner": "Database team", "dependsOn": ["F1"], "durationMinutes": 25, "gate": false, "verification": "Restore tested" },
    { "id": "M1", "phase": "migrate-data", "action": "Copy the database", "owner": "Database team", "dependsOn": ["B1"], "durationMinutes": 60, "verification": "Row counts match", "rollbackStep": "R2" }
  ]
}
```

A CSV runbook:

```
id,phase,action,owner,depends-on,duration,gate,verification,rollback
B1,backup,Back up the order database,Database team,F1,25,no,Restore tested,
M1,migrate-data,Copy the database,Database team,B1,60,no,Row counts match,R2
```

## The phases

The phases of src/phases.js, in the order a cutover runs them. A name is compared in its word form: trimmed, the
letters A to Z lowered, and every run of spaces, underscores and hyphens made one hyphen, so `Data Sync`, `data_sync` and
`data-sync` are one name, and `datasync` is another. `phaseAliases` in the configuration adds names.

| Phase | Holds | Aliases |
| --- | --- | --- |
| `prepare` | work done before the downtime starts | `preparation`, `prep`, `pre-cutover`, `precutover`, `readiness` |
| `freeze` | the source stops changing | `change-freeze`, `code-freeze`, `ingestion-freeze`, `quiesce`, `lockdown` |
| `backup` | the final backup of the source, kept for a rollback | `back-up`, `snapshot`, `final-backup` |
| `migrate-data` | the final copy or sync of the data | `data-migration`, `migrate`, `migration`, `data-sync`, `sync`, `data-copy`, `data-move` |
| `switch` | users and traffic move to the target | `cutover`, `cut-over`, `switchover`, `switch-over`, `go-live`, `golive`, `routing`, `traffic` |
| `verify` | the checks that the move worked | `validate`, `validation`, `verification`, `test`, `testing`, `smoke-test`, `check` |
| `rollback` | the steps that undo a change | `roll-back`, `back-out`, `backout`, `fallback`, `fall-back`, `revert` |
| `hypercare` | the closer support after the move | `hyper-care`, `post-cutover`, `stabilization`, `stabilisation`, `stabilize`, `warranty`, `early-life-support` |

The steps of `migrate-data` and `switch` change something, so each needs a rollback step.

## Yes and no

`yes`, `y`, `true` and `1` are yes; `no`, `n`, `false` and `0` are no; in JSON, `true` and `false` too. Any other value
is an `invalid-field` finding. An empty gate is no, and an empty communication plan is missing.

## The application

The header object `application` of a JSON runbook, or the application file of a CSV runbook: one JSON object with these
keys, all optional. A key the tool does not know is an `invalid-field` finding.

| Key | Value |
| --- | --- |
| `name` | a text |
| `strategy` | one of the seven strategies below, or one of their other names |
| `downtimeWindowMinutes` | a whole number of minutes from 0 to 10,080, as a number or a text of digits |
| `dataOwner` | a text: the owner of the data |
| `businessSignOff` | a text: the business owner who signs off the cutover |
| `communicationPlan` | yes or no |

| Strategy | Other names |
| --- | --- |
| `rehost` | `lift-and-shift`, `lift-shift` |
| `replatform` | `lift-and-reshape`, `lift-tinker-and-shift`, `lift-and-optimize`, `lift-and-optimise`, `re-platform` |
| `refactor` | `re-architect`, `rearchitect`, `rebuild`, `re-factor`, `move-and-improve` |
| `repurchase` | `replace`, `drop-and-shop`, `re-purchase` |
| `retire` | `decommission` |
| `retain` | `keep`, `revisit` |
| `relocate` | `re-locate` |

Strategies are compared in their word form too, so `Lift and Shift` is `rehost`. The Cloud Adoption Framework names
rearchitect, rebuild and replace apart; the tool folds them into the seven names of the AWS page, because only retire
and retain change what it reports.

## The configuration file

```
cutover-runbook-check runbook.csv --app application.json --config cutover.json
```

Strict JSON (RFC 8259) in one object; every key is optional. A key the tool does not know is an error with its line and
a suggestion, a key named twice is refused, and a value of the wrong kind is an error. The configuration is read as
UTF-8 and is at most 1 MB. `--print-defaults` writes the built-in configuration, which read back gives the defaults.

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown in the report | none |
| `rules` | an object of rule keys to `info`, `warning`, `error` or `off` | the levels below |
| `requiredPhases` | a list of phases, or aliases of phases, that must each have a step; up to 50 entries | `backup`, `switch`, `verify`, `rollback` |
| `windowPhases` | a list of phases, or aliases of phases, whose steps count on the critical path | `freeze`, `backup`, `migrate-data`, `switch`, `verify` |
| `phaseAliases` | an object of names to phases, each name 1 to 60 characters, that adds to the aliases above; a name may not be a phase itself; up to 200 | none |
| `minSeverity` | `info`, `warning` or `error`: the lowest level shown | `info` |
| `failOn` | `info`, `warning` or `error`: the lowest level that fails the run | `error` |

The flags `--min-severity` and `--fail-on` win over `minSeverity` and `failOn`.

### The rules

| Key | Rule | Default |
| --- | --- | --- |
| `rules.missingPhase` | `missing-phase` | `error` |
| `rules.changeWithoutRollback` | `change-without-rollback` | `error` |
| `rules.noBackupBeforeMigrate` | `no-backup-before-migrate` | `error` |
| `rules.missingOwner` | `missing-owner` | `warning` |
| `rules.missingVerification` | `missing-verification` | `warning` |
| `rules.noGoGate` | `no-go-gate` | `error` |
| `rules.unknownDependency` | `unknown-dependency` | `error` |
| `rules.dependencyCycle` | `dependency-cycle` | `error` |
| `rules.duplicateId` | `duplicate-id` | `error` |
| `rules.criticalPathOverWindow` | `critical-path-over-window` | `error` |
| `rules.rollbackOverWindow` | `rollback-over-window` | `warning` |
| `rules.strategyMismatch` | `strategy-mismatch` | `warning` |
| `rules.missingApplicationField` | `missing-application-field` | `warning` |
| `rules.missingBusinessSignOff` | `missing-business-sign-off` | `warning` |
| `rules.missingDataOwner` | `missing-data-owner` | `warning` |
| `rules.noCommunicationPlan` | `no-communication-plan` | `warning` |

`invalid-field`, `unreadable-file` and `unparsable-file` are always errors and have no key.

An example:

```json
{
  "name": "Brindlecombe cutover review",
  "requiredPhases": ["backup", "switch", "verify", "rollback", "hypercare"],
  "phaseAliases": { "Snapshot and Seal": "backup" },
  "rules": { "noCommunicationPlan": "error" }
}
```
