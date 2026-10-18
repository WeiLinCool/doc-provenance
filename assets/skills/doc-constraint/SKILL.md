---
name: doc-constraint
description: 'Use when setting up, configuring, or auditing a documentation constraint system in any repository — tiered taxonomy, bilingual pairing, word budgets, document headers with evidence levels (E0-E3), and mechanical gates (including Agent Notes). Triggers: "setup doc constraint", "init documentation system", "audit docs", "doc budgets", "bilingual pairing setup", "agent notes gate", "document header format", "evidence level", "is this doc accurate".'
user-invocable: true
---

# Documentation Constraint Skill

Apply a structured documentation discipline to any repository: tiered taxonomy,
bilingual pairing, word budgets, markdown-link checks, a document header that records
ownership, provenance, evidence level, and freshness, and the Agent Note format gate.
Everything is orchestrated by one config (`docs-constraint.yaml`) and one runner
(`run-gates.ts`), and every gate is self-contained—run it with plain
`node --experimental-strip-types` (Node >= 20.11), no `npm install` required.

## Scope

This skill is the **mechanical half** of the documentation system: it owns gates,
headers, budgets, and pairing state. How documents are written is owned by the
**doc-standard** skill; the two are composed by the **doc-flow** entry skill, which
routes setup/audit to this skill and writing/reviewing to doc-standard.

This skill is **guidance plus a portable, dependency-free toolchain**.

- Documentation standard (installed into the target repo): `docs/AGENTS.md`
- Header and evidence format spec: `docs/doc-header.md`
- Configuration schema: `docs-constraint.yaml` (`templates/docs-constraint.yaml`)
- Gate scripts: `scripts/` (budgets, headers, md-links, translation pairing, agent notes)
- Shared helpers: `scripts/doc-config.ts` (YAML-subset reader, globs, exclusions)
- Installer: `templates/install.ts` (`init` / `audit` / `ci`)
- Reference material: `references/tier-examples.md`, `references/slop-checklist.md`
- Gate regression tests: `scripts/verify-doc-headers.test.ts`

## Quick start

`init` vendors only the runtime surface (`SKILL.md`, `scripts/`, `references/`)
into `<repo>/.agents/skills/doc-constraint/`; the installer and templates are
one-shot init inputs and stay in the skill source checkout. From the target
repository root:

```bash
# Initialize (run once, from the skill source checkout): config, docs/ standard,
# format spec, .agents/notes/ tree, and the vendored runtime surface
node --experimental-strip-types /path/to/doc-constraint/templates/install.ts init

# Run every enabled gate (doc sync) — from the target repo, via the vendored copy
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts

# Audit documents: identity, owner, evidence level, freshness
node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-doc-headers.ts --list

# Audit without writing anything (same as running the gates)
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts

# Generate a GitHub Actions workflow (one-shot, from the skill source checkout)
node --experimental-strip-types /path/to/doc-constraint/templates/install.ts ci --platform github
```

## Configuration schema

`docs-constraint.yaml` declares five blocks, and the shipped template is the only
place their defaults are written down:

| Block | Declares |
|---|---|
| `tiers:` | The tier set, each with a `pattern`, a `job`, and an optional `budget` |
| `i18n:` | Whether pairing is on, the suffix map, and the paired scope |
| `gates:` | One boolean per gate; a gate set to false does not run |
| `gate_config:` | Per-gate settings: scopes, exclusions, freshness, review policy |
| `ci:` | The generated workflow's trigger and failure policy |

Read `templates/docs-constraint.yaml` for the field-by-field schema; this page
deliberately does not restate it, because two copies of a default drift apart and
the copy in the config is the one the gates enforce. Behaviours worth knowing:

- `required: false` audits only documents that already carry a header, for staged
  adoption; `strict: false` tolerates unknown header fields.
- `check_drift` compares an `evidence: - path:` entry's `commit` against the
  working tree with git, and is skipped where git is unavailable.
- `check_tests` resolves `evidence: - test:` names under `test_globs`.
- `i18n.enabled: false` is the right setting for a single-language repository.

## Core concepts

### Tier taxonomy

Each tier has one job, and a fact belongs to exactly one tier; elsewhere, link
there. The header's `type` pins the tier through `type_tiers`, so a fact filed in
the wrong tier fails the gate.

The installed `docs-constraint.yaml` is the authority on which tiers exist:
the shipped default declares `root-agents`, `architecture`, `subsystems`, and
`agent-notes`. Extending the set is a config edit, not a documentation edit, and
`references/tier-examples.md` shows the common shapes (package READMEs, cookbooks,
postmortems) with the pattern and budget each one takes.

### Document headers and evidence levels

Agents write most documentation and humans review it, so every in-scope document
opens with a header the gate can check: `id`, `type`, `status`, `owner`,
`evidence_level`, `source`, `evidence`, and `validated_at`, plus
`reviewed_by`/`reviewed_at` for accepted documents.

