# doc-provenance

English | [中文](README.zh.md)

> Provenance and evidence gates for agent-written docs — keep a repository's documentation a real asset, not a formality.

## Why

In the post-AI era, a repository's docs are written by agents and read by humans. Volume is no longer the scarce thing — trust is. The reader did not watch the page being written, so before a doc can be worth anything it has to answer three questions:

| Question | Where a doc alone fails | What dprov adds |
|---|---|---|
| Is it **accurate**? | An agent can assert anything with equal confidence | An evidence level (E0–E3) the gate can check |
| Is it **current**? | Dated evidence rots silently | `validated_at` plus path drift against commits |
| Is it **readable**? | Length grows until no one reads it | Tiered placement, word budgets, link checks |

A doc that survives in a repository is a core asset: it carries decisions, contracts, and the reasons behind them. It stops being an asset the moment it becomes a formality — a page produced to satisfy a process, read by nobody, disagreeing with the code it describes.

So this is not about constraining writing for its own sake. A doc whose claims can be checked, whose age is visible, and whose reader cost is bounded is one a human can still act on. The mechanical gates exist to keep it that way, never to manufacture compliance, and never to replace the judgment behind it.

These questions, and the E0–E3 grading, come from *Assessing document accuracy*: the header block in `docs/doc-header.md` is a direct descendant of its metadata example.

## Acknowledgements

This project builds on work by others; what it takes from each is stated here.

- **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** — the doc system this repository's constraint model descends from: skill packaging with a router skill, a writing skill, and a gate skill, each with a narrow job.
- **[comet](https://github.com/rpamis/comet)** — the workflow shape: a deterministic chain of skills that ends in a mechanical verdict, with no step left to model judgment.
- ***Assessing document accuracy*** — the measurement: docs are written by agents and reviewed by humans, so docs must carry checkable evidence, freshness, and an explicit reader cost.

doc-provenance's difference: it is not a skill for a single Agent harness. It is a CLI platform that installs the same constraint into any repository; the gates run on dependency-free Node, so the verdict is reproducible in CI.

## The three questions, as gates

Evidence levels grade the evidence, not the author's confidence. Declaring more than the evidence supports fails the gate.

| Level | Claim | Machine check |
|---|---|---|
| `E0` | An agent's description only; nothing to verify | Only allowed while `status: draft` |
| `E1` | Rests on a human decision, issue, or ADR | The `source` entry shape and keys |
| `E2` | Checkable against the tree as it is now | The evidence `path` exists and `validated_at` is fresh |
| `E3` | Behaviour verified by a test or a recorded command | The test is found under `test_globs` |

The header every in-scope document opens with:

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

- **Accuracy**: `evidence_level` sets a floor, and `status` pins it — `accepted` needs E2 plus a human `reviewed_by` who is not the `owner`.
- **Currency**: `validated_at` may not be older than `max_age_days` (180 by default) for `review` and `accepted` pages; an evidence path that drifted past its recorded `commit` fails with the reason attached.
- **Readability**: every fact lives in exactly one tier, each tier has a job, and budgeted tiers fail when they grow past the ceiling. Redundancy is a link, not a re-statement.

## Install

```bash
npm install -g doc-provenance   # or run locally: node bin/dprov.js
```

## Commands

| Command | What it does |
|---|---|
| `dprov init [target]` | Vendor the skill runtime, write `docs-constraint.yaml`, `docs/AGENTS.md`, `docs/doc-header.md`, and the `.agents/notes/` tree |
| `dprov audit [target]` | Run every enabled gate; the exit code is the verdict |
| `dprov ci [target]` | Generate `.github/workflows/doc-sync.yml` |
| `dprov status [target]` | Show installation state and the doc-flow routing decision |
| `dprov doctor [target]` | Diagnose partial or broken installs and process artifacts |

## Architecture

```text
doc-provenance (CLI platform)
  ├─ assets/skills/doc-flow        entry router + deterministic workflow chain
  ├─ assets/skills/doc-standard    writing standard (kinds, templates, voice, review)
  └─ assets/skills/doc-constraint  mechanical gates (headers, budgets, pairing, links, notes)
```

`init` vendors only the runtime surface of each skill into `<repo>/.agents/skills/<name>/`, the same way comet installs its skills into a project. The installer and templates are one-shot inputs and never enter the target repository.

After init, agents work through the vendored chain: `doc-flow` resolves the route, `doc-standard` owns writing, `doc-constraint` owns the verdict.

```text
setup → write → verify → (on failure) fix and verify again
```

```bash
node .agents/skills/doc-flow/scripts/doc-entry.mjs . --json     # route
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts   # verify
```

## Design rules

- Zero runtime dependencies; Node type stripping only (Node >= 20.11).
- Gates are the completion criterion — fix the docs, never the gate.
- Vendored skills carry no process artifacts (`node_modules/`, lockfiles, installer templates) — `dprov doctor` rejects them.
- The doc-flow entry script resolves exactly one downstream skill and never edits files.
- A document never claims more evidence than it has; if no source can be named, it is an E0 draft and says so.