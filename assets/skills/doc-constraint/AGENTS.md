# AGENTS.md

Documentation constraint system for enforcing quality through tiered taxonomy,
bilingual pairing, word budgets, markdown link checks, and a document header that
carries ownership, provenance, and evidence levels (E0-E3). All gates are
dependency-free and run with `node --experimental-strip-types`.

## Quick start

```bash
# Run every enabled gate (doc sync)
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts

# Individual gates
node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-doc-headers.ts --list
node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-doc-budgets.ts
node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-md-links.ts
node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-agent-note-format.ts

# Gate regression tests (Node's built-in test runner)
node --experimental-strip-types --test .agents/skills/doc-constraint/scripts/verify-doc-headers.test.ts
```

## Commands

| Command | Description |
|---------|-------------|
| `run-gates.ts` | Run every gate enabled in `docs-constraint.yaml` |
| `verify-doc-budgets.ts` | Verify word-count ceilings |
| `verify-doc-headers.ts` | Verify document headers: identity, owner, provenance, evidence level, freshness |
| `verify-md-links.ts` | Verify relative links and fragment anchors |
| `verify-translation-pairing.ts` | Verify bilingual triplet consistency |
| `verify-agent-note-format.ts` | Verify Agent Note header and skeleton |
| `verify-agent-note-classification.ts` | Verify Agent Note lifecycle/class tree |
| `verify-archived-agent-notes.ts` | Verify frozen archive hashes and triplets |
| `templates/install.ts` | Install (`init`), audit (`audit`), CI (`ci`) — scripts stay in skill dir |

The header contract is specified in `docs/doc-header.md`; the tier taxonomy and
writing rules are in `docs/AGENTS.md`.
