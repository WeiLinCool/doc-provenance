# Tier Taxonomy - Examples

Each tier has one job, and a fact belongs to exactly one tier. The pattern column in `docs-constraint.yaml` decides which files a tier owns; elsewhere, link there.

## Shipped tiers

These four are declared by `templates/docs-constraint.yaml`, so a fresh install enforces them immediately:

| Tier | Pattern | Job | Budget |
|---|---|---|---|
| `root-agents` | `AGENTS.md` | Standing orders for agents | 1600 |
| `architecture` | `docs/architecture.md` | Composition and extension points | 1800 |
| `subsystems` | `docs/**/*.md` | Type definitions and semantics | none |
| `agent-notes` | `.agents/notes/*/*.md` | Decision rationale | none |

## Tiers you add yourself

A repository earns these by needing them, not by copying this list. Each one is an entry under `tiers:` with a pattern no shipped tier already claims; without that entry the tier does not exist and the header gate will not recognize it.

| Tier | Pattern | Job | Budget | Why a repository adds it |
|---|---|---|---|---|
| `package-readme` | `*/README.md` | Per-package contracts | none | A monorepo whose packages each own a contract rather than a doc |
| `cookbook` | `docs/**/how-to*.md` | Step-by-step procedures | none | Procedures readers follow under pressure, which do not belong in reference pages |
| `postmortem` | `docs/**/postmortem*.md` | Incident narratives | none | Incident records kept separate from current-state docs |
| `runbook` | `docs/**/runbook*.md` | Operator procedures | none | On-call steps that need testing rather than explanation |

Two rules when adding one:

- **Narrow the pattern so no two tiers overlap.** Overlapping patterns make a file belong to two homes, which is the duplication the taxonomy exists to prevent.
- **Add the type mapping too.** A document's header names its `type`, and `gate_config.verify_doc_headers.type_tiers` is what pins that type to your new tier. A tier without a mapping is unreachable: no header can claim it.

## The tier is machine-checkable

A document's header names its `type`, and `gate_config.verify_doc_headers.type_tiers` maps each type to the tier that owns it. A `spec` only passes under the `subsystems` pattern, an `architecture` page only under the `architecture` pattern: a fact filed in the wrong tier fails the gate instead of drifting unnoticed.

## Worked example

Suppose the subsystems tier owns `docs/**/*.md`. The sentence “the quote engine supports tolerance analysis” should live in exactly one subsystems doc. Another doc that needs that fact links to the owner rather than restating it:

```markdown
See [tolerance analysis](../subsystems/tolerance.md#tolerance-analysis).
```

## When a fact crosses tiers

A fact belongs to the tier whose job is most specific. A standing order to agents goes in `root-agents`; the architectural reason a subsystem exists goes in `architecture`; a one-off decision rationale goes in `agent-notes`.
