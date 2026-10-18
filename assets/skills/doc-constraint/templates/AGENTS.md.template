# AGENTS.md

This repository enforces a documentation constraint system (see `docs-constraint.yaml`,
`docs/AGENTS.md`, and `docs/doc-header.md`). Mechanical gates keep it honest.

Run all of them with:

```bash
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts --config docs-constraint.yaml
```

What each gate decides is stated once, in the gate table of
`.agents/skills/doc-constraint/SKILL.md`; which gates are enabled is the `gates:` block
in `docs-constraint.yaml`. Neither is restated here — a copied roster goes stale while
the copy nobody runs stays authoritative.

## Facts live in exactly one tier

Each fact has one home; everywhere else, link to that home. See the tier table in
`docs/AGENTS.md`. Do not duplicate a fact across tiers.

## Documents carry their evidence

Every document in `docs/` opens with a header naming its `owner`, `source`,
`evidence_level`, and `validated_at`. The gate rejects a level the evidence cannot
support and rejects evidence that went stale. Field reference, per-type templates, and
the human review protocol are in `docs/doc-header.md`.

Instruction files - this file, `docs/AGENTS.md`, and `README.md` - sit outside the
header gate's scope by configuration: they carry orders rather than claims, so they
have no evidence level to declare. `README.md` is still paired, because it is a
document a reader chooses to open.

## Writing rules

- Document current state, not change history.
- One physical line per paragraph.
- Write the header before the prose; if no source can be named, it is an E0 draft.

## Agent Notes

One file per decision under `.agents/notes/{lifecycle}/{class}/`, in the uniform format
described by `.agents/notes/README.md`. A note is a bilingual triplet: `topic.md`,
`topic.zh.md`, and a `topic.i18n.yaml` record, so an English-only note fails the
pairing gate. The tree's own `README.md` and `AGENTS.md` stay single-language.

`archived/` holds frozen notes. Move a triplet there only when its rationale no longer
guides current work; the archive gate hashes what it finds, and any later edit is a
violation rather than a diff.
