# Agent Note: Remove cross-skill duplication from doc-constraint

Status: implemented

## Problem

A review of `assets/skills/doc-constraint/` and `assets/skills/doc-standard/` asked whether doc-constraint repeated content. It did, but not against doc-standard: the two divide cleanly into how to write and how to judge. The duplication was internal, and it was load-bearing — the tier set existed in four places with two different sizes, and the evidence levels in three, so a reader could not tell which copy the gates enforced.

| Fact | Copies found | Disagreement |
|---|---|---|
| Tier set | `docs-constraint.yaml`, `SKILL.md`, `docs/AGENTS.md`, `references/tier-examples.md` | The config declared four tiers; the two references listed seven |
| Evidence levels E0–E3 | `SKILL.md`, `docs/doc-header.md`, `AGENTS.md.template` | Three tables with different columns |
| Config schema | `SKILL.md` (inlined YAML), `templates/docs-constraint.yaml` | Two independent sets of defaults |

The third row is the same failure the project gates against documents: two copies of a default drift apart, and the copy nobody enforces becomes a lie. `SKILL.md` also claimed a full schema while `templates/` held the real one.

## Decision

Give each fact one home and make the other locations point at it, following the rule both skills already state.

- `SKILL.md` keeps the behaviour worth knowing and the pointer, not the definition: the config section lists the five blocks and defers to `templates/docs-constraint.yaml`; the tier section says the installed config is the authority; the evidence section states the levels in prose and defers to `docs/doc-header.md` for the requirements table.
- `docs/AGENTS.md` stops claiming to define the evidence contract, and the tier table there names the four shipped tiers rather than describing paths.
- `references/tier-examples.md` splits into shipped tiers (pattern, job, budget) and tiers a repository adds itself (pattern, job, budget, why you would add it), gains the `runbook` shape, and states the two rules for adding one: narrow the pattern so tiers do not overlap, and map the `type` so the tier is reachable.

`SKILL.md` went from 244 to 204 lines with no rule dropped.

## Consequences

- The shipped tier set is stated once, in the config the gates read. The example list is explicitly about extension, so a reader no longer reads four missing tiers as available.
- `runbook` was added and verified rather than asserted: a fresh repository that follows the documented steps installs the tier, its `type_tiers` mapping, and a document, and `audit` returns 0.
- The vendored copy under `.agents/skills/` drifted from `assets/skills/` during the edit, and `dprov doctor` reported it (`vendored references/tier-examples.md differs from the shipped skill`). Re-vendoring cleared it. That check earned its place in the same change that created the drift.
- Overwriting the installed `docs/AGENTS.md` by hand broke its gate link: source docs say `../scripts/...`, installed docs need `../.agents/skills/...`, and only the installer's retarget step adds the difference. A fresh `init` produces the correct path, so the fix belongs in the process, not in the file.
- The repository is now a git working tree at its initial commit, with `tests/sandbox/` and `.DS_Store` ignored so a regenerated fixture never enters history.

## Alternatives considered

- **Delete the extra three tiers from `references/tier-examples.md`** instead of separating shipped from addable. Rejected: they are legitimate extension shapes, and removing them would lose the guidance on how to add one. Separating the tables keeps the guidance and removes the false claim that they exist.
- **Keep the `SKILL.md` tables and add a sync check that compares them to the config.** Rejected: a check that enforces duplication still leaves two places to edit, and the prose copy would still be the one a reader believes. Deleting the copy is cheaper than policing it.
- **Leave `docs/AGENTS.md` as the declared owner of the evidence contract.** Rejected: `doc-header.md` is the file the gate and the review protocol name, and a second owner for one fact is the duplication this change exists to remove.
