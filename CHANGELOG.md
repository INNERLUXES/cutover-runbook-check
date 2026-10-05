# Changes

## 1.0.0

First release.

- Reads the cutover runbook of one application: JSON with an application header and a list of steps, or CSV (RFC
  4180) with one record per step and the application in a JSON file named with `--app`, as UTF-8 or as UTF-16 after a
  byte order mark.
- Each step has an id, a phase (prepare, freeze, backup, migrate-data, switch, verify, rollback or hypercare, with
  documented aliases and `phaseAliases` in the configuration), an action, an owner, the ids it depends on, a duration in
  minutes, a go/no-go gate, how its success is checked and its rollback step. The application has a name, a migration
  strategy (the 7 Rs, with their other names), a downtime window in minutes, a data owner, a business sign-off and a
  communication plan. The CSV columns are matched by their names in any order.
- Sixteen rules in three levels: required phases with no step (`missing-phase`), change steps with no rollback step or
  one outside the rollback phase (`change-without-rollback`), no backup before the first data move in dependency order
  (`no-backup-before-migrate`), steps with no owner (`missing-owner`) or no check of success
  (`missing-verification`), no go/no-go gate before the first switch (`no-go-gate`), unknown dependencies
  (`unknown-dependency`), cycles with the way round them (`dependency-cycle`), duplicate ids (`duplicate-id`), a
  critical path longer than the downtime window (`critical-path-over-window`), rollback steps that do not fit what is
  left of it (`rollback-over-window`), a retired application that moves data or a retained one that switches
  (`strategy-mismatch`), and a missing name, strategy or window, business sign-off, data owner or communication plan;
  and three rules of input problems that cannot be lowered (`invalid-field`, `unreadable-file`, `unparsable-file`).
- The critical path is the longest chain of dependencies over the steps of the window phases, found with no recursion
  and with the dependencies inside a cycle left out; every report lists it, with the steps and minutes of each phase.
- Its own strict readers, with no dependency: CSV as RFC 4180 writes it, refusing a quote out of place, and JSON as RFC
  8259 writes it, refusing a repeated name, both with the line and column of every value.
- A configuration file in strict JSON over documented defaults: the level of every rule, the required phases, the
  window phases, the phase aliases, the minimum severity and the level that fails the run; a key the tool does not know
  is an error with its line and a suggestion, and a key named twice is refused.
- Reports as text, JSON, CSV with one row per finding (`--format csv`) and GitHub workflow commands (`--format github`)
  that show each finding as an annotation; `--min-severity`, `--fail-on`, `--explain` with the rule, the sources and the
  tool's own choice, and `--print-defaults`. Exit code `0` when no finding is at or above the fail-on level, `1` when
  one is, `2` for a usage or input error, with no result.
- Reads no clock, follows no symbolic link, connects to nothing, runs nothing, writes nothing to disk, reports binary
  and invalid input as errors, neutralizes formulas in the CSV report, and has a size limit on every input.
- A check before the migration night, not a go/no-go decision and not a certification: every report says so.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
