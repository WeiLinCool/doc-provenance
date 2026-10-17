# AGENTS.md — The documentation standard

This file states the structure and writing rules a contributor follows. The evidence
contract — field reference, level requirements, review protocol — is owned by
[doc-header.md](doc-header.md), and the tiers that actually exist are owned by
`docs-constraint.yaml`. Neither is restated here, so there is one place to change
each. The gate that enforces all of it is
[verify-doc-headers.ts](../scripts/verify-doc-headers.ts).

## The tier taxonomy: one home per fact

Each tier has one job. A fact belongs to exactly one tier; elsewhere, link there.
The set of tiers is whatever `tiers:` declares in `docs-constraint.yaml`; the shipped
default ships four, and `references/tier-examples.md` shows how to add others.

| Default tier | Job |
|------|-----|
| `root-agents` | Standing orders for agents |
| `architecture` | Composition and extension points |
| `subsystems` | Type definitions and semantics |
| `agent-notes` | Decision rationale (Agent Notes) |

## Document header

Documents in `docs/` open with a header block that names their identity, owner,
provenance, and evidence:

```yaml
---
id: spec-auth-001
type: spec
status: review
owner: wlz
evidence_level: E2
source:
  - issue: AUTH-123
evidence:
  - path: src/auth/AuthService.java
validated_at: 2026-10-17
---
```

Rules:

- `type` picks the tier; the id reads `<type>-<slug>-<nnn>` and is unique.
- `owner` is the human or team accountable — never a model or agent name.
- `evidence_level` is E0 (agent description), E1 (a source), E2 (checkable against
  the tree), or E3 (behaviour verified by a test or a recorded command). Declaring
  more than the evidence supports fails the gate.
- `validated_at` is the day the evidence was last confirmed, and may not be older
  than the configured limit while the document is `review` or `accepted`.
- `accepted` needs a human `reviewed_by` / `reviewed_at` pair, and the reviewer
  must differ from the owner.

Field-by-field detail, per-type templates, and the review protocol live in
[doc-header.md](doc-header.md).

## Agent Notes

Decisions and proposals live as Agent Notes under `.agents/notes/{lifecycle}/{class}/`,
one file per decision. Lifecycle: `proposed/`, `implemented/`, `rejected/`, and the
frozen `archived/`. Each follows the uniform header and skeleton enforced by
`verify-agent-note-format`. Bilingual Agent Notes form the same three-file triplet
as other docs but are checked by the Agent Note gates.

## Writing rules

- **Document current state, not change history.**
- **One physical line per paragraph.**
- **Comments state complete contracts, not reasoning transcripts.**
- **State the why near the decision** that needs it; link elsewhere.
- **Write the header before the prose.** If no source can be named, the document is
  an E0 draft and should say so.
