# Ostrander Seed: a runbook in good order

A made-up seed merchant replatforms its order desk onto a managed app service and database. The JSON runbook holds the
application in its header and ten steps: a preparation step, a freeze, a backup that the data move depends on, a
go/no-go gate before the switch, a check after it, two rollback steps that the change steps name, and a hypercare step.
The critical path of 135 minutes fits the window of 240, and the 15 minutes of rollback fit what is left. The run
passes with no finding.

```
node bin/cutover-runbook-check.js examples/clean/runbook.json
```
