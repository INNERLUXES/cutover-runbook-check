// The rules and the result. Each rule names the points of the public pages it rests on (src/data.js), says where it is
// the tool's own choice, and what to change. docs/method.md says exactly what each rule looks at and what it cannot see.
// The checks themselves are in src/runbook.js and src/review.js.

import { LEVELS } from './data.js';
import { grouped, listText, plural } from './size.js';

export const RULES = [
  {
    id: 'missing-phase',
    key: 'missingPhase',
    title: 'a required phase has no step',
    basis: ['cutoverSequence', 'rollbackCriteria'],
    own: 'the required phases are the requiredPhases of the configuration (backup, switch, verify and rollback by default); a phase counts when one step, read with its phase or an alias of it, is in it; one finding per phase, at the start of the steps',
    rule: (config) => `a runbook with no step in one of the ${plural(config.requiredPhases.length, 'required phase')} (${listText(config.requiredPhases, 10)})`,
    fix: 'add the steps of the phase, each with an owner, a duration and how its success is checked'
  },
  {
    id: 'change-without-rollback',
    key: 'changeWithoutRollback',
    title: 'a change step has no rollback step',
    basis: ['rollbackEachStep', 'rollbackPlan', 'rollbackCriteria'],
    own: 'a step of the migrate-data or switch phase changes something, so it must name a rollback step that is in the runbook and in the rollback phase; one finding per change step, saying whether the rollback step is not named, not in the runbook or in another phase',
    rule: () => 'a migrate-data or switch step that names no rollback step, names one that is not in the runbook, or names a step outside the rollback phase',
    fix: 'name a step of the rollback phase that undoes this change, and add it to the runbook if it is not there'
  },
  {
    id: 'no-backup-before-migrate',
    key: 'noBackupBeforeMigrate',
    title: 'no backup step comes before the first data move',
    basis: ['cutoverSequence', 'rollbackWithData'],
    own: 'before means in dependency order: a backup step must be among the steps a first migrate-data step depends on, directly or through others; a migrate-data step that depends on another migrate-data step is not a first one; the order of the rows and the times of the steps are not used',
    rule: () => 'a migrate-data step that depends on no other migrate-data step and on no backup step, directly or through others',
    fix: 'make the first data move depend on a backup step, and test the restore of that backup before the cutover'
  },
  {
    id: 'missing-owner',
    key: 'missingOwner',
    title: 'a step has no owner',
    basis: ['runbookTasks'],
    own: 'an owner that is empty or only white space is missing; the tool cannot tell whether the name is a real person or team',
    rule: () => 'a step with no owner',
    fix: 'name the person or team who runs the step and answers for it'
  },
  {
    id: 'missing-verification',
    key: 'missingVerification',
    title: 'a step does not say how its success is checked',
    basis: ['validateAndConfirm', 'runbookTasks'],
    own: 'a verification that is empty or only white space is missing; the tool cannot tell whether the check written is a good one',
    rule: () => 'a step with no verification',
    fix: 'write how success is checked: a count that matches, a health check that answers, or a test that passes'
  },
  {
    id: 'no-go-gate',
    key: 'noGoGate',
    title: 'no go/no-go gate comes before the switch',
    basis: ['formalApproval', 'rollbackPlan'],
    own: 'a switch step that depends on no other switch step starts the switch phase, and a step with the gate set to yes must be among the steps it depends on, directly or through others; a gate that the switch does not depend on does not count',
    rule: () => 'a first switch step with no go/no-go gate among the steps it depends on, directly or through others',
    fix: 'add a go/no-go gate step that the switch depends on, and name who decides and on what criteria'
  },
  {
    id: 'unknown-dependency',
    key: 'unknownDependency',
    title: 'a step depends on a step that is not in the runbook',
    basis: ['dependenciesFirst', 'runbookTasks'],
    own: 'ids are compared exactly, letter case included; a dependency on an id that is not in the runbook is left out of the critical path; one finding per step, naming every unknown id',
    rule: () => 'a step whose depends-on names an id that no step has',
    fix: 'correct the id, or add the step it names'
  },
  {
    id: 'dependency-cycle',
    key: 'dependencyCycle',
    title: 'steps depend on each other in a cycle',
    basis: ['dependenciesFirst', 'runbookTasks'],
    own: 'one finding per cycle, at its first step in the file, with one shortest path round it; a step that depends on itself is a cycle; the dependencies inside a cycle are left out of the critical path',
    rule: () => 'steps that depend on each other, directly or through others, so that no order can run them',
    fix: 'break the cycle: decide which step comes first and take the other dependency out'
  },
  {
    id: 'duplicate-id',
    key: 'duplicateId',
    title: 'two steps share an id',
    basis: ['runbookTasks'],
    own: 'ids are compared exactly; the first step with an id is the one other steps depend on, and each later step with it is reported',
    rule: () => 'a step whose id an earlier step has',
    fix: 'give every step its own id'
  },
  {
    id: 'critical-path-over-window',
    key: 'criticalPathOverWindow',
    title: 'the critical path is longer than the downtime window',
    basis: ['downtimeAndRollbackTime', 'downtimeMethod', 'downtimeTolerance'],
    own: 'the critical path is the longest chain of dependencies, summed over the durations of the steps of the window phases (windowPhases of the configuration); steps of other phases add nothing; it is compared with the downtime window of the application, which must be given',
    rule: (config) => `a critical path over the steps of the ${listText(config.windowPhases, 10)} phases longer than the downtime window`,
    fix: 'shorten or split the steps on the critical path, run steps side by side where they do not depend on each other, or agree a longer window'
  },
  {
    id: 'rollback-over-window',
    key: 'rollbackOverWindow',
    title: 'the rollback does not fit in what is left of the window',
    basis: ['downtimeAndRollbackTime', 'rollbackWithData'],
    own: 'the rollback time is the sum of the durations of every step of the rollback phase, as if all of them ran one after the other; what is left of the window is the window less the critical path, and never less than zero',
    rule: () => 'rollback steps whose durations add up to more than the downtime window less the critical path',
    fix: 'plan a rollback that fits what is left of the window, set the go/no-go point early enough that a rollback still fits, or agree a longer window'
  },
  {
    id: 'strategy-mismatch',
    key: 'strategyMismatch',
    title: 'the steps do not match the migration strategy',
    basis: ['sevenStrategies', 'strategyList'],
    own: 'a retired application is shut down, not moved, so a migrate-data step does not fit it; a retained application stays where it is, so a switch step does not fit it; one finding at the first such step, with their count',
    rule: () => 'a runbook of a retired application with migrate-data steps, or of a retained application with switch steps',
    fix: 'correct the strategy of the application, or take the steps out of the runbook'
  },
  {
    id: 'missing-application-field',
    key: 'missingApplicationField',
    title: 'the application has no name, strategy or downtime window',
    basis: ['planDocument', 'downtimeMethod'],
    own: 'one finding per field missing: the name, the migration strategy and the downtime window; without the window the critical path and the rollback are not compared with it; a CSV runbook given with no application file has none of them',
    rule: () => 'an application with no name, no migration strategy or no downtime window',
    fix: 'give the field in the application header of the JSON runbook, or in the application file of a CSV runbook (--app)'
  },
  {
    id: 'missing-business-sign-off',
    key: 'missingBusinessSignOff',
    title: 'no business sign-off is named',
    basis: ['formalApproval', 'approveDecommission'],
    own: 'an empty business sign-off is missing; the tool cannot tell whether the person has signed',
    rule: () => 'an application with no business sign-off person',
    fix: 'name the business owner who signs off the cutover and the rollback plan'
  },
  {
    id: 'missing-data-owner',
    key: 'missingDataOwner',
    title: 'no data owner is named',
    basis: ['planDocument', 'rollbackWithData'],
    own: 'an empty data owner is missing',
    rule: () => 'an application with no data owner',
    fix: 'name the owner of the data, who confirms that the data moved whole and decides on it in a rollback'
  },
  {
    id: 'no-communication-plan',
    key: 'noCommunicationPlan',
    title: 'there is no communication plan',
    basis: ['communicateSchedule'],
    own: 'a communication plan of no, or none given, is reported; the tool cannot read the plan itself',
    rule: () => 'an application whose communication plan is no or not given',
    fix: 'plan who tells users and support teams about the outage, when, and how they hear that it is over or rolled back'
  },
  {
    id: 'invalid-field',
    key: null,
    title: 'a value that cannot be read',
    basis: ['runbookTasks', 'csvRecords'],
    own: 'a step with no id or an id that is not an id, no phase or a phase that is none of the phases or their aliases, no duration or one that is not a whole number of minutes, a gate or communication plan that is neither yes nor no, a strategy that is none of the seven, a column or key the tool does not know, or a record with another number of fields than the header; the step is still listed with the value left empty; this rule cannot be set lower or off',
    rule: () => 'a field of a step or of the application that the tool cannot read',
    fix: 'correct the value at the line named; docs/inputs.md lists the fields and the values they take'
  },
  {
    id: 'unreadable-file',
    key: null,
    title: 'a file that cannot be read',
    basis: ['runbookTasks'],
    own: 'a file that is over its size limit, binary, not valid UTF-8 or UTF-16, or cannot be opened is an error and nothing in it is checked; this rule cannot be set lower or off',
    rule: () => 'a runbook or application file that the tool could not read as UTF-8 or UTF-16 text',
    fix: 'save the file again as UTF-8'
  },
  {
    id: 'unparsable-file',
    key: null,
    title: 'a file that is not CSV or JSON the readers accept',
    basis: ['csvRecords', 'jsonRepeatedNames'],
    own: 'a CSV file with a quote out of place, a header with no id or phase column, or JSON that is not well formed, repeats a name or has no steps list stops the reading of the file, and nothing in it is checked; this rule cannot be set lower or off',
    rule: () => 'a runbook or application file that the CSV or JSON reader refuses',
    fix: 'correct the file at the line and column named, and save it again'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at or above the level failOn. { pass, failOn, failing, byLevel, text }.
export function decide(findings, failOn) {
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const counts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${grouped(byLevel[l])} ${l}`);
  const text = failing
    ? `FAIL - ${plural(failing, 'finding')} at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`
    : `PASS - no finding at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`;
  return { pass: failing === 0, failOn, failing, byLevel, text };
}
