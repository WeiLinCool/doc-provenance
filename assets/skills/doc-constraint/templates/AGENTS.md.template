# AGENTS.md

This repository enforces a documentation constraint system (see `docs-constraint.yaml`,
`docs/AGENTS.md`, and `docs/doc-header.md`). These mechanical gates keep it honest:

- `verify-doc-budgets` - word-count ceilings for standing documents
- `verify-doc-headers` - document headers, ownership, provenance, and evidence levels
- `verify-md-links` - relative links and fragment anchors resolve
- `verify-translation-pairing` - bilingual triplets stay consistent
- `verify-agent-note-format` / `verify-agent-note-classification` - Agent Notes
  follow the uniform format and lifecycle tree

Run all gates with:

```bash
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts --config docs-constraint.yaml
```

## Facts live in exactly one tier

Each fact has one home; everywhere else, link to that home. See the tier table in
`docs/AGENTS.md`. Do not duplicate a fact across tiers.

## Documents carry their evidence

Every document in `docs/` opens with a header naming its `owner`, `source`,
`evidence_level`, and `validated_at`. The gate rejects a level the evidence cannot
support and rejects evidence that went stale. Field reference, per-type templates, and
the human review protocol are in `docs/doc-header.md`.

## Writing rules

- Document current state, not change history.
- One physical line per paragraph.
- Write the header before the prose; if no source can be named, it is an E0 draft.
- Agent Notes: one file per decision under `.agents/notes/{lifecycle}/{class}/`,
  following the uniform format in `.agents/notes/README.md`.
