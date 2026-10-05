# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own and what to change. The same points are in src/data.js and are shown by `--explain`;
research/sources.md has a longer note on each page. The tool reads a runbook: a point says what a page says, and a
finding says what the runbook holds. A passing result is not a go/no-go decision and not a certification.

## The rules

| Rule | Default level | Points |
| --- | --- | --- |
| `missing-phase` | error | `cutoverSequence`, `rollbackCriteria` |
| `change-without-rollback` | error | `rollbackEachStep`, `rollbackPlan`, `rollbackCriteria` |
| `no-backup-before-migrate` | error | `cutoverSequence`, `rollbackWithData` |
| `missing-owner` | warning | `runbookTasks` |
| `missing-verification` | warning | `validateAndConfirm`, `runbookTasks` |
| `no-go-gate` | error | `formalApproval`, `rollbackPlan` |
| `unknown-dependency` | error | `dependenciesFirst`, `runbookTasks` |
| `dependency-cycle` | error | `dependenciesFirst`, `runbookTasks` |
| `duplicate-id` | error | `runbookTasks` |
| `critical-path-over-window` | error | `downtimeAndRollbackTime`, `downtimeMethod`, `downtimeTolerance` |
| `rollback-over-window` | warning | `downtimeAndRollbackTime`, `rollbackWithData` |
| `strategy-mismatch` | warning | `sevenStrategies`, `strategyList` |
| `missing-application-field` | warning | `planDocument`, `downtimeMethod` |
| `missing-business-sign-off` | warning | `formalApproval`, `approveDecommission` |
| `missing-data-owner` | warning | `planDocument`, `rollbackWithData` |
| `no-communication-plan` | warning | `communicateSchedule` |
| `invalid-field` | error, always | `runbookTasks`, `csvRecords` |
| `unreadable-file` | error, always | `runbookTasks` |
| `unparsable-file` | error, always | `csvRecords`, `jsonRepeatedNames` |

### `missing-phase`

A required phase has no step.

