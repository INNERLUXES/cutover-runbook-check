// The built-in configuration: the level of every rule, the phases a runbook must have, the phases whose steps count
// toward the downtime window, the lowest level shown and the level that fails the run. docs/inputs.md describes every
// key, and --print-defaults writes all of this out. The phases, the strategies and their other names are in
// src/phases.js.

// The level of every rule that the configuration can set. The three rules of input problems are always errors.
export const DEFAULT_RULES = {
  missingPhase: 'error',
  changeWithoutRollback: 'error',
  noBackupBeforeMigrate: 'error',
  missingOwner: 'warning',
  missingVerification: 'warning',
  noGoGate: 'error',
  unknownDependency: 'error',
  dependencyCycle: 'error',
  duplicateId: 'error',
  criticalPathOverWindow: 'error',
  rollbackOverWindow: 'warning',
  strategyMismatch: 'warning',
  missingApplicationField: 'warning',
  missingBusinessSignOff: 'warning',
  missingDataOwner: 'warning',
  noCommunicationPlan: 'warning'
};

// The phases a runbook must have at least one step in.
export const DEFAULT_REQUIRED_PHASES = ['backup', 'switch', 'verify', 'rollback'];

// The phases whose steps run inside the downtime window and so count on the critical path. Preparation runs before the
// window, hypercare after it, and the rollback steps run only when a change is undone.
export const DEFAULT_WINDOW_PHASES = ['freeze', 'backup', 'migrate-data', 'switch', 'verify'];

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'info';

// The lowest level of a finding that fails the run.
export const DEFAULT_FAIL_ON = 'error';
