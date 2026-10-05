// The reports: text for a terminal, JSON for other tools, and GitHub workflow commands that turn each finding into an
// annotation on the file, line and column. The CSV report is in src/csv.js. Every text from the input (a file name, an
// id, an action, an owner or any other value) was cleaned by safeText before it reached the report object. The GitHub
// commands also escape the characters a command gives a meaning to, so a text in the input cannot end a command early
// or start another one.

import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';

const clean = (t, max = 200) => safeText(t, max);
const minutes = (n) => (n === null || n === undefined ? 'none' : `${grouped(n)} ${n === 1 ? 'minute' : 'minutes'}`);
const ENCODINGS = { 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE' };

function inputLine(r) {
  const b = r.input.runbook;
  const what = (f) => [f.kind.toUpperCase(), ...(f.read ? [ENCODINGS[f.encoding]] : ['not read'])].join(', ');
  const app = r.input.application;
  return `runbook ${b.file} (${what(b)}, ${plural(b.steps, 'step')}); ${app ? `application file ${app.file} (${what(app)})` : 'no application file'}`;
}

function configLine(r) {
  const c = r.config;
  const where = c.file ? `${c.file}${c.name ? ` (${clean(c.name, 120)})` : ''}` : 'built-in defaults';
  const aliases = Object.keys(c.phaseAliases).length;
  return `${where}: required phases ${listText(c.requiredPhases, 10) || 'none'}; window phases ${listText(c.windowPhases, 10) || 'none'}${aliases ? `; ${plural(aliases, 'phase alias', 'phase aliases')} from the configuration` : ''}; minimum severity ${c.minSeverity}; fail on ${c.failOn}`;
}

const rulesLine = (r) => r.config.rules.map((x) => `${x.id} (${x.level})`).join('; ');

function applicationLine(r) {
  const a = r.application;
  if (!a) return 'none';
  const strategy = a.strategy ? `${a.strategy}${a.strategyText && a.strategyText.toLowerCase() !== a.strategy ? ` (given as "${a.strategyText}")` : ''}` : a.strategyText ? `unknown ("${a.strategyText}")` : 'none';
  const plan = a.communicationPlan === true ? 'yes' : a.communicationPlan === false ? 'no' : 'none';
  return `${a.name || '(no name)'}; strategy ${strategy}; downtime window ${minutes(a.downtimeWindowMinutes)}; data owner ${a.dataOwner || 'none'}; business sign-off ${a.businessSignOff || 'none'}; communication plan ${plan}`;
}

function stepsLine(r) {
  const t = r.summary.totals;
  const path = r.summary.criticalPath;
  return `${grouped(t.steps)} in ${plural(t.phases, 'phase')}, ${minutes(t.minutes)} in all; critical path ${minutes(t.criticalPath)} over ${plural(path.steps.length, 'step')}; downtime window ${minutes(t.window)}${t.window === null ? '' : `, ${minutes(t.left)} left after the critical path`}; rollback ${minutes(t.rollback)}`;
}

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.config.minSeverity} not shown` : ''}`;
}

// A table with a header row and its columns padded to the widest cell.
function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const cell = (t, max = 60) => (t === '' || t === null || t === undefined ? '-' : clean(t, max));
const PAD = ' '.repeat(11);

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`cutover-runbook-check: ${r.input.runbook.file}`);
  out.push(`input: ${inputLine(r)}`);
  out.push(`config: ${configLine(r)}`);
  out.push(`rules: ${rulesLine(r)}`);
  out.push(`application: ${applicationLine(r)}`);
  out.push(`steps: ${stepsLine(r)}`);
  out.push(`findings: ${findingsLine(r)}`);
  const s = r.summary;
  out.push('', `Phases (${grouped(s.phases.filter((p) => p.phase !== null).length)})`, '');
  out.push(...table(['phase', 'steps', 'minutes', 'window', 'required'], s.phases.map((p) => [p.phase ?? '(unknown)', grouped(p.steps), grouped(p.minutes), p.inWindow ? 'yes' : 'no', p.required ? 'yes' : 'no'])), '');
  const path = s.criticalPath;
  out.push(`Critical path (${plural(path.steps.length, 'step')}, ${minutes(path.minutes)})`, '');
  if (path.steps.length) out.push(...table(['step', 'phase', 'minutes', 'action'], path.steps.map((x) => [cell(x.id), x.phase, grouped(x.minutes), cell(x.action, 80)])), '');
  else out.push('  none', '');
  out.push(`Steps (${grouped(r.steps.length)})`, '');
  if (r.steps.length) out.push(...table(['step', 'phase', 'minutes', 'gate', 'depends on', 'rollback', 'owner', 'line'], r.steps.map((x) => [cell(x.id), x.phase ?? `(${cell(x.phaseText, 20)})`, x.durationMinutes === null ? '-' : grouped(x.durationMinutes), x.gate ? 'yes' : '-', cell(x.dependsOn.join(', '), 40), cell(x.rollbackStep), cell(x.owner, 40), String(x.line)])), '');
  else out.push('  none', '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...r.config.rules.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.level.toUpperCase().padEnd(8)} ${f.rule.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.found}`);
    out.push(`${PAD}fix: ${f.fix}`);
    if (explain) {
      out.push(`${PAD}rule: ${r.config.rules.find((x) => x.id === f.rule).rule}`);
      for (const b of f.basis) out.push(`${PAD}basis: ${b.text} (${b.source}, ${b.url})`);
      if (f.own) out.push(`${PAD}the tool's own choice: ${f.own}`);
    }
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined, own: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

// The message of a workflow command: %, CR and LF escaped.
export const escapeData = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// A property of a workflow command: also : and , escaped.
export const escapeProperty = (t) => escapeData(t).replace(/:/g, '%3A').replace(/,/g, '%2C');

const COMMANDS = { error: 'error', warning: 'warning', info: 'notice' };

export function toGithub(r) {
  const out = [];
  for (const f of r.findings) {
    const props = [`file=${escapeProperty(f.file)}`, `line=${f.line}`, ...(f.column ? [`col=${f.column}`] : []), `title=${escapeProperty(`cutover-runbook-check ${f.rule}`)}`];
    out.push(`::${COMMANDS[f.level]} ${props.join(',')}::${escapeData(`${f.found}; fix: ${f.fix}`)}`);
  }
  const t = r.summary.totals;
  out.push(`cutover-runbook-check: ${plural(t.steps, 'step')}, critical path ${minutes(t.criticalPath)}, downtime window ${minutes(t.window)}, ${grouped(r.totals.findings)} ${r.totals.findings === 1 ? 'finding' : 'findings'}; RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}