- `cutoverSequence` (Cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover usually freezes new data, takes a final backup that a rollback can use, runs a final data sync, changes the routing and tests before the move is called complete.
- `rollbackCriteria` (Plan your migration (Microsoft Cloud Adoption Framework)): the criteria and steps of a rollback are set before the migration starts, name the conditions that trigger it, and are tested.

The tool's own choice: the required phases are the requiredPhases of the configuration (backup, switch, verify and rollback by default); a phase counts when one step, read with its phase or an alias of it, is in it; one finding per phase, at the start of the steps.

What to change: add the steps of the phase, each with an owner, a duration and how its success is checked.

### `change-without-rollback`

A change step has no rollback step.

- `rollbackEachStep` (Migrate to Google Cloud: Best practices for validating a migration plan (Google Cloud Architecture Center)): each step of a migration plan gets a rollback strategy, and the rollback strategies are reviewed and tested from time to time.
- `rollbackPlan` (Cutover stage (AWS Prescriptive Guidance, migration cutover)): a rollback plan names the checkpoints whose criteria start a rollback, how the rollback treats the data, and the person who decides to fix forward or roll back.
- `rollbackCriteria` (Plan your migration (Microsoft Cloud Adoption Framework)): the criteria and steps of a rollback are set before the migration starts, name the conditions that trigger it, and are tested.

The tool's own choice: a step of the migrate-data or switch phase changes something, so it must name a rollback step that is in the runbook and in the rollback phase; one finding per change step, saying whether the rollback step is not named, not in the runbook or in another phase.

What to change: name a step of the rollback phase that undoes this change, and add it to the runbook if it is not there.

### `no-backup-before-migrate`

No backup step comes before the first data move.

- `cutoverSequence` (Cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover usually freezes new data, takes a final backup that a rollback can use, runs a final data sync, changes the routing and tests before the move is called complete.
- `rollbackWithData` (Cutover stage (AWS Prescriptive Guidance, migration cutover)): once new data has reached the target, a rollback may need that data copied back, a dual write, or a restore whose time was measured in a test beforehand.

The tool's own choice: before means in dependency order: a backup step must be among the steps a first migrate-data step depends on, directly or through others; a migrate-data step that depends on another migrate-data step is not a first one; the order of the rows and the times of the steps are not used.

What to change: make the first data move depend on a backup step, and test the restore of that backup before the cutover.

### `missing-owner`

A step has no owner.

- `runbookTasks` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan.

The tool's own choice: an owner that is empty or only white space is missing; the tool cannot tell whether the name is a real person or team.

What to change: name the person or team who runs the step and answers for it.

### `missing-verification`

A step does not say how its success is checked.

- `validateAndConfirm` (Execute migration to cloud (Microsoft Cloud Adoption Framework)): data and the main functions are checked after the data moves and again after traffic moves, and success is announced only after the owners confirm it.
- `runbookTasks` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan.

The tool's own choice: a verification that is empty or only white space is missing; the tool cannot tell whether the check written is a good one.

What to change: write how success is checked: a count that matches, a health check that answers, or a test that passes.

### `no-go-gate`

No go/no-go gate comes before the switch.

- `formalApproval` (Plan your migration (Microsoft Cloud Adoption Framework)): stakeholders approve the plan and the rollback steps in writing, the authority to roll back is named, and review points are set for go/no-go decisions.
- `rollbackPlan` (Cutover stage (AWS Prescriptive Guidance, migration cutover)): a rollback plan names the checkpoints whose criteria start a rollback, how the rollback treats the data, and the person who decides to fix forward or roll back.

The tool's own choice: a switch step that depends on no other switch step starts the switch phase, and a step with the gate set to yes must be among the steps it depends on, directly or through others; a gate that the switch does not depend on does not count.

What to change: add a go/no-go gate step that the switch depends on, and name who decides and on what criteria.

### `unknown-dependency`

A step depends on a step that is not in the runbook.

- `dependenciesFirst` (Plan your migration (Microsoft Cloud Adoption Framework)): dependencies are found and mapped before the move, because parts that depend on each other and move apart cause outages.
- `runbookTasks` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan.

The tool's own choice: ids are compared exactly, letter case included; a dependency on an id that is not in the runbook is left out of the critical path; one finding per step, naming every unknown id.

What to change: correct the id, or add the step it names.

### `dependency-cycle`

Steps depend on each other in a cycle.

- `dependenciesFirst` (Plan your migration (Microsoft Cloud Adoption Framework)): dependencies are found and mapped before the move, because parts that depend on each other and move apart cause outages.
- `runbookTasks` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan.

The tool's own choice: one finding per cycle, at its first step in the file, with one shortest path round it; a step that depends on itself is a cycle; the dependencies inside a cycle are left out of the critical path.

What to change: break the cycle: decide which step comes first and take the other dependency out.

### `duplicate-id`

Two steps share an id.

- `runbookTasks` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan.

The tool's own choice: ids are compared exactly; the first step with an id is the one other steps depend on, and each later step with it is reported.

What to change: give every step its own id.

### `critical-path-over-window`

The critical path is longer than the downtime window.

- `downtimeAndRollbackTime` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover plan weighs the downtime it needs, what an overrun of the window costs the business and how long a rollback takes, and it documents the rollback procedure.
- `downtimeMethod` (Plan your migration (Microsoft Cloud Adoption Framework)): each workload gets a migration method that fits how much downtime it can take, and the acceptable downtime is written down.
- `downtimeTolerance` (Migrate to Google Cloud: Best practices for validating a migration plan (Google Cloud Architecture Center)): how much downtime each workload can tolerate is found during the assessment, because a move with no downtime needs far more design and coordination.

The tool's own choice: the critical path is the longest chain of dependencies, summed over the durations of the steps of the window phases (windowPhases of the configuration); steps of other phases add nothing; it is compared with the downtime window of the application, which must be given.

What to change: shorten or split the steps on the critical path, run steps side by side where they do not depend on each other, or agree a longer window.

### `rollback-over-window`

The rollback does not fit in what is left of the window.

- `downtimeAndRollbackTime` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover plan weighs the downtime it needs, what an overrun of the window costs the business and how long a rollback takes, and it documents the rollback procedure.
- `rollbackWithData` (Cutover stage (AWS Prescriptive Guidance, migration cutover)): once new data has reached the target, a rollback may need that data copied back, a dual write, or a restore whose time was measured in a test beforehand.

The tool's own choice: the rollback time is the sum of the durations of every step of the rollback phase, as if all of them ran one after the other; what is left of the window is the window less the critical path, and never less than zero.

What to change: plan a rollback that fits what is left of the window, set the go/no-go point early enough that a rollback still fits, or agree a longer window.

### `strategy-mismatch`

The steps do not match the migration strategy.

- `sevenStrategies` (About the migration strategies (AWS Prescriptive Guidance, large migrations)): the seven migration strategies are retire, retain, rehost, relocate, repurchase, replatform and refactor or re-architect; retire shuts an application down and retain keeps it in the source environment for now.
- `strategyList` (Select your cloud migration strategies (Microsoft Cloud Adoption Framework)): a workload can be retired, retained, rehosted, replatformed, refactored, rearchitected, rebuilt or replaced; retire decommissions it and retain keeps it where it is.

The tool's own choice: a retired application is shut down, not moved, so a migrate-data step does not fit it; a retained application stays where it is, so a switch step does not fit it; one finding at the first such step, with their count.

What to change: correct the strategy of the application, or take the steps out of the runbook.

### `missing-application-field`

The application has no name, strategy or downtime window.

- `planDocument` (Plan your migration (Microsoft Cloud Adoption Framework)): the migration plan names each workload with its owner, its criticality, its migration method, its downtime window and its effect on the business.
- `downtimeMethod` (Plan your migration (Microsoft Cloud Adoption Framework)): each workload gets a migration method that fits how much downtime it can take, and the acceptable downtime is written down.

The tool's own choice: one finding per field missing: the name, the migration strategy and the downtime window; without the window the critical path and the rollback are not compared with it; a CSV runbook given with no application file has none of them.

What to change: give the field in the application header of the JSON runbook, or in the application file of a CSV runbook (--app).

### `missing-business-sign-off`

No business sign-off is named.

- `formalApproval` (Plan your migration (Microsoft Cloud Adoption Framework)): stakeholders approve the plan and the rollback steps in writing, the authority to roll back is named, and review points are set for go/no-go decisions.
- `approveDecommission` (Decommission source workloads after migration to cloud (Microsoft Cloud Adoption Framework)): business and technical owners approve before the source is shut down, with a grace period in which a rollback is still possible.

The tool's own choice: an empty business sign-off is missing; the tool cannot tell whether the person has signed.

What to change: name the business owner who signs off the cutover and the rollback plan.

### `missing-data-owner`

No data owner is named.

- `planDocument` (Plan your migration (Microsoft Cloud Adoption Framework)): the migration plan names each workload with its owner, its criticality, its migration method, its downtime window and its effect on the business.
- `rollbackWithData` (Cutover stage (AWS Prescriptive Guidance, migration cutover)): once new data has reached the target, a rollback may need that data copied back, a dual write, or a restore whose time was measured in a test beforehand.

The tool's own choice: an empty data owner is missing.

What to change: name the owner of the data, who confirms that the data moved whole and decides on it in a rollback.

### `no-communication-plan`

There is no communication plan.

- `communicateSchedule` (Execute migration to cloud (Microsoft Cloud Adoption Framework)): before the move, a schedule with its timing, the expected effect on the service, who does what and the fallback plans goes to every stakeholder.

The tool's own choice: a communication plan of no, or none given, is reported; the tool cannot read the plan itself.

What to change: plan who tells users and support teams about the outage, when, and how they hear that it is over or rolled back.

### `invalid-field`

A value that cannot be read.

- `runbookTasks` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan.
- `csvRecords` (RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files): each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice.

The tool's own choice: a step with no id or an id that is not an id, no phase or a phase that is none of the phases or their aliases, no duration or one that is not a whole number of minutes, a gate or communication plan that is neither yes nor no, a strategy that is none of the seven, a column or key the tool does not know, or a record with another number of fields than the header; the step is still listed with the value left empty; this rule cannot be set lower or off.

What to change: correct the value at the line named; docs/inputs.md lists the fields and the values they take.

### `unreadable-file`

A file that cannot be read.

- `runbookTasks` (Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)): a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan.

The tool's own choice: a file that is over its size limit, binary, not valid UTF-8 or UTF-16, or cannot be opened is an error and nothing in it is checked; this rule cannot be set lower or off.

What to change: save the file again as UTF-8.

### `unparsable-file`

A file that is not CSV or JSON the readers accept.

- `csvRecords` (RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files): each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice.
- `jsonRepeatedNames` (RFC 8259, The JSON Data Interchange Format): when an object repeats a name the behavior of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name.

The tool's own choice: a CSV file with a quote out of place, a header with no id or phase column, or JSON that is not well formed, repeats a name or has no steps list stops the reading of the file, and nothing in it is checked; this rule cannot be set lower or off.

What to change: correct the file at the line and column named, and save it again.

## The points

| Point | Page | What it says |
| --- | --- | --- |
| `sevenStrategies` | About the migration strategies (AWS Prescriptive Guidance, large migrations) | the seven migration strategies are retire, retain, rehost, relocate, repurchase, replatform and refactor or re-architect; retire shuts an application down and retain keeps it in the source environment for now |
| `rehostDowntime` | About the migration strategies (AWS Prescriptive Guidance, large migrations) | with rehost and relocate the application keeps serving users while it moves, and how long it is down depends on the cutover approach |
| `runbookTasks` | Pre-cutover stage (AWS Prescriptive Guidance, migration cutover) | a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan |
| `downtimeAndRollbackTime` | Pre-cutover stage (AWS Prescriptive Guidance, migration cutover) | a cutover plan weighs the downtime it needs, what an overrun of the window costs the business and how long a rollback takes, and it documents the rollback procedure |
| `cutoverSequence` | Cutover stage (AWS Prescriptive Guidance, migration cutover) | a cutover usually freezes new data, takes a final backup that a rollback can use, runs a final data sync, changes the routing and tests before the move is called complete |
| `rollbackPlan` | Cutover stage (AWS Prescriptive Guidance, migration cutover) | a rollback plan names the checkpoints whose criteria start a rollback, how the rollback treats the data, and the person who decides to fix forward or roll back |
| `rollbackWithData` | Cutover stage (AWS Prescriptive Guidance, migration cutover) | once new data has reached the target, a rollback may need that data copied back, a dual write, or a restore whose time was measured in a test beforehand |
| `strategyList` | Select your cloud migration strategies (Microsoft Cloud Adoption Framework) | a workload can be retired, retained, rehosted, replatformed, refactored, rearchitected, rebuilt or replaced; retire decommissions it and retain keeps it where it is |
| `dependenciesFirst` | Plan your migration (Microsoft Cloud Adoption Framework) | dependencies are found and mapped before the move, because parts that depend on each other and move apart cause outages |
| `downtimeMethod` | Plan your migration (Microsoft Cloud Adoption Framework) | each workload gets a migration method that fits how much downtime it can take, and the acceptable downtime is written down |
| `rollbackCriteria` | Plan your migration (Microsoft Cloud Adoption Framework) | the criteria and steps of a rollback are set before the migration starts, name the conditions that trigger it, and are tested |
| `planDocument` | Plan your migration (Microsoft Cloud Adoption Framework) | the migration plan names each workload with its owner, its criticality, its migration method, its downtime window and its effect on the business |
| `formalApproval` | Plan your migration (Microsoft Cloud Adoption Framework) | stakeholders approve the plan and the rollback steps in writing, the authority to roll back is named, and review points are set for go/no-go decisions |
| `communicateSchedule` | Execute migration to cloud (Microsoft Cloud Adoption Framework) | before the move, a schedule with its timing, the expected effect on the service, who does what and the fallback plans goes to every stakeholder |
| `changeFreeze` | Execute migration to cloud (Microsoft Cloud Adoption Framework) | a change freeze keeps the source system from changing during the migration window |
| `validateAndConfirm` | Execute migration to cloud (Microsoft Cloud Adoption Framework) | data and the main functions are checked after the data moves and again after traffic moves, and success is announced only after the owners confirm it |
| `keepFallback` | Execute migration to cloud (Microsoft Cloud Adoption Framework) | the source environment is kept as a fallback, with a way to point traffic back, while the workload settles |
| `stabilization` | Execute migration to cloud (Microsoft Cloud Adoption Framework) | the moved workload gets closer support for a period after the cutover |
| `approveDecommission` | Decommission source workloads after migration to cloud (Microsoft Cloud Adoption Framework) | business and technical owners approve before the source is shut down, with a grace period in which a rollback is still possible |
| `migrationTypes` | Migrate to Google Cloud: Get started (Google Cloud Architecture Center) | the kinds of migration include rehost, replatform, refactor, re-architect, rebuild and repurchase |
| `rollbackEachStep` | Migrate to Google Cloud: Best practices for validating a migration plan (Google Cloud Architecture Center) | each step of a migration plan gets a rollback strategy, and the rollback strategies are reviewed and tested from time to time |
| `downtimeTolerance` | Migrate to Google Cloud: Best practices for validating a migration plan (Google Cloud Architecture Center) | how much downtime each workload can tolerate is found during the assessment, because a move with no downtime needs far more design and coordination |
| `csvRecords` | RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice |
| `csvInjection` | CSV Injection (OWASP) | a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file |
| `jsonUtf8` | RFC 8259, The JSON Data Interchange Format | JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start |
| `jsonRepeatedNames` | RFC 8259, The JSON Data Interchange Format | when an object repeats a name the behavior of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name |
| `githubAnnotations` | Workflow commands for GitHub Actions (GitHub Docs) | a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run |

## The pages

- About the migration strategies (AWS Prescriptive Guidance, large migrations): https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html
- Pre-cutover stage (AWS Prescriptive Guidance, migration cutover): https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/pre-cutover-stage.html
- Cutover stage (AWS Prescriptive Guidance, migration cutover): https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html
- Select your cloud migration strategies (Microsoft Cloud Adoption Framework): https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/plan/select-cloud-migration-strategy
- Plan your migration (Microsoft Cloud Adoption Framework): https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration
- Execute migration to cloud (Microsoft Cloud Adoption Framework): https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration
- Decommission source workloads after migration to cloud (Microsoft Cloud Adoption Framework): https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/decommission-source-workload
- Migrate to Google Cloud: Get started (Google Cloud Architecture Center): https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started
- Migrate to Google Cloud: Best practices for validating a migration plan (Google Cloud Architecture Center): https://docs.cloud.google.com/architecture/migration-to-google-cloud-best-practices
- RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files: https://www.rfc-editor.org/rfc/rfc4180
- RFC 8259, The JSON Data Interchange Format: https://www.rfc-editor.org/rfc/rfc8259
- CSV Injection (OWASP): https://community.owasp.org/attacks/CSV_Injection
- Workflow commands for GitHub Actions (GitHub Docs): https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
