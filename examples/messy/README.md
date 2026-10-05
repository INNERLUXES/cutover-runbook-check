# Brindlecombe Mutual: a messy cutover runbook

A made-up insurer moves its claims portal to new servers. The team keeps the runbook in a sheet and saved it as
`runbook.csv`, with the application in `application.json`, and the runbook holds one thing of each kind that goes wrong
on a migration night:

- no verify step and no hypercare step, which `../config.json` requires;
- two preparation steps that depend on each other, and two steps with the id `F1`;
- a backup step that runs beside the first data move instead of before it, and a go/no-go call that comes after the
  backup but that the switch does not depend on;
- a data move with no rollback step, a switch step whose rollback step `R7` is not in the runbook, a switch step whose
  rollback step is a preparation step, and a switch step that depends on `S99`, which is not there either;
- a critical path of 200 minutes for a downtime window of 180, and 85 minutes of rollback steps with no time left for
  them;
- a step with no owner, steps that do not say how success is checked, no business sign-off, a communication plan of
  "no", and the strategy "Decommission" (retire) on a runbook that moves data.

It also holds what must not be reported: the phase names written in other ways (`Prepare`, `Preparation`,
`pre-cutover`, `Change Freeze`, `Data Sync`, `Cutover`, `Back-out`), the backup phase written as `Snapshot and Seal`,
an alias that `../config.json` adds, the go/no-go column written as `Y` and `N`, a field with a comma inside quotes,
and the data owner, who is named.

```
node bin/cutover-runbook-check.js examples/messy/runbook.csv --app examples/messy/application.json --config examples/config.json
```
