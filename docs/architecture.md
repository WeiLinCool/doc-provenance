---
id: architecture-dprov-001
type: architecture
status: review
owner: wlz
evidence_level: E2
source:
  - doc: 文档准确性评估 (2026-10-17)
  - decision: keep the skills, installer, and gates inside this repository
evidence:
  - path: app/cli/index.ts
  - path: platform/skills.ts
  - path: assets/skills/doc-constraint/scripts/run-gates.ts
validated_at: 2026-10-17
---

# Architecture

dprov has two layers with one boundary between them. The CLI is a small, stable front end; the skills are self-contained runtimes that can be copied into any repository and run there with nothing but Node. Everything else follows from that split.

## The two layers

```text
bin/dprov.js                    launcher: re-executes the CLI under Node type stripping
  └─ app/cli/index.ts           argument parsing, command dispatch
       ├─ app/commands/init.ts      vendoring + config authoring
       ├─ app/commands/audit.ts     runs the gates
       ├─ app/commands/ci.ts        generates a workflow
       ├─ app/commands/status.ts    reports install state + doc-flow route
       └─ app/commands/doctor.ts    diagnoses broken installs and drift
            └─ platform/skills.ts   resolves assets/skills/<name>
```

The CLI never contains gate logic. It locates a skill, then either copies it into a target repository (`init`) or delegates to a script inside it (`audit`). This is why the same gates run from a checkout and from an installed repository.

## What ships

`assets/skills/` holds the three bundled skills. They are the runtime, and they are the only source of truth:

| Skill | Job | Ships |
|---|---|---|
| `doc-flow` | Resolve the route: exactly one downstream skill, never edits files | the router script and its workflow table |
| `doc-standard` | Writing standard: kinds, templates, voice, review | references and one template per kind |
| `doc-constraint` | Mechanical gates: headers, budgets, links, pairing, notes, archive seals | gate scripts, references, and the installer templates |

`doc-constraint` carries the code that decides a verdict: seven gate scripts, a shared config parser (`doc-config.ts`), the note-tree walker, and the runner that dispatches them.

## The vendoring boundary

`init` copies the runtime surface of each skill into `<repo>/.agents/skills/<name>/`. Three rules keep that boundary honest:

- **Runtime only.** `SKILL.md`, `scripts/`, and `references/` are vendored. `templates/` and `docs/` are installer inputs and stay behind, so a target repository cannot accidentally run a second copy of the installer.
- **Links are retargeted.** Shipped docs reference their scripts as `scripts/...`; the installer rewrites evidence paths, commands, and Markdown links so they point at the vendored location, one level up from `docs/`.
- **The copy must match.** `dprov doctor` compares every vendored file against `assets/skills/` and fails when they differ: a stale gate is a gate that reports a verdict about code nobody is running.

## Gate execution

Seven gates decide the verdict, each in its own process so one cannot corrupt another's state and a crash surfaces as failure rather than silence. The table of what each one decides, and how scope and exclusions behave, lives in [gates.md](gates.md).

## Where state lives

Nothing is stored in a database or a cache. The state is the tree:

- `docs-constraint.yaml` declares tiers, i18n, and which gates are on.
- Document headers carry `status`, `evidence_level`, and `validated_at`.
- `*.i18n.yaml` sidecars record the last confirmed hash pair for each translation.
- `.agents/notes/` holds decision records under their lifecycle and class.

A gate therefore never needs to trust a prior run. It re-derives everything from files, which is what makes the verdict reproducible in CI.

## Document lifecycle

A document moves through one status machine. Every edge either succeeds or is rejected by the header gate, and every guard is a condition a test can exercise — there is no rule that exists only in prose.

```text
                          evidence written
                                  │
                                  ▼
                          ┌───────────────┐
              ┌──────────▶│     draft     │  E0 · no source
              │           └───────┬───────┘
              │                   │ [claim a source and write the header]
              │                   ▼
              │           ┌───────────────┐
              │           │    review     │  E1+ · clock starts
              │           └───────┬───────┘
              │                   │ [validated_at ≤ max_age_days]
              │                   │ [reviewed_at ≥ validated_at]
              │                   │ [reviewed_by ≠ owner]
              │                   ▼
              │           ┌───────────────┐
              │           │   accepted    │  E2+ · in force
              │           └───┬───────┬───┘
              │               │       │
              │   [no longer advised]  [claim replaced]
              │               ▼       ▼
              │      ┌────────────┐ ┌────────────┐
              │      │ deprecated │ │ superseded │
              │      └──────┬─────┘ └──────┬─────┘
              │             │  [superseded_by: <id>]
              │             │              │
              └─────────────┴──────────────┘
                 [evidence changed: fix and re-validate]
                             │
                             ▼
                    ┌──────────────────┐
                    │ STALE → rejected │  asked of review/accepted only
                    └──────────────────┘
                      age > max_age_days
```

### The two guards that look like exceptions

Both are edges with conditions, not footnotes — and both are covered by tests:

| Guard | Applies to | Verdict |
|---|---|---|
| `validated_at` older than `max_age_days` | `review`, `accepted` | **rejected**: re-verify the evidence and bump the date |
| the same stale date | `deprecated`, `superseded` | **allowed**: an archived decision may stay old and still be correct |
| `reviewed_at` earlier than `validated_at` | `accepted` | **rejected**: the signature predates the material it signed, so sign again |
| `reviewed_by` equal to `owner` | `accepted` | **rejected**: a document cannot approve itself |

Reading the table as a graph: staleness is an edge into a rejected state, and the status decides whether that edge exists. That is why the exemption is a property of the transition, not of the date.

### What the gate cannot see

It checks structure, not meaning. Whether the prose still matches the claim is not a machine question, and no diagram makes it one: that edge stays with the reviewer.

## Test suite

Two commands, two jobs. `npm test` **produces something you can look at** — it wipes and rebuilds `tests/sandbox/` with a real `dprov init`, so that directory is the command's current output. `npm run test:gates` **verifies a change** by regenerating the sandbox and asserting against it.

```bash
npm test                     # generate tests/sandbox
npm run test:gates           # assert it, and assert the edit flows
npm run test:gates:fixtures  # the header gate's own regression fixtures
npm run snapshot             # rewrite tests/init-tree.txt after an intended change
```

| Path | Role |
|---|---|
| `tests/sandbox/` | A live install you can open, edit, and audit by hand; git-ignored and rebuilt each run |
| `tests/init-tree.txt` | The recorded tree a fresh install must produce, reviewable in a diff |
| `tests/init.test.ts` | The sandbox equals that tree, links resolve, and the gates pass on it |
| `tests/edit.test.ts` | One edit per case: which gate notices, and what it says |
| `tests/flow.test.ts` | The loop closes: route, audit, fail, fix, pass |
| `tests/lifecycle.test.ts` | Every guarded status transition |

### The working rhythm

Generate, look, change, verify — and regenerate the record only when the change was intended and reviewed:

```text
npm test ──▶ inspect tests/sandbox ──▶ change code ──▶ npm run test:gates
                                                              │
                                    intended? ──▶ npm run snapshot ──▶ review the diff
```

Having a real install under `tests/` is what separates inspecting from guessing: you can run `bin/dprov.js audit tests/sandbox` against the exact tree the installer just produced, edit a file in it and watch one gate fail, then rerun. The assertions cover the same directory, so what you inspected and what passed are the same thing.

### Execution, not just structure

A tree listing answers *what exists*. It cannot answer *what happens when I change something* — which is the question a maintainer actually has. The flow suite executes that loop and asserts both ends of it:

```text
init ──▶ green ──▶ edit one file ──▶ fail (named gate + reason) ──▶ fix ──▶ green again
```

It also asserts that two independent breaks surface in one run rather than one at a time, and that `dprov doctor` catches a tampered gate runtime — the modification that would otherwise make every later verdict meaningless.

Three behaviours worth knowing before trusting a green run:

- **An empty suite passes silently.** A glob that matches no file reports `1..0` and exits 0, so a directory with no tests looks identical to one whose tests all passed. If a run reports `# tests 0`, nothing was verified.
- **The directory form does not find TypeScript tests.** `node --test tests/` discovers only files Node would load unassisted; `tests/*.test.ts` is the form that works with type stripping.
- **A pipe hides the exit code.** `dprov audit . | tail` reports the status of `tail`, which is 0, so a failing gate reads as a pass. Capture the code before piping: `dprov audit .; echo exit=$?`.

The last one is not specific to this project, which is what makes it worth stating: the gate can be entirely correct and still be reported green by the shell that invoked it.

## Design constraints

- **No runtime dependencies.** Everything runs on Node >= 20.11 type stripping. Installing the tool is copying files; there is no build step and no `npm install` inside a target repository.
- **Gates decide, they do not edit.** No gate rewrites a document. A failing gate names the file, the line, and the reason; the fix is a human or agent edit.
- **Peer languages.** A translation is not a subordinate copy. Either side may be edited first, and the gate reports which side moved so the change can be propagated deliberately.
- **One fact, one home.** The tier taxonomy decides where a fact lives; elsewhere a document links to it. Duplication is a link, not a restatement.

## Extension points

- A new gate is a script in `assets/skills/doc-constraint/scripts/`, an entry in the runner's `GATES` table, and a key under `gates:` in the config.
- A new tier is a `tiers:` entry plus a `type_tiers` mapping, so the header's `type` pins a document to a location.
- A new language is a `suffix_map` entry; the pairing gate derives both directions from it rather than assuming a single hard-coded counterpart.