The level grades the evidence, not the author's confidence: **E0** is an agent's
unverified description, **E1** cites a human decision or upstream document, **E2** is
checkable against the tree as it is now, and **E3** was verified by a test or a
recorded command. Declaring more than the evidence supports is rejected; declaring
less is allowed. `accepted` additionally needs a human `reviewed_by` other than
the owner, a `reviewed_at` no older than the last validation, and a
`validated_at` inside `max_age_days`. Overstating evidence, letting it rot, or
self-approving is exactly the slop this gate exists to catch.

What each level requires, the field reference, per-type templates, and the
three-minute review protocol live in `docs/doc-header.md`; the table there is the
contract the gate enforces, so it is stated once.

### Bilingual pairing

When `i18n.enabled` is true, every in-scope document exists as a triplet:

- `foo.md` — source-language document
- `foo.zh.md` — translated counterpart
- `foo.i18n.yaml` — consistency record with git blob hashes

`verify-translation-pairing` enforces complete triplets, matching structural
signatures, language switchers, and recorded hashes. Translated counterparts must repeat
the source header verbatim; `verify-doc-headers` rejects a drifted one. Archived
Agent Notes are excluded (frozen).

After editing either side, re-record the pair with `--write`: it rewrites the sidecar
of every pair whose two sides are present and structurally identical, and still reports
the pairs that are not. That is the whole re-record step — no hand-computed hashes.

### Word budgets

Budgeted documents have `wc -w`-style ceilings enforced by `verify-doc-budgets`:

- At or below target: maintain headroom
- Above target: freeze ceiling until content reduces
- Raising a ceiling requires explicit justification

### Agent Notes

`verify-agent-note-format` and `verify-agent-note-classification` enforce the
uniform Agent Note header, lifecycle folders, class taxonomy, filenames, and the
frozen archive rules. See `.agents/notes/README.md` after initialization. A
repository with no `.agents/notes` tree passes these gates with a note instead of
crashing.

### Mechanical gates

| Gate | Enforces |
|------|----------|
| `verify-doc-budgets` | Word-count ceilings for standing docs |
| `verify-doc-headers` | Header schema, id/type agreement, human owner, provenance, evidence level vs evidence, freshness, review pair |
| `verify-md-links` | Relative link targets and fragment anchors |
| `verify-translation-pairing` | Bilingual triplet completeness and consistency |
| `verify-agent-note-format` | Agent Note header and skeleton format |
| `verify-agent-note-classification` | Agent Note lifecycle/class tree |
| `verify-archived-agent-notes` | Frozen archive hashes and triplets |

`run-gates.ts` dispatches every gate enabled in `docs-constraint.yaml`. Each gate
script is self-contained and dependency-free.

Every gate derives its repository root from the `--config` it was given — that file's
directory is the root — never from where its own script happens to sit
(`loadConfig()` in `scripts/doc-config.ts`). A gate that resolves paths any other way
can report "nothing to check" against a tree it never opened, which reads as a pass.

## Workflows

### Install (`init`)

1. Vendors the whole skill into `.agents/skills/doc-constraint/` (skipped when
   already present), so every gate is runnable from inside the target repository
   with no external path.
2. Writes `docs-constraint.yaml` from the template (skips if present).
3. Writes `AGENTS.md`, `docs/AGENTS.md`, and `docs/doc-header.md` (skips
   existing files; the spec's `validated_at` is stamped with the install day and
   skill-script references are retargeted to the vendored path).
4. Scaffolds `.agents/notes/{implemented,proposed,rejected,archived}/` with
   lifecycle `AGENTS.md` files.

The installed spec arrives at `status: review`. Promote it to `accepted` in
one change: re-verify its evidence, bump `validated_at`, set `reviewed_by` and
`reviewed_at`, then flip `status`.

### Audit (`audit` / `run-gates.ts`)

Runs every enabled gate and reports violations. Nothing is rewritten.
`--list` on the budget, pairing, and header gates reports state without failing.
Re-record a pair after editing either side with
`verify-translation-pairing.ts --write`; it writes only pairs that are structurally
identical and reports the rest.

### Doctor (`doctor`)

Compares the vendored runtime against this skill, rejects process artifacts, and checks
that the repository's own `AGENTS.md` still equals `templates/AGENTS.md.template`.
That last pair has no gate: `AGENTS.md` carries orders rather than claims, so an
adopted repository can edit it until it disagrees with the orders it hands to every new
install.

### CI (`ci`)

Writes a `.github/workflows/doc-sync.yml` that runs `run-gates.ts` on pull
requests and `main` pushes touching `**/*.md` or `docs-constraint.yaml`.

### Testing the gates

```bash
node --experimental-strip-types --test .agents/skills/doc-constraint/scripts/verify-doc-headers.test.ts
```

The header gate ships with fixtures covering each rule: level inflation, stale and
future dates, agent owners, missing evidence paths and tests, duplicate ids, missing
review pairs, drifted counterparts, and tier/type mismatches.

## Exclusions

- Generated catalogs are never hand-edited.
- Archived Agent Notes are frozen; excluded from audits.
- `vendor/` and `node_modules/` are always excluded from link discovery.
- Standing orders (`AGENTS.md`, `docs/AGENTS.md`), package readmes, and Agent Notes
  carry their own formats and are excluded from the header gate's default scope.