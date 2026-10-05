# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "cutover-runbook-check security", or use private vulnerability
reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up runbook, application file or configuration that shows the problem, the command you ran, what
you expected and what happened. Use made-up companies, applications, hosts and people, never the runbook of a real
organisation, and never a real password, host name or address, even an old one.

## Scope

In scope:

- an input that makes the tool read a file other than the runbook, the application file and the configuration it was
  given, or follow a symbolic link
- an input that makes the tool open a network connection, reach a host a runbook names, run a step or a program, or
  evaluate any part of a file
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large
  file, a long chain or cycle of steps, wide fans of dependencies, runs of quotes or JSON nested deep
- binary or invalid input that the tool reads as if it were text
- an input that the tool fails to read and passes over without an error finding, or a value it reads as another than
  the one written
- a run that passes at a `failOn` level although the runbook holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, starts or ends a
  GitHub workflow command, is shown unescaped in the output, or starts a formula in the CSV report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not read, whether the owners, durations, checks and rollback
steps of a runbook are true (a passing result is not a go/no-go decision and not a certification), who may change the
runbook or the configuration in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
