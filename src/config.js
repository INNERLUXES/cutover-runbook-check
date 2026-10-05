// The configuration file: the settings of the tool, in one strict JSON object over the built-in defaults. Every key the
// tool does not know is an error with its line and a suggestion, so a typo cannot leave a default in place unnoticed;
// the JSON reader refuses a name given twice in one object. The configuration is optional: with none, the defaults
// apply.

import { LEVELS } from './data.js';
import { DEFAULT_FAIL_ON, DEFAULT_MIN_SEVERITY, DEFAULT_REQUIRED_PHASES, DEFAULT_RULES, DEFAULT_WINDOW_PHASES } from './defaults.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { PHASE_NAMES, phaseMap } from './phases.js';
import { asciiLower, wordForm } from './words.js';

export const CONFIG_LIMITS = { maxAliases: 200, maxAliasLength: 60 };

// Every key of the configuration file, with the kind of its value. docs/inputs.md describes each of them.
export const KEYS = {
  name: 'text',
  rules: Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, 'level or off'])),
  requiredPhases: 'list of phases',
  windowPhases: 'list of phases',
  phaseAliases: 'object of names to phases',
  minSeverity: 'level',
  failOn: 'level'
};

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The edit distance of two short names, for a suggestion: an insertion, a deletion, a change or two neighbours swapped
// ("nmae" for "name") each count one.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The closest of the known names, when it is close enough to be a typo: '; did you mean "..."?' or nothing. A name that
// differs in length from a known name by more than three characters, or that is longer than 64 characters, is not
// compared with it.
export function suggestion(name, known) {
  if (name.length > 64) return '';
  let best = null;
  for (const k of known) {
    if (Math.abs(name.length - k.length) > 3 || k.length > 64) continue;
    const d = distance(asciiLower(name), asciiLower(k));
    if (d <= Math.max(1, Math.floor(k.length / 3)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? `; did you mean "${best.k}"?` : '';
}

export function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The built-in configuration, as the checks use it.
export function defaultConfig() {
  return {
    file: null,
    name: null,
    rules: { ...DEFAULT_RULES },
    requiredPhases: [...DEFAULT_REQUIRED_PHASES],
    windowPhases: [...DEFAULT_WINDOW_PHASES],
    phaseAliases: {},
    phases: phaseMap(),
    minSeverity: DEFAULT_MIN_SEVERITY,
    failOn: DEFAULT_FAIL_ON
  };
}

// The built-in configuration written as a configuration file, for --print-defaults. Read back, it gives the defaults;
// phaseAliases is empty because it adds to the built-in aliases of src/phases.js.
export function defaultsAsConfig() {
  const d = defaultConfig();
  return { name: 'built-in defaults', rules: d.rules, requiredPhases: d.requiredPhases, windowPhases: d.windowPhases, phaseAliases: {}, minSeverity: d.minSeverity, failOn: d.failOn };
}

// Checks a parsed configuration and builds the configuration the checks use, or throws ConfigError with every problem.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const lineOf = (path) => {
    for (let p = path, prev = null; p && p !== prev; prev = p, p = p.replace(/(?:\.[^.[]+|\[\d+\])$/, '')) if (lines.has(p)) return lines.get(p);
    return 1;
  };
  const fail = (path, message) => problems.push({ line: lineOf(path), text: `${file}: line ${lineOf(path)}: ${message}` });
  const config = defaultConfig();
  config.file = file;
  if (!isObject(value)) throw new ConfigError([`${file}: line 1: the configuration must be a JSON object, not ${kindOf(value)}`]);
  const show = (v) => (typeof v === 'string' ? `"${v.slice(0, 40)}"` : kindOf(v));

  const top = Object.keys(KEYS);
  for (const k of Object.keys(value)) if (!top.includes(k)) fail(k, `"${k.slice(0, 60)}" is not a key of the configuration${suggestion(k, top)}`);

  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 120) fail('name', 'name must be a text of 1 to 120 characters');
    else config.name = value.name;
  }

  if (Object.hasOwn(value, 'rules')) {
    const v = value.rules;
    const keys = Object.keys(DEFAULT_RULES);
    const levels = [...LEVELS, 'off'];
    if (!isObject(v)) fail('rules', `rules must be an object, not ${kindOf(v)}`);
    else {
      for (const k of Object.keys(v)) {
        const path = `rules.${k}`;
        if (!keys.includes(k)) fail(path, `"${k.slice(0, 60)}" is not a key of rules${suggestion(k, keys)}`);
        else if (typeof v[k] !== 'string' || !levels.includes(v[k])) fail(path, `${path} must be one of ${levels.join(', ')}, not ${typeof v[k] === 'number' ? String(v[k]) : show(v[k])}`);
        else config.rules[k] = v[k];
      }
    }
  }

  // The aliases come first, so the lists of phases can use them.
  if (Object.hasOwn(value, 'phaseAliases')) {
    const v = value.phaseAliases;
    if (!isObject(v)) fail('phaseAliases', `phaseAliases must be an object of names to phases, not ${kindOf(v)}`);
    else if (Object.keys(v).length > CONFIG_LIMITS.maxAliases) fail('phaseAliases', `phaseAliases holds more than ${CONFIG_LIMITS.maxAliases} names`);
    else {
      const seen = new Map();
      for (const k of Object.keys(v)) {
        const path = `phaseAliases.${k}`;
        const form = wordForm(k);
        if (form === '' || k.length > CONFIG_LIMITS.maxAliasLength) fail(path, `the name "${k.slice(0, 60)}" must hold 1 to ${CONFIG_LIMITS.maxAliasLength} characters with a letter or a digit`);
        else if (PHASE_NAMES.includes(form)) fail(path, `"${k.slice(0, 60)}" is a phase itself and cannot be an alias`);
        else if (seen.has(form)) fail(path, `"${k.slice(0, 60)}" is the same name as "${seen.get(form)}" once compared (${form})`);
        else if (typeof v[k] !== 'string' || !PHASE_NAMES.includes(v[k])) fail(path, `${path} must be one of the phases ${PHASE_NAMES.join(', ')}, not ${show(v[k])}${typeof v[k] === 'string' ? suggestion(v[k], PHASE_NAMES) : ''}`);
        else {
          seen.set(form, k);
          // Defined as an own property, so a name such as __proto__ is only a name.
          Object.defineProperty(config.phaseAliases, k, { value: v[k], enumerable: true, writable: true, configurable: true });
        }
      }
      config.phases = phaseMap(config.phaseAliases);
    }
  }

  for (const key of ['requiredPhases', 'windowPhases']) {
    if (!Object.hasOwn(value, key)) continue;
    const v = value[key];
    if (!Array.isArray(v)) {
      fail(key, `${key} must be a list of phases, not ${kindOf(v)}`);
      continue;
    }
    if (v.length > 50) {
      fail(key, `${key} holds more than 50 entries`);
      continue;
    }
    const list = [];
    v.forEach((x, i) => {
      const path = `${key}[${i}]`;
      const phase = typeof x === 'string' ? config.phases.get(wordForm(x)) : undefined;
      if (phase === undefined) fail(path, `${path} must be one of the phases ${PHASE_NAMES.join(', ')} or an alias of one, not ${show(x)}${typeof x === 'string' ? suggestion(wordForm(x), PHASE_NAMES) : ''}`);
      else if (!list.includes(phase)) list.push(phase);
    });
    config[key] = PHASE_NAMES.filter((p) => list.includes(p));
  }

  for (const key of ['minSeverity', 'failOn']) {
    if (!Object.hasOwn(value, key)) continue;
    if (!LEVELS.includes(value[key])) fail(key, `${key} must be one of ${LEVELS.join(', ')}`);
    else config[key] = value[key];
  }
  // The problems in the order of their lines, so the list reads like the file.
  if (problems.length) throw new ConfigError(problems.sort((a, b) => a.line - b.line).map((p) => p.text));
  return config;
}

// Reads the text of a configuration file.
export function readConfig(text, file) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 3 });
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([`${file}: ${jsonProblem(error, text)}`]);
    throw error;
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
