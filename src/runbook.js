// Reading a runbook: the steps of a JSON runbook or of a CSV runbook, and the application, from the header object of a
// JSON runbook or from the application file of a CSV runbook. Each step keeps the line and column of each of its
// fields, so a finding points at the value it is about. A value the tool cannot read (a step with no id, a phase that is
// none of the phases or their aliases, a duration that is not a whole number of minutes, a gate that is neither yes nor
// no, a column or key the tool does not know) is an invalid-field finding, always an error; the step is still listed,
// with that value left empty, so the other rules still see it. A file that is not CSV or JSON the readers accept is an
// unparsable-file finding, and nothing in it is read. Nothing is guessed: a name is never matched to a near one.

import { kindOf, suggestion } from './config.js';
import { JsonError, jsonProblem, lineStarts, parseJson, positionOf } from './json.js';
import { PHASE_NAMES, strategyOf, STRATEGY_NAMES, yesNo } from './phases.js';
import { TABLE_LIMITS, TableError, parseCsv, tableProblem } from './table.js';
import { flat } from './text.js';
import { fieldForm, wordForm } from './words.js';

// The longest a runbook may be, the form of an id and the longest duration or window, in minutes (a week).
export const RUNBOOK_LIMITS = { maxSteps: TABLE_LIMITS.maxRecords, maxDependencies: 200, maxJsonValues: 4000000 };
export const ID_FORM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const MAX_MINUTES = 10080;

// The fields of a step: the key of a JSON runbook, and the column names of a CSV runbook in their field form.
export const STEP_FIELDS = {
  id: ['id', 'stepid', 'step'],
  phase: ['phase', 'stage'],
  action: ['action', 'task', 'description'],
  owner: ['owner', 'responsible', 'assignee'],
  dependsOn: ['dependson', 'dependencies', 'depends', 'predecessors'],
  durationMinutes: ['durationminutes', 'duration', 'minutes', 'durationmin', 'mins'],
  gate: ['gate', 'gonogo', 'gonogogate'],
  verification: ['verification', 'verify', 'validation', 'successcheck'],
  rollbackStep: ['rollbackstep', 'rollback', 'rollbackid', 'backout']
};

// The fields of the application, the same in the header object of a JSON runbook and in an application file.
export const APPLICATION_FIELDS = ['name', 'strategy', 'downtimeWindowMinutes', 'dataOwner', 'businessSignOff', 'communicationPlan'];

// The keys of a JSON runbook.
export const RUNBOOK_KEYS = ['application', 'steps'];

const COLUMN_OF = new Map(Object.entries(STEP_FIELDS).flatMap(([key, forms]) => forms.map((f) => [f, key])));
const quoted = (v, max = 60) => `"${String(v).slice(0, max)}"`;

// A finding of an input problem.
const problem = (rule, file, at, found, step = '', phase = null, stepAt = '') => ({ rule, file, line: at.line, column: at.column, step, phase, stepAt, found });

// The ids of a depends-on value: a list of texts, or one text with the ids separated by semicolons, commas or spaces.
function idsOf(value) {
  if (Array.isArray(value)) return value;
  return String(value).split(/[;,\s]+/).filter((x) => x !== '');
}

// A whole number from a number or from a text of digits, or NaN.
const wholeNumber = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d{1,6}\s*$/.test(v) ? Number(v) : NaN);

