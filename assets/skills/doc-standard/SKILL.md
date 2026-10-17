---
name: doc-standard
description: 'Write, restructure, review, audit, or migrate repository Markdown documentation and package READMEs in any repository — audience-first hierarchy, kind-mapped YAML metadata, bilingual line alignment, summary/contents navigation, progressive user-to-developer detail, and executed-operation fact-checking. Triggers: "write docs", "package README", "restructure documentation", "doc review", "doc audit", "bilingual docs", "migration guide".'
---

# Repository documentation standard

## Summary

A repository-agnostic documentation standard adapted from the DeepSeek Harness doc
system: make every page searchable, newcomer-readable, and exact enough for agents
and maintainers. Apply repository `AGENTS.md` files and executed gates first, then
this workflow for kind-mapped metadata, progressive detail, line-aligned bilingual
pages, and corpus audits. Preserve one owner per fact: source, tests, generated
catalogs, package READMEs, guides, decision notes, and scratch each keep their own
kind of truth. The mechanical constraint system (headers, budgets, pairing gates)
is owned by the **doc-constraint** skill; this skill owns how documents are written.

## Table of Contents

- [Workflow](#workflow)
- [Fact-check procedure: test, do not assume](#fact-check-procedure-test-do-not-assume)
- [Kind system and templates](#kind-system-and-templates)
- [Voice rules](#voice-rules)
- [Quality criteria](#quality-criteria)
- [Audit the corpus](#audit-the-corpus)
- [Validation](#validation)

## Workflow

Follow this sequence for each requested scope. Keep the common reader path brief,
but do not delete failures, ownership, limitations, or other required contracts
merely to reduce words.

1. Read root and more-specific `AGENTS.md`, the repository documentation standard
   (for example `docs/AGENTS.md` installed by doc-constraint), the target page,
   its source/tests, its navigation owner, and its bilingual record.
2. Classify the page by one primary job and reader: product quick start, user task
   guide, contributor tutorial, architecture overview, package/subsystem reference,
   generated reference, agent instruction, decision record, or scratch.
3. Place the page at its nearest owner. Keep package contracts beside package code;
   use `docs/` for cross-package learning, user, developer, architecture,
   discussion, and expiring scratch material.
4. Define the reader’s starting state, observable outcome, likely failure, recovery
   path, and next useful depth before writing details.
5. Add or revise YAML metadata — assign the `kind` that maps to the template for
   this document’s job — then write `Summary`, `Table of Contents`, user-facing
   content, developer-facing content, optional `Further Exploration`, and a final
   `Dev Note` in that order where the document type permits.
6. Update the bilingual counterpart in the same pass. Keep headings, lists, tables,
   code, links, frontmatter layout, and physical line count aligned.
7. Verify every claim against code, tests, generators, package metadata, or a
   current decision owner — and run the operations the page instructs, per the
   fact-check procedure below. Update the owner before any derivative artifact.
8. Run the repository’s focused checks and its doc gates (see [Validation](#validation));
   re-read the complete diff for correctness and then for brevity and repository fit.

## Fact-check procedure: test, do not assume

Documentation states how the product behaves today, and the only admissible evidence
for an operation claim is having run it. This procedure is mandatory for every new
document and every new paragraph that claims an operation, command, default, error,
or platform difference.

1. **Classify the subject before writing install guidance.** Read the facts, never
   the folder name: the package manifest for declared entry points, the entry file
   for the exposed shape. A package shape with an install path gets install
   guidance; a plain library is a dependency with no install path of its own.
   Packages with special status get their own template — never a template whose
   install guidance does not apply.
2. **Run every claimed operation against the current checkout.** Execute each CLI
   command, config snippet, and example exactly as the document will show it; write
   down only what you observed, including the exact output, warnings, and failure
   modes. If a claim depends on a key or a network you do not have, say so and name
   the verification owner instead of asserting the behavior.
3. **Delete what you could not reproduce.** Never carry a command, field, default
   value, or behavior from memory, analogy, or a neighboring package’s README. When
   a claim fails to reproduce, fix the claim — not the test.
4. **Check old docs against the current default branch.** Before revising
   pre-existing pages, fetch and compare the section against the latest default
   branch; the pairing sidecar (`*.i18n.yaml`) recovers the last-confirmed text of
   either side. A stale statement on the default branch is still wrong: correct it
   against the code, not against the old prose.
5. **Re-record the pair after every edit.** Each paired edit re-runs the
   translation-pairing gate’s re-record command for that pair so the sidecar tracks
   the confirmed pair.

## Kind system and templates

The `kind` frontmatter field selects exactly one template. Every kind below maps to
one template file under [templates/](templates/package-reference.md), and every template backs exactly one
kind. A repository adds a new kind only together with a distinct template file, a
documented repository position or declared owner, and a focused check that maps
documents to it. Derive the kind mechanically from repository position and the
package’s declared facts, in this order:

1. The README is a group index (`packages/README.md` or a group-level README) →
   `package-group`.
2. The package manifest declares an installable, layering distribution form → use
   the repository’s installable-package template (add one if absent).
3. The package entry is a plain module API with no mountable surface →
   `package-library`.
4. Everything else with a mountable or consumable surface is `package-reference`.
5. A migration or upgrade record under a versioned docs path → `migration-guide`.

| `kind` | Repository position | Template |
|---|---|---|
| `package-group` | `packages/README.md`, `packages/<group>/README.md` | [package-group.md](templates/package-group.md) |
| `package-reference` | `packages/<group>/<package>/README.md` with a consumable surface | [package-reference.md](templates/package-reference.md) |
| `package-library` | `packages/<group>/<package>/README.md`, plain module API | [package-library.md](templates/package-library.md) |
| `migration-guide` | `docs/migrations/<version>/<item>/guide.md` and its sibling | [migration-guide.md](templates/migration-guide.md) |

Before assigning a kind, inspect the facts: read the manifest and the entry file.
Never present install guidance written for one package shape to another shape.
Folder READMEs are indexes, not records.

Open the template before writing and follow its skeleton and rules; it states what
the kind is, how the page is structured, and the fact checks each section owes.

## Voice rules

These rules decide what a section may say. They apply to every authored human-facing
page, and to package READMEs with particular force.

- **Summary says what the subject does.** The opening `Summary` and the user-facing
  sections describe what a user or agent can DO with the subject — outcomes,
  benefits, when to choose it, main cost — never its role, type, or internal
  identity. Omit source identifiers unless the reader directly uses them in
  configuration, a command, or a public API. "The seam registers `ctx.x`" is
  identity narration; "you can save a note per message and it survives restarts" is
  what it does.
- **Developer sections explain, never enumerate.** Folded implementation content
  covers the overall design concept, architecture, and hand-waving dataflow — enough
  to understand how the package works — and links code for exact detail. No full API
  catalogs, exhaustive column lists, event-payload enumerations, or doc-comment
  restatement inside the folds.
- **Dev Note is the only slop zone.** Partial ideas, scratches, undecided
  directions, measured artifacts, and working hypotheses live only in the final
  `Dev Note`, marked explicitly non-authoritative. Every other section is polished,
  current-state prose.
- **Current state only.** Ordinary documentation describes the current codebase.
  Dedicated change, release, and historical-format records retain their historical
  scope; migration guides describe one version transition. Decision notes and
  postmortems retain their own historical scope.
- **Use controlled technical English.** Give each sentence an explicit actor and one
  main action when ambiguity can change behavior. Reuse one term per concept, prefer
  direct verbs, split stacked instructions and conditions, and preserve modality and
  exceptions. Apply the discipline in [the page-style reference](references/style.md#controlled-technical-english).
  Do not force a shorter sentence when precision would fall.

## Quality criteria

Use these definitions in review. Each section opens with a short orienting paragraph
before subsections or exhaustive detail.

- **Brief:** the common path contains only facts needed for its outcome; exhaustive
  truth remains one direct link or detail layer away.
- **Intuitive:** prerequisites precede dependent concepts, one next action is
  obvious, and headings use terms readers search for.
- **Friendly:** readers can recognize success, understand risk before acting,
  recover from likely failure, and choose whether to continue deeper.
- **Accurate:** each durable claim has one owner and a verification path
  proportionate to its risk.
- **Agent-readable:** metadata, stable headings, anchors, terminology, ownership,
  and current/proposed status support targeted retrieval without loading the corpus.
- **Newcomer-complete:** a professional engineer with no repository context can
  reconstruct the relevant architecture or feature through three to five linked
  pages.

Do not apply a universal word limit to exhaustive references. Measure entry-path
length, unrelated material scanned for one lookup, largest section, heading count,
and page size; split by an existing domain owner when retrieval cost is high.

## Audit the corpus

Read, do not re-summarize, the owning contracts: the repository’s `docs/AGENTS.md`
for hierarchy, tutorial/reference forms, taxonomy, and budgets; the Agent Note
README for decision-note lifecycle; the bilingual pairing rules; and the root
`AGENTS.md` for standing orders. Exclude archived decision notes from audits and
edits — they are frozen history.

Apply the standard’s authoring order to every human-facing document in scope (not
to decision notes): locate the document and state its own subject; set the permitted
detail level and move deeper explanations to owning descendants with links;
classify tutorial or reference from intended use, not path; for a tutorial, order
concepts by prerequisite and difficulty; split substantial mixed forms. Then check
placement constraints: paired docs cost a counterpart update and a re-record on
every edit; generated catalogs are never hand-edited; a move is atomic with every
inbound link repaired in the same change.

After the structural pass, hunt duplicated rules, hand-written catalogs, status
inventories that an owner already generates, migration plans left in implemented
records, and reasoning-transcript leakage. Measure outliers with the repository’s
budget gate (doc-constraint’s `verify-doc-budgets --list`) and a word-count scan; if
removing prose changes a promised behavior rather than its explanation, propose the
behavior change first. Keep every load-bearing rule, preferably as one to three
lines plus a link to its rationale; do not create a new explanation merely to
relocate disposable reasoning.

## Validation

Run the repository’s own gates, which for a doc-constraint repository is:

```sh
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts
```

Also compare English/Chinese physical line counts for a line-aligned pair. Re-read
the final diff once for factual completeness and once for brevity. A repository with
its own documentation site follows that site’s manifest owner and publishing rules;
the site is a tested projection of repository Markdown, never a second copy.
