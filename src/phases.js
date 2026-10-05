// The words of a runbook, as a documented data file: the eight phases of a cutover and the names a team writes for
// them, the seven migration strategies (the 7 Rs) and their other names, and the values read as yes and as no. Names
// are compared in their word form (src/words.js): trimmed, the letters A to Z lowered, and every run of spaces,
// underscores and hyphens made one hyphen. A name that is none of these is never matched to a near one; it is an
// invalid-field finding. Check the list before you rely on it, and add the names of your own team with phaseAliases in
// the configuration.

import { wordForm } from './words.js';

// The phases in the order a cutover runs them, each with what it holds and its other names.
export const PHASES = [
  { phase: 'prepare', holds: 'work done before the downtime starts: targets built, people told, access checked', aliases: ['preparation', 'prep', 'pre-cutover', 'precutover', 'readiness'] },
  { phase: 'freeze', holds: 'the source stops changing: a change freeze, writes paused, jobs and interfaces stopped', aliases: ['change-freeze', 'code-freeze', 'ingestion-freeze', 'quiesce', 'lockdown'] },
  { phase: 'backup', holds: 'the final backup of the source, kept for a rollback', aliases: ['back-up', 'snapshot', 'final-backup'] },
  { phase: 'migrate-data', holds: 'the data moves: the final copy or sync to the target', aliases: ['data-migration', 'migrate', 'migration', 'data-sync', 'sync', 'data-copy', 'data-move'] },
  { phase: 'switch', holds: 'users and traffic move to the target: DNS, load balancers, interfaces and jobs', aliases: ['cutover', 'cut-over', 'switchover', 'switch-over', 'go-live', 'golive', 'routing', 'traffic'] },
  { phase: 'verify', holds: 'the checks that the move worked: counts, health checks, tests by the owners', aliases: ['validate', 'validation', 'verification', 'test', 'testing', 'smoke-test', 'check'] },
  { phase: 'rollback', holds: 'the steps that undo a change if a gate or a check fails', aliases: ['roll-back', 'back-out', 'backout', 'fallback', 'fall-back', 'revert'] },
  { phase: 'hypercare', holds: 'the closer support of the first days after the move', aliases: ['hyper-care', 'post-cutover', 'stabilization', 'stabilisation', 'stabilize', 'warranty', 'early-life-support'] }
];

export const PHASE_NAMES = PHASES.map((p) => p.phase);

// The phases whose steps change something, so each needs a rollback step.
export const CHANGE_PHASES = ['migrate-data', 'switch'];

// The seven migration strategies and their other names, as the public pages name them.
export const STRATEGIES = [
  { strategy: 'rehost', aliases: ['lift-and-shift', 'lift-shift'] },
  { strategy: 'replatform', aliases: ['lift-and-reshape', 'lift-tinker-and-shift', 'lift-and-optimize', 'lift-and-optimise', 're-platform'] },
  { strategy: 'refactor', aliases: ['re-architect', 'rearchitect', 'rebuild', 're-factor', 'move-and-improve'] },
  { strategy: 'repurchase', aliases: ['replace', 'drop-and-shop', 're-purchase'] },
  { strategy: 'retire', aliases: ['decommission'] },
  { strategy: 'retain', aliases: ['keep', 'revisit'] },
  { strategy: 'relocate', aliases: ['re-locate'] }
];

export const STRATEGY_NAMES = STRATEGIES.map((s) => s.strategy);

// The values of a yes or no field, in their word form. An empty value is no for a gate and missing for the
// communication plan.
export const YES = ['yes', 'y', 'true', '1'];
export const NO = ['no', 'n', 'false', '0'];

// The phase of a name in a map of word forms, or null. The map is built by phaseMap from the built-in phases and the
// phaseAliases of the configuration.
export function phaseMap(extra = {}) {
  const map = new Map();
  for (const p of PHASES) {
    map.set(p.phase, p.phase);
    for (const a of p.aliases) map.set(wordForm(a), p.phase);
  }
  for (const [alias, phase] of Object.entries(extra)) map.set(wordForm(alias), phase);
  return map;
}

// The strategy of a name, or null.
const STRATEGY_MAP = new Map(STRATEGIES.flatMap((s) => [[s.strategy, s.strategy], ...s.aliases.map((a) => [wordForm(a), s.strategy])]));
export const strategyOf = (name) => STRATEGY_MAP.get(wordForm(name)) ?? null;

// true for yes, false for no, null for a value that is neither, and undefined for an empty value.
export function yesNo(value) {
  if (value === true || value === false) return value;
  const form = wordForm(value);
  if (form === '') return undefined;
  if (YES.includes(form)) return true;
  if (NO.includes(form)) return false;
  return null;
}
