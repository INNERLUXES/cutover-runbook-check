# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which parts of the tool lean on it. Nothing here is a copy of a page: read the page itself for its exact
wording. src/data.js holds the pages and the points the reports show, and test/data.test.js checks that every page in
src/data.js is listed here.
Each page was fetched and read before it was listed.

The tool reads a cutover runbook; a passing result is not a go/no-go decision and not a certification. These notes say
what the pages say so a reader can follow a finding back to its source; they are not advice on how to move any one
application. The pages were chosen with web addresses that hold no number that reads like a year.

## Migration strategies

### About the migration strategies (AWS Prescriptive Guidance, large migrations)

https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html

The AWS page on the seven migration strategies, the 7 Rs: retire, retain, rehost, relocate, repurchase, replatform, and
refactor or re-architect. Retire is for an application to shut down or archive, with no value in keeping or moving it.
Retain keeps an application in the source environment, for now or for good, for reasons such as compliance, risk,
dependencies or a planned move to a SaaS version. Rehost (lift and shift) moves an application without changes, and the
page notes that the application keeps serving users while it moves and that its downtime depends on the cutover
approach; relocate moves many servers to a cloud version of their platform in the same way. Repurchase (drop and shop)
replaces the application with another product, replatform (lift, tinker and shift) moves it with some optimization,
and refactor redesigns it for the cloud, which the page calls the most complex choice and advises against for large
migrations. The strategy names and their other names in src/phases.js, and `strategy-mismatch`, lean on it.

### Select your cloud migration strategies (Microsoft Cloud Adoption Framework)

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/plan/select-cloud-migration-strategy

The Cloud Adoption Framework page on choosing what to do with each workload. It names eight choices: retire, retain,
rehost, replatform, refactor, rearchitect, rebuild and replace, each with its business driver and signs that it fits.
Retire decommissions a workload with little business value once nothing critical depends on it; retain keeps a stable
workload where it is; replace moves to a SaaS product. The page also asks for success measures per strategy and for
the decisions to be shared with business, legal, security and technical stakeholders. The tool folds rearchitect and
rebuild into refactor and replace into repurchase, to keep to the seven names of the AWS page; docs/inputs.md lists
the names it reads. `strategy-mismatch` leans on the meaning of retire and retain.

### Migrate to Google Cloud: Get started (Google Cloud Architecture Center)

https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started

The first page of the Google Cloud migration guide. It sets out four phases (assess, plan, deploy and optimize) and
names the kinds of migration: rehost or lift and shift, replatform or lift and optimize, refactor or move and improve,
re-architect, rebuild or rip and replace, and repurchase. It does not go into the cutover itself. The other names of the
strategies in src/phases.js, such as move and improve, lean on it.

## The cutover

### Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)

https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/pre-cutover-stage.html

The AWS page on planning a cutover. It advises a cutover plan, a cutover workbook and rehearsals, with contingency
plans and a documented rollback procedure. Among the things to weigh it names the downtime needed, the cost to the
business of running past the downtime window, a contingency for fixing forward, and the time a rollback takes, as well
as dependencies and testing. It asks for a runbook that tracks every task with its planned start and end, its sequence
and its owner, with a RACI matrix for responsibilities. `missing-owner`, the dependencies of the steps,
`critical-path-over-window` and `rollback-over-window` lean on it.

### Cutover stage (AWS Prescriptive Guidance, migration cutover)

https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html

The AWS page on the cutover itself. It lists the usual phases of a cutover: an ingestion freeze, a final backup that a
rollback can use, a final data sync, the routing change and testing before the migration is called complete. It
compares cutting over all at once with a phased approach, and says to test what can be tested before the window and to
hold an operational readiness review. Its section on rollback asks for checkpoints whose criteria start a rollback, a
rollback strategy that says how the data is handled, and a named person who decides to fix forward or roll back; after
new data has reached the target, a rollback may need a fail-forward database, a dual write, or a restore whose time was
measured in a test. The phases of src/phases.js, `missing-phase`, `no-backup-before-migrate`,
`change-without-rollback` and `no-go-gate` lean on it.

### Plan your migration (Microsoft Cloud Adoption Framework)

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/plan-migration

The Cloud Adoption Framework page on the migration plan. It asks to map dependencies before workloads are grouped,
because parts that depend on each other and move apart cause outages, to choose a migration with downtime or near-zero
downtime for each workload by how much downtime it can take, and to write the acceptable downtime down. It asks for a
rollback plan defined before the migration: what counts as a failed deployment, the conditions that trigger a
rollback, workload-specific rollback steps, and tests of those steps. Its last section asks for the plan to name each
workload with its owner, criticality, migration method, downtime window and business effects, for written approval of
the plan and the rollback steps, for the authority to roll back to be named, and for review points for go/no-go
decisions. `unknown-dependency`, `dependency-cycle`, `critical-path-over-window`, `change-without-rollback`,
`no-go-gate`, `missing-business-sign-off`, `missing-data-owner` and `missing-application-field` lean on it.

### Execute migration to cloud (Microsoft Cloud Adoption Framework)

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/execute-migration

The Cloud Adoption Framework page on running the migration. It asks for a schedule with the timing, the expected
effect on the service, the responsibilities and the contingency plans to go to every stakeholder before the migration,
with support staff on call and a readiness review. It describes a change freeze on the source, the steps of a
near-zero downtime cutover and of one with downtime (writes stopped, data moved, data checked, the application tested,
traffic moved, the workload checked again), keeping the source as a fallback during stabilization, announcing success
only after the owners confirm it, and closer support for a period after the move. `no-communication-plan` and
`missing-verification` lean on it, and so do the freeze, verify and hypercare phases.

### Decommission source workloads after migration to cloud (Microsoft Cloud Adoption Framework)

https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/decommission-source-workload

The Cloud Adoption Framework page on what comes after the release of a migrated workload: shutting down the source. It
asks for formal approval from business and technical owners before anything is removed, recorded with its success
criteria and with a grace period in which a rollback is still possible, and then covers licences, the archiving of data
that was not moved, and the update of documents and monitoring. The Cloud Adoption Framework page on releasing
workloads that was looked for first answered with an error, so this page stands for the release end of the guide.
`missing-business-sign-off` leans on it.

### Migrate to Google Cloud: Best practices for validating a migration plan (Google Cloud Architecture Center)

https://docs.cloud.google.com/architecture/migration-to-google-cloud-best-practices

The Google Cloud page on checking a migration plan. It asks for a rollback strategy for each step of the plan, for the
rollback strategies to be reviewed and tested from time to time, and for limits on how long a step may run before a
rollback starts. It asks to find out during the assessment how much downtime each workload can tolerate, because a
move with no downtime needs much more design and coordination, to map dependencies on other systems, and to tell the
teams that support the workloads before the move. `change-without-rollback` and `critical-path-over-window` lean on
it.

## Formats

### RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The memo that describes CSV: each record on its own line, ended by CRLF, an optional header line first, fields
separated by commas, spaces kept as part of a field, and every line with the same number of fields. A field that holds
a comma, a double quote or a line break is put in double quotes, and a double quote inside such a field is written
twice. The CSV reader of the tool reads a runbook this way and refuses a quote out of place (`unparsable-file`); a
record with another number of fields than the header is an `invalid-field` finding; and `--format csv` writes the
findings this way, with CRLF line ends.

### RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON standard. Its section on objects says the names in an object should be unique and that programs behave in
different ways when they are not; the JSON reader of the tool refuses a repeated name instead of keeping one of the
values, in a runbook, an application file and the configuration. Its section on encoding asks for UTF-8 between systems
and lets a reader ignore a byte order mark; the files are read as UTF-8 and a byte order mark is skipped.

### CSV Injection (OWASP)

https://community.owasp.org/attacks/CSV_Injection

The page on formulas hidden in CSV files. A spreadsheet may treat a cell that starts with `=`, `+`, `-`, `@`, a tab or
a line break as a formula, and the page warns that no single way of escaping is safe in every program and for every
later reader. The CSV report of the tool puts a single quote in front of such a field, and docs/threat-model.md says
why that is a help and not a guarantee.

### Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The page that describes the `::notice`, `::warning` and `::error` commands with their `file`, `line`, `col` and
`title` properties, which turn a line of output into an annotation on a file. `--format github` writes one such command
per finding, info as a notice, and escapes the characters a command gives a meaning to.
