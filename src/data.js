// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists every page with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

const AWS = 'https://docs.aws.amazon.com/prescriptive-guidance/latest';
const CAF = 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework';
const GCP = 'https://docs.cloud.google.com/architecture';

export const SOURCES = [
  { id: 'awsStrategies', title: 'About the migration strategies (AWS Prescriptive Guidance, large migrations)', url: `${AWS}/large-migration-guide/migration-strategies.html` },
  { id: 'awsPreCutover', title: 'Pre-cutover stage (AWS Prescriptive Guidance, migration cutover)', url: `${AWS}/best-practices-migration-cutover/pre-cutover-stage.html` },
  { id: 'awsCutover', title: 'Cutover stage (AWS Prescriptive Guidance, migration cutover)', url: `${AWS}/best-practices-migration-cutover/cutover-stage.html` },
  { id: 'cafStrategies', title: 'Select your cloud migration strategies (Microsoft Cloud Adoption Framework)', url: `${CAF}/plan/select-cloud-migration-strategy` },
  { id: 'cafPlan', title: 'Plan your migration (Microsoft Cloud Adoption Framework)', url: `${CAF}/migrate/plan-migration` },
  { id: 'cafExecute', title: 'Execute migration to cloud (Microsoft Cloud Adoption Framework)', url: `${CAF}/migrate/execute-migration` },
  { id: 'cafDecommission', title: 'Decommission source workloads after migration to cloud (Microsoft Cloud Adoption Framework)', url: `${CAF}/migrate/decommission-source-workload` },
  { id: 'gcpGetStarted', title: 'Migrate to Google Cloud: Get started (Google Cloud Architecture Center)', url: `${GCP}/migration-to-gcp-getting-started` },
  { id: 'gcpValidate', title: 'Migrate to Google Cloud: Best practices for validating a migration plan (Google Cloud Architecture Center)', url: `${GCP}/migration-to-google-cloud-best-practices` },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'owaspCsv', title: 'CSV Injection (OWASP)', url: 'https://community.owasp.org/attacks/CSV_Injection' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  sevenStrategies: { source: 'awsStrategies', text: 'the seven migration strategies are retire, retain, rehost, relocate, repurchase, replatform and refactor or re-architect; retire shuts an application down and retain keeps it in the source environment for now' },
  rehostDowntime: { source: 'awsStrategies', text: 'with rehost and relocate the application keeps serving users while it moves, and how long it is down depends on the cutover approach' },
  runbookTasks: { source: 'awsPreCutover', text: 'a cutover runbook lists every task with its owner, its place in the sequence and its planned start and end, so the teams follow one plan' },
  downtimeAndRollbackTime: { source: 'awsPreCutover', text: 'a cutover plan weighs the downtime it needs, what an overrun of the window costs the business and how long a rollback takes, and it documents the rollback procedure' },
  cutoverSequence: { source: 'awsCutover', text: 'a cutover usually freezes new data, takes a final backup that a rollback can use, runs a final data sync, changes the routing and tests before the move is called complete' },
  rollbackPlan: { source: 'awsCutover', text: 'a rollback plan names the checkpoints whose criteria start a rollback, how the rollback treats the data, and the person who decides to fix forward or roll back' },
  rollbackWithData: { source: 'awsCutover', text: 'once new data has reached the target, a rollback may need that data copied back, a dual write, or a restore whose time was measured in a test beforehand' },
  strategyList: { source: 'cafStrategies', text: 'a workload can be retired, retained, rehosted, replatformed, refactored, rearchitected, rebuilt or replaced; retire decommissions it and retain keeps it where it is' },
  dependenciesFirst: { source: 'cafPlan', text: 'dependencies are found and mapped before the move, because parts that depend on each other and move apart cause outages' },
  downtimeMethod: { source: 'cafPlan', text: 'each workload gets a migration method that fits how much downtime it can take, and the acceptable downtime is written down' },
  rollbackCriteria: { source: 'cafPlan', text: 'the criteria and steps of a rollback are set before the migration starts, name the conditions that trigger it, and are tested' },
  planDocument: { source: 'cafPlan', text: 'the migration plan names each workload with its owner, its criticality, its migration method, its downtime window and its effect on the business' },
  formalApproval: { source: 'cafPlan', text: 'stakeholders approve the plan and the rollback steps in writing, the authority to roll back is named, and review points are set for go/no-go decisions' },
  communicateSchedule: { source: 'cafExecute', text: 'before the move, a schedule with its timing, the expected effect on the service, who does what and the fallback plans goes to every stakeholder' },
  changeFreeze: { source: 'cafExecute', text: 'a change freeze keeps the source system from changing during the migration window' },
  validateAndConfirm: { source: 'cafExecute', text: 'data and the main functions are checked after the data moves and again after traffic moves, and success is announced only after the owners confirm it' },
  keepFallback: { source: 'cafExecute', text: 'the source environment is kept as a fallback, with a way to point traffic back, while the workload settles' },
  stabilization: { source: 'cafExecute', text: 'the moved workload gets closer support for a period after the cutover' },
  approveDecommission: { source: 'cafDecommission', text: 'business and technical owners approve before the source is shut down, with a grace period in which a rollback is still possible' },
  migrationTypes: { source: 'gcpGetStarted', text: 'the kinds of migration include rehost, replatform, refactor, re-architect, rebuild and repurchase' },
  rollbackEachStep: { source: 'gcpValidate', text: 'each step of a migration plan gets a rollback strategy, and the rollback strategies are reviewed and tested from time to time' },
  downtimeTolerance: { source: 'gcpValidate', text: 'how much downtime each workload can tolerate is found during the assessment, because a move with no downtime needs far more design and coordination' },
  csvRecords: { source: 'rfc4180', text: 'each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice' },
  csvInjection: { source: 'owaspCsv', text: 'a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file' },
  jsonUtf8: { source: 'rfc8259', text: 'JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behavior of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest.
export const LEVELS = ['info', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This check reads the runbook as it is written. It runs no step and connects to no system, and a passing result is not a go/no-go decision and not a certification (docs/limits.md).';
