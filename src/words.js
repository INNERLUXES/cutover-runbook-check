// Words compared as the tool compares them: the letters A to Z lowered whatever the locale. Used for the names of
// files, the phases, the strategies, the yes and no values, the columns of a CSV runbook and the suggestions of the
// configuration.

// Lowercase for the letters A to Z only, so the result does not depend on the locale.
export const asciiLower = (text) => String(text).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

// The last part of a path with forward slashes: "a/b/runbook.csv" is "runbook.csv".
export const baseName = (path) => String(path).slice(String(path).lastIndexOf('/') + 1);

// The form a column name is compared in: the letters A to Z lowered and everything that is not a letter A to Z or a
// digit taken out. "Depends-On", "depends_on" and "dependsOn" are all "dependson".
export const fieldForm = (text) => asciiLower(text).replace(/[^a-z0-9]+/g, '');

// The form a phase or strategy name is compared in: trimmed, the letters A to Z lowered, and every run of spaces,
// underscores and hyphens made one hyphen. "Data Sync", "data_sync" and "data-sync" are one name; "datasync" is
// another.
export const wordForm = (text) => asciiLower(String(text).trim()).replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

// Two texts in the order of their UTF-16 code units, with no locale.
export const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
