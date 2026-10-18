# doc-constraint

A documentation constraint system for enforcing documentation quality through
tiered taxonomy, bilingual pairing, word budgets, markdown-link checks, and the
document header gate. Every gate is self-contained and dependency-free, so the
whole thing runs with plain `node --experimental-strip-types` (Node >= 20.11).

Agents write most repository documentation; humans review and rely on it. The header
gate turns that review into a contract: every document states who owns it, what it
rests on, how strong its evidence is (E0-E3), and when that evidence was last
confirmed, and the gate rejects a claim stronger than its evidence or older than its
freshness window.

## Structure

```
doc-constraint/
├── AGENTS.md                    # Standing orders for agents (budgeted)
├── SKILL.md                     # Skill instructions
├── README.md
├── docs/
│   ├── AGENTS.md                # Documentation standard: tiers, header rules, writing
│   └── doc-header.md            # Header + evidence format spec (carries its own header)
├── references/                  # Reference material
│   ├── tier-examples.md
│   └── slop-checklist.md
├── scripts/                     # Gate scripts (all dependency-free)
│   ├── run-gates.ts             # Unified runner (doc sync)
│   ├── doc-config.ts            # Shared YAML-subset reader, glob, exclusion helpers
│   ├── verify-doc-budgets.ts
│   ├── verify-doc-headers.ts
│   ├── verify-doc-headers.test.ts
│   ├── verify-md-links.ts
│   ├── verify-translation-pairing.ts
│   ├── agent-note-tree.ts
│   ├── verify-agent-note-format.ts
│   ├── verify-agent-note-classification.ts
│   ├── archived-agent-notes.ts
│   └── verify-archived-agent-notes.ts
└── templates/                   # Installer + install templates
    ├── install.ts               # init / audit / ci
    ├── docs-constraint.yaml     # Full schema template
    └── AGENTS.md.template       # Root instructions template
```

## Quick start (in a target repo)

```bash
# Install the doc system: config, docs/ standard, .agents/notes/ tree
node --experimental-strip-types .agents/skills/doc-constraint/templates/install.ts init

# Run every enabled gate
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts

# List every document with its evidence level and status
node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-doc-headers.ts --list
```

## Gates

| Gate | Enforces |
|------|----------|
| `verify-doc-budgets` | Word-count ceilings for budgeted tiers |
| `verify-doc-headers` | Header schema, id/type agreement, human owner, provenance, evidence level vs evidence, freshness, review pair |
| `verify-md-links` | Relative link targets and fragment anchors resolve |
| `verify-translation-pairing` | Bilingual triplet completeness and consistency |
| `verify-agent-note-format` | Uniform Agent Note header and skeleton |
| `verify-agent-note-classification` | Agent Note lifecycle/class tree and filenames |
| `verify-archived-agent-notes` | Frozen archive hashes, triplets, and manifest |

Enable or disable any gate in `docs-constraint.yaml` under `gates:`, and tune each
one under `gate_config:`. `run-gates.ts` runs the enabled ones in order.

## Evidence levels

| Level | Claim | The gate wants |
|-------|-------|----------------|
| E0 | An agent's description, nothing verified | `status: draft` only |
| E1 | A human decision, ticket, or upstream doc is the source | one `source` entry |
| E2 | The claim is checkable against the tree as it is now | one existing `evidence: path` plus `validated_at` |
| E3 | The behaviour was verified by a test or a recorded command | one `evidence: test` or `command` entry |

Declaring more than the evidence supports fails the gate; declaring less is allowed.
`accepted` additionally requires a human `reviewed_by` / `reviewed_at` pair, a
reviewer other than the owner, and a validation date inside `max_age_days` (180 by
default). See [docs/doc-header.md](docs/doc-header.md) for the field reference,
per-type templates, and the three-minute review protocol.

## Tests

```bash
node --experimental-strip-types --test .agents/skills/doc-constraint/scripts/verify-doc-headers.test.ts
```

## Requirements

- Node.js >= 20.11 (for `--experimental-strip-types`). No `npm install` needed.
