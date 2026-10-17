# Agent Note: Adopt the doc-provenance doc constraint in this repository

Status: implemented

## Problem

doc-provenance ships its own doc-constraint skill, but the repository it constrains had never been constrained by it: no `docs-constraint.yaml`, no headers, no gates wired into CI. A platform that sells mechanical documentation honesty was itself unverified — the README's claims about E0–E3, freshness, and budgets were readable prose with no gate behind them.

## Decision

Run the platform against itself, using the same installer it ships, so the repository becomes its own first adopter.

- `doc-provenance init .` vendored the runtime surface of `doc-constraint`, `doc-standard`, and `doc-flow` into `.agents/skills/`, wrote `docs-constraint.yaml`, `AGENTS.md`, `docs/AGENTS.md`, `docs/doc-header.md`, and the `.agents/notes/` lifecycle tree.
- `README.md` keeps its English source and gains a `README.zh.md` counterpart plus a `README.i18n.yaml` sidecar, because `docs-constraint.yaml` ships with `i18n.enabled: true` and lists `README.md` in `scope_patterns`.
- `doc-provenance ci .` wrote `.github/workflows/doc-sync.yml` so the gates run on pull requests and `main` pushes that touch Markdown.

The first gate run failed on exactly one item: the missing README triplet. The fix was the documentation, not the gate.

## Consequences

- Every gate now passes (`run-gates: 6 gate(s) passed`), and the README pair is recorded at blob hashes both sides agree on. Editing either README side without re-recording the pair fails the gate.
- `docs/doc-header.md` is installed at `status: review`, so a human still has to promote it to `accepted`; agents must not self-approve it. The same applies to this note's sibling docs.
- The `AGENTS.md` tier is budgeted at 1600 words and `docs/architecture.md` at 1800, but neither file exists yet; those checks only bind once the files are written.
- The Agent Note gates report "no `.agents/notes` tree; nothing to check" even though `init` created one. The walker resolves its root as `resolve(scripts/, '../.agents/notes')`, which lands inside the vendored skill directory (`.agents/skills/doc-constraint/.agents/notes`) and therefore never sees the repository root tree. The gates are vacuous until that path is fixed; this note is written in the enforced format regardless so it passes once discovery works.
- `docflow status` still reports "Incomplete installation" before the CI workflow exists; after `ci` it is the only remaining gap closed.

## Alternatives considered

- **Disable bilingual pairing (`i18n.enabled: false`)** instead of translating the README. Rejected: the template ships pairing on and lists `README.md` in scope, so turning it off would be weakening the contract to fit the docs — the one move the design rules forbid.
- **Translate only, without the sidecar.** Rejected: the gate requires the `README.i18n.yaml` record; a pair without recorded hashes cannot distinguish a confirmed pair from a one-sided edit.
- **Write a hand-rolled header onto `README.md`** to raise its evidence level. Rejected: `README.md` sits in the header gate's exclusion list by design, and the installed spec is the document that carries the evidence header.