// One step from its raw values (texts from a CSV record, values of any kind from a JSON object), with the places of its
// fields and of the step itself. Problems are added to the list.
export function readStep(raw, places, stepAt, file, config, problems) {
  const at = (key) => places[key] ?? stepAt;
  const shownId = typeof raw.id === 'string' && raw.id.trim() !== '' ? flat(raw.id).slice(0, 64) : '';
  const bad = (key, found) => problems.push(problem('invalid-field', file, at(key), found, shownId, null, `${stepAt.line}:${stepAt.column}`));
  const text = (key, label) => {
    const v = raw[key];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') {
      bad(key, `the ${label} of the step${shownId ? ` "${shownId}"` : ''} must be a text, not ${kindOf(v)}`);
      return '';
    }
    return flat(v);
  };
  const who = shownId ? `the step "${shownId}"` : 'a step';
  const step = { id: '', shownId, phase: null, phaseText: '', action: '', owner: '', dependsOn: [], duration: null, gate: false, verification: '', rollbackStep: '', line: stepAt.line, column: stepAt.column, places: {} };
  for (const key of Object.keys(STEP_FIELDS)) step.places[key] = at(key);

  const id = text('id', 'id');
  if (id === '') bad('id', 'a step has no id; it is listed, and no other step can depend on it');
  else if (!ID_FORM.test(id)) bad('id', `the id ${quoted(id)} is not an id the tool reads: 1 to 64 letters A to Z, digits, dots, underscores and hyphens, starting with a letter or a digit`);
  else step.id = id;

  step.phaseText = text('phase', 'phase');
  if (step.phaseText === '') bad('phase', `${who} has no phase`);
  else {
    step.phase = config.phases.get(wordForm(step.phaseText)) ?? null;
    if (step.phase === null) bad('phase', `${who} has the phase ${quoted(step.phaseText)}, which is none of the phases (${PHASE_NAMES.join(', ')}) or their aliases${suggestion(wordForm(step.phaseText), [...config.phases.keys()])}`);
  }

  step.action = text('action', 'action');
  step.owner = text('owner', 'owner');
  step.verification = text('verification', 'verification');

  const deps = raw.dependsOn;
  if (deps !== undefined && deps !== null) {
    if (typeof deps !== 'string' && !Array.isArray(deps)) bad('dependsOn', `the depends-on of ${who} must be a list of ids or a text, not ${kindOf(deps)}`);
    else {
      const ids = idsOf(deps);
      if (ids.length > RUNBOOK_LIMITS.maxDependencies) bad('dependsOn', `${who} depends on more than ${RUNBOOK_LIMITS.maxDependencies} steps`);
      else {
        for (const d of ids) {
          if (typeof d !== 'string' || !ID_FORM.test(d.trim())) bad('dependsOn', `the depends-on of ${who} holds ${typeof d === 'string' ? quoted(d) : kindOf(d)}, which is not an id`);
          else if (!step.dependsOn.includes(d.trim())) step.dependsOn.push(d.trim());
        }
      }
    }
  }

  const dur = raw.durationMinutes;
  if (dur === undefined || dur === null || (typeof dur === 'string' && dur.trim() === '')) bad('durationMinutes', `${who} has no duration`);
  else {
    const number = wholeNumber(dur);
    if (!Number.isInteger(number) || number < 0 || number > MAX_MINUTES) bad('durationMinutes', `the duration of ${who}, ${typeof dur === 'string' ? quoted(dur) : typeof dur === 'number' ? String(dur) : kindOf(dur)}, is not a whole number of minutes from 0 to ${MAX_MINUTES.toLocaleString('en-US')}`);
    else step.duration = number;
  }

  if (raw.gate !== undefined && raw.gate !== null) {
    const g = typeof raw.gate === 'string' || typeof raw.gate === 'boolean' ? yesNo(raw.gate) : null;
    if (g === null) bad('gate', `the go/no-go gate of ${who}, ${typeof raw.gate === 'string' ? quoted(raw.gate) : kindOf(raw.gate)}, is neither yes nor no`);
    else step.gate = g === true;
  }

  const rb = text('rollbackStep', 'rollback step');
  if (rb !== '' && !ID_FORM.test(rb)) bad('rollbackStep', `the rollback step of ${who}, ${quoted(rb)}, is not an id`);
  else step.rollbackStep = rb;
  return step;
}

// The application from its raw values and the places of its fields. Problems are added to the list.
export function readApplication(raw, places, appAt, file, problems) {
  const at = (key) => places[key] ?? appAt;
  const invalid = new Set();
  const bad = (key, found) => {
    invalid.add(key);
    problems.push(problem('invalid-field', file, at(key), found));
  };
  const app = { name: '', strategy: null, strategyText: '', window: null, dataOwner: '', businessSignOff: '', communicationPlan: null, file, line: appAt.line, column: appAt.column, places: {}, invalid };
  for (const key of APPLICATION_FIELDS) app.places[key] = at(key);
  const text = (key, label) => {
    const v = raw[key];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') {
      bad(key, `the ${label} of the application must be a text, not ${kindOf(v)}`);
      return '';
    }
    return flat(v);
  };
  app.name = text('name', 'name');
  app.strategyText = text('strategy', 'strategy');
  if (app.strategyText !== '') {
    app.strategy = strategyOf(app.strategyText);
    if (app.strategy === null) bad('strategy', `the strategy ${quoted(app.strategyText)} is none of the seven migration strategies (${STRATEGY_NAMES.join(', ')}) or their other names`);
  }
  const w = raw.downtimeWindowMinutes;
  if (w !== undefined && w !== null && !(typeof w === 'string' && w.trim() === '')) {
    const number = wholeNumber(w);
    if (!Number.isInteger(number) || number < 0 || number > MAX_MINUTES) bad('downtimeWindowMinutes', `the downtime window of the application, ${typeof w === 'number' ? String(w) : typeof w === 'string' ? quoted(w) : kindOf(w)}, is not a whole number of minutes from 0 to ${MAX_MINUTES.toLocaleString('en-US')}`);
    else app.window = number;
  }
  app.dataOwner = text('dataOwner', 'data owner');
  app.businessSignOff = text('businessSignOff', 'business sign-off');
  const c = raw.communicationPlan;
  if (c !== undefined && c !== null) {
    const v = typeof c === 'string' || typeof c === 'boolean' ? yesNo(c) : null;
    if (v === null) bad('communicationPlan', `the communication plan of the application, ${typeof c === 'string' ? quoted(c) : kindOf(c)}, is neither yes nor no`);
    else if (v !== undefined) app.communicationPlan = v;
  }
  return app;
}

// The place of a path of a parsed JSON text.
const placeOf = (parsed, path, fallback = { line: 1, column: 1 }) => (parsed.lines.has(path) ? { line: parsed.lines.get(path), column: parsed.columns.get(path) } : fallback);

// Reads a JSON object of the application (the header of a JSON runbook, or an application file) with its places.
function applicationFromJson(value, parsed, prefix, file, problems) {
  const at = placeOf(parsed, prefix);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    problems.push(problem('invalid-field', file, at, `the application must be a JSON object, not ${kindOf(value)}`));
    return null;
  }
  const places = {};
  for (const k of Object.keys(value)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!APPLICATION_FIELDS.includes(k)) problems.push(problem('invalid-field', file, placeOf(parsed, path, at), `${quoted(k)} is not a field of the application${suggestion(k, APPLICATION_FIELDS)}`));
    else places[k] = placeOf(parsed, path, at);
  }
  const raw = Object.fromEntries(APPLICATION_FIELDS.filter((k) => Object.hasOwn(value, k)).map((k) => [k, value[k]]));
  return readApplication(raw, places, at, file, problems);
}

// An unparsable runbook: no step, and the reason.
const unparsable = (file, kind, at, found) => ({ file, kind, read: true, parsed: false, steps: [], application: null, stepsAt: at, problems: [problem('unparsable-file', file, at, found)] });

// A runbook in JSON: { "application": {...}, "steps": [{...}] }.
export function readRunbookJson(text, file, config) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 3, maxValues: RUNBOOK_LIMITS.maxJsonValues });
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    const pos = positionOf(lineStarts(text), Math.min(error.offset, text.length));
    return unparsable(file, 'json', pos, `${jsonProblem(error, text)}; nothing in the file is read`);
  }
  const root = parsed.value;
  const top = { line: 1, column: 1 };
  if (root === null || typeof root !== 'object' || Array.isArray(root)) return unparsable(file, 'json', placeOf(parsed, '', top), `the runbook must be a JSON object with a steps list, not ${kindOf(root)}; nothing in the file is read`);
  if (!Object.hasOwn(root, 'steps') || !Array.isArray(root.steps)) return unparsable(file, 'json', Object.hasOwn(root, 'steps') ? placeOf(parsed, 'steps') : top, `the runbook has no steps list${Object.hasOwn(root, 'steps') ? ` (steps is ${kindOf(root.steps)})` : ''}; nothing in the file is read`);
  if (root.steps.length > RUNBOOK_LIMITS.maxSteps) return unparsable(file, 'json', placeOf(parsed, 'steps'), `the runbook holds more than ${RUNBOOK_LIMITS.maxSteps.toLocaleString('en-US')} steps; nothing in the file is read`);
  const problems = [];
  for (const k of Object.keys(root)) if (!RUNBOOK_KEYS.includes(k)) problems.push(problem('invalid-field', file, placeOf(parsed, k), `${quoted(k)} is not a key of a runbook${suggestion(k, RUNBOOK_KEYS)}`));
  const application = Object.hasOwn(root, 'application') && root.application !== null ? applicationFromJson(root.application, parsed, 'application', file, problems) : null;
  const keys = Object.keys(STEP_FIELDS);
  const steps = [];
  root.steps.forEach((s, i) => {
    const prefix = `steps[${i}]`;
    const stepAt = placeOf(parsed, prefix);
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      problems.push(problem('invalid-field', file, stepAt, `${prefix} must be a JSON object, not ${kindOf(s)}; it is not read`));
      return;
    }
    const places = {};
    for (const k of Object.keys(s)) {
      if (!keys.includes(k)) problems.push(problem('invalid-field', file, placeOf(parsed, `${prefix}.${k}`, stepAt), `${quoted(k)} is not a field of a step${suggestion(k, keys)}`));
      else places[k] = placeOf(parsed, `${prefix}.${k}`, stepAt);
    }
    const raw = Object.fromEntries(keys.filter((k) => Object.hasOwn(s, k)).map((k) => [k, s[k]]));
    steps.push(readStep(raw, places, stepAt, file, config, problems));
  });
  return { file, kind: 'json', read: true, parsed: true, steps, application, stepsAt: placeOf(parsed, 'steps'), problems };
}

// A runbook in CSV: a header line naming the columns, then one record per step.
export function readRunbookCsv(text, file, config) {
  let records;
  try {
    records = parseCsv(text);
  } catch (error) {
    if (!(error instanceof TableError)) throw error;
    return unparsable(file, 'csv', { line: error.line, column: error.column }, `${tableProblem(error)}; nothing in the file is read`);
  }
  const top = { line: 1, column: 1 };
  if (!records.length) return unparsable(file, 'csv', top, 'the file holds no header line and no step; nothing in the file is read');
  const [header, ...rows] = records;
  const headerAt = { line: header.line, column: 1 };
  const problems = [];
  const columns = [];
  const known = [...COLUMN_OF.keys()];
  for (const f of header.fields) {
    const form = fieldForm(f.value);
    const key = COLUMN_OF.get(form) ?? null;
    const at = { line: f.line, column: f.column };
    if (key === null) problems.push(problem('invalid-field', file, at, `the column ${quoted(flat(f.value))} is not a column the tool reads${suggestion(form, known)}; its values are not read`));
    else if (columns.includes(key)) problems.push(problem('invalid-field', file, at, `the column ${quoted(flat(f.value))} names the field ${key} a second time; its values are not read`));
    columns.push(key !== null && !columns.includes(key) ? key : null);
  }
  for (const required of ['id', 'phase']) {
    if (!columns.includes(required)) {
      const u = unparsable(file, 'csv', headerAt, `the header line has no ${required} column (${STEP_FIELDS[required].join(', ')}); nothing in the file is read`);
      u.problems = [...problems, ...u.problems];
      return u;
    }
  }
  const steps = [];
  for (const r of rows) {
    const stepAt = { line: r.line, column: 1 };
    if (r.fields.length !== header.fields.length) problems.push(problem('invalid-field', file, stepAt, `the record has ${r.fields.length} ${r.fields.length === 1 ? 'field' : 'fields'} and the header line ${header.fields.length}; ${r.fields.length > header.fields.length ? 'the fields past the header are not read' : 'the missing fields are read as empty'}`));
    const raw = {};
    const places = {};
    columns.forEach((key, c) => {
      if (key === null || c >= r.fields.length) return;
      raw[key] = r.fields[c].value;
      places[key] = { line: r.fields[c].line, column: r.fields[c].column };
    });
    steps.push(readStep(raw, places, stepAt, file, config, problems));
  }
  return { file, kind: 'csv', read: true, parsed: true, steps, application: null, stepsAt: headerAt, problems };
}

// An application file of a CSV runbook: one JSON object with the fields of the application.
export function readApplicationFile(text, file) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 1 });
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    const pos = positionOf(lineStarts(text), Math.min(error.offset, text.length));
    return { application: null, problems: [problem('unparsable-file', file, pos, `${jsonProblem(error, text)}; nothing in the file is read`)] };
  }
  const problems = [];
  const value = parsed.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { application: null, problems: [problem('unparsable-file', file, { line: 1, column: 1 }, `the application file must be a JSON object, not ${kindOf(value)}; nothing in the file is read`)] };
  return { application: applicationFromJson(value, parsed, '', file, problems), problems };
}
