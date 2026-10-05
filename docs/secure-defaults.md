# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest
of the document is about what the tool cannot do for you: which files you give it, where the output goes, and who may
change the runbook and the configuration. A passing result is not a go/no-go decision and not a certification; it is a
runbook with none of the problems the rules look for, not a finding that the move is ready.

## How the tool behaves by default

- **Reads, never follows.** The tool reads the runbook, the application file and the configuration it is given. It
  follows no symbolic link, fetches no web address, refuses an argument that looks like an address, runs no step,
  evaluates nothing, starts no program and writes nothing to disk.
- **Strict readers.** The CSV reader refuses a quote out of place and the JSON reader a repeated name, with the line
  and column ([decision 3](decisions/0003-read-csv-and-json-with-strict-readers-of-its-own.md)).
- **Every rule on from the first run.** A missing required phase, a change step with no rollback step, no backup before
  the first data move, no gate before the switch, an unknown dependency, a cycle, a duplicate id and a critical path
  longer than the window are errors; the rest are warnings.
- **Fail closed on what it cannot read.** A file that cannot be read, a file a reader refuses and a value that cannot
  be read are error findings that fail the run at the default `failOn` of `error`; these three rules have no key and
  cannot be lowered or set off. A path that cannot be used stops the run with exit code `2` and no result.
- **No guesses.** A phase, strategy, column or yes/no value that is none of the documented names is a finding; it is
  never matched to a near name.
- **Unknown keys are errors.** A key in the configuration that the tool does not know stops the run, with its line and
  a suggestion, so a typo such as `failOm` cannot leave a default in place. A key named twice stops the run.
- **No regular expression from the input.** No pattern is built from the runbook, the application file or the
  configuration.
- **No recursion.** Every walk of the dependency graph uses a list of its own, so a long chain cannot exhaust the
  stack.
- **No prototype tricks.** Objects are built with own properties and names are looked up in maps or with
  `Object.hasOwn`, so `__proto__` is only a name.
- **Clean output.** Text from the input, file names included, has control characters, line separators and direction
  controls removed and its length capped before it reaches a report or an error message. The GitHub format escapes
  `%`, CR and LF in a message and also `:` and `,` in a property. The CSV format puts a single quote in front of a field
  that a spreadsheet could read as a formula.
- **The same input gives the same output.** No clock, no zone, no locale and no random number
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`"failOn": "warning"`.** Missing owners and checks, a rollback that does not fit, a strategy mismatch and missing
  application fields fail the run too.
- **`requiredPhases`.** Add `freeze` and `hypercare` when every runbook of your team must have them.
- **`rules`.** Raise `noCommunicationPlan`, `missingBusinessSignOff` or `missingVerification` to `error` for a
  production cutover.
- **Keep `phaseAliases` short.** An alias decides what a step counts as; an alias that maps a meeting to `backup`
  hides a `no-backup-before-migrate` finding. Review each one.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Cutover runbook check
    run: npx --yes github:INNERLUXES/cutover-runbook-check cutover/runbook.csv --app cutover/application.json --config cutover/check.json --format github
```

- Give the job read access to the contents and nothing more. The tool needs no secret and no network access to the
  systems the runbook names.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because
  `npx` runs what it downloads.
- Do not hide the exit code with a trailing `|| true`. To see the report without failing, keep `failOn` at `error` and
  keep the JSON or CSV report as an artifact of the job.
- Treat a CSV report built from files you do not trust as untrusted data: open it with formulas off.

## Protecting the runbook and the configuration

The runbook decides the findings, and the configuration decides which rules report, which phases are required, which
names count as which phase and what fails the run. Keep them in the repository, put their paths in `CODEOWNERS` with
the people who own the cutover, and require their review in branch protection. Review a change that sets a rule to off
or lower, takes a phase out of `requiredPhases` or `windowPhases`, adds an alias, or raises `failOn` like a change to
code: each of them can hide a gap.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
