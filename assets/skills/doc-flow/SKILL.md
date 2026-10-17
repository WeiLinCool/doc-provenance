---
name: doc-flow
description: "Route documentation work to the doc-constraint or doc-standard skill through a node script chain: setup (init/audit/CI), write (authoring with templates), verify (run gates), and pair (bilingual re-record). Use when the user says doc flow, doc setup, write docs, doc review, doc audit, or when documentation work should follow the composed skill pipeline."
---

# Doc Flow Entry

`doc-flow` only selects an entry. It does not contain either skill's execution method.

1. First try the repository-local skill scripts in the current project:

   ```text
   node .agents/skills/doc-flow/scripts/doc-entry.mjs . --json
   ```

2. **Only** when the repository does not vendor the skill (the path above is
   `ENOENT`), locate `<doc-flow-skill-root>` from this `SKILL.md` and run the
   bundled entry script:

   ```text
   node <doc-flow-skill-root>/scripts/doc-entry.mjs <target-repo> --json
   ```

   If the script exits nonzero or the output is not JSON, stop and report the
   original error without falling back or guessing.

3. Parse the JSON. Only accept `schema: doc.resolution.v1` and a `skill` value
   listed below.
4. Invoke exactly one skill based only on the returned `skill` and `command`,
   passing the user's original request through unchanged:
   - `doc-constraint` → follow its SKILL.md for `init` / `audit` / `ci`
   - `doc-standard` → follow its SKILL.md for writing, reviewing, or migrating docs

Do not switch skills based on task size or model judgment. The resolution fields
(`reason`, `state`) explain the route; they never override the routed skill's own
workflow.

## Orchestration chain

For a full documentation pass (setup through verified bilingual docs), follow the
deterministic steps in [runtime/doc-flow.yaml](runtime/doc-flow.yaml). Each step
invokes exactly one skill; the chain re-enters verification after every write and
ends only when the gates pass:

```text
setup (doc-constraint init) → write (doc-standard) → verify (doc-constraint gates)
      ↑ fail: fix and re-verify ←——————————————┘
```

Script discovery and the stable command contract live in
[reference/scripts.md](reference/scripts.md).
