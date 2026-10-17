---
id: reference-gates-001
type: reference
status: review
owner: wlz
evidence_level: E2
source:
  - doc: 文档准确性评估 (2026-10-17)
  - decision: one gate per contract, each a separate process
evidence:
  - path: assets/skills/doc-constraint/scripts/run-gates.ts
  - path: docs-constraint.yaml
validated_at: 2026-10-18
---

# Gates

`run-gates.ts` reads the `gates:` block from `docs-constraint.yaml` and spawns every enabled gate as a separate `node --experimental-strip-types` process. It collects failures instead of stopping at the first: a run that reports one problem at a time makes the reader fix, rerun, and meet the next one, which is how a gate suite becomes annoying rather than useful.

| Gate | Decides |
|---|---|
| `verify_doc_budgets` | Whether a budgeted page stays under its word ceiling |
| `verify_doc_headers` | Identity, owner, provenance, evidence level vs evidence, freshness, review pair |
| `verify_md_links` | Whether relative links, images, and fragments resolve |
| `verify_translation_pairing` | Whether a bilingual triplet is complete and both sides are the recorded pair |
| `verify_agent_note_format` | Agent Note header and section skeleton |
| `verify_agent_note_classification` | Lifecycle/class tree and filenames |
| `verify_archived_agent_notes` | Frozen archive hashes and triplets |

Each gate is a separate process on purpose: one gate cannot corrupt another's state, and a crash surfaces as a failure rather than as silence.

## Exit codes

`0` when every enabled gate passes, `1` when any fails or the config is unreadable. A gate disabled under `gates:` is not run at all, so silence about it is not a verdict on the documents it would have checked.

## Scope and exclusions

Each gate has its own scope. A file excluded from one gate is still checked by the others: translation exclusions, for example, no longer leak into the link gate, because a page excluded from pairing still has links that can rot.
