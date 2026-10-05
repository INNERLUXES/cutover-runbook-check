// The kind of a file, from its name: a runbook is read when its name ends in .json or .csv, and an application file
// when its name ends in .json, compared without regard to the case of the letters A to Z. A file of another kind named
// on the command line stops the run, so a file is never passed over in silence.

import { asciiLower, baseName } from './words.js';

// The kinds the tool reads.
export const KINDS = ['csv', 'json'];

// The kind of a path, or null.
export function fileKind(path) {
  const name = asciiLower(baseName(path));
  if (name.endsWith('.csv') && name.length > 4) return 'csv';
  if (name.endsWith('.json') && name.length > 5) return 'json';
  return null;
}
