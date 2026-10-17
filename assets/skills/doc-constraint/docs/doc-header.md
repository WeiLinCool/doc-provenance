---
id: spec-doc-header-001
type: spec
status: review
owner: repo-maintainer
evidence_level: E2
source:
  - doc: 文档准确性评估 (2026-10-17)
  - decision: adopt a machine-checked document header and evidence levels
evidence:
  - path: scripts/verify-doc-headers.ts
  - path: docs-constraint.yaml
validated_at: 2026-10-17
---

# Document header and evidence levels

Repository documents are mostly written by agents and mostly read by humans who did
not watch them being written. A reader has to answer three questions before trusting
a page: is the claim **accurate**, is it **current**, and can it be **read quickly**.
The header block answers the first two mechanically and gives the third to a reviewer
with a fixed script. The gate that enforces it is
[verify-doc-headers.ts](../scripts/verify-doc-headers.ts).

## The header block

Every in-scope document opens with a YAML block delimited by three dashes, then a
blank line, then exactly one level-1 heading:

```yaml
---
id: spec-auth-001
type: spec
status: review
owner: wlz
evidence_level: E2
source:
  - issue: AUTH-123
  - adr: ADR-007
evidence:
  - path: src/auth/AuthService.java
    commit: abc1234
  - test: AuthServiceTest
validated_at: 2026-10-17
reviewed_by: reva
reviewed_at: 2026-10-18
---
```

The header is machine metadata: keep field names, values, and ids untranslated and
byte-identical in every language of a bilingual document. Prose belongs in the body.

## Field reference

| Field | Required | Value |
|-------|----------|-------|
| `id` | always | `<type>-<slug>-<nnn>`, lower case, unique in the repository, e.g. `spec-auth-001` |
| `type` | always | One of the configured `allowed_types`; picks the tier the document lives in |
| `status` | always | `draft`, `review`, `accepted`, `deprecated`, or `superseded` |
| `owner` | always | The human handle or team accountable for the page; a model or agent name is rejected |
| `evidence_level` | always | `E0`, `E1`, `E2`, or `E3` - the strongest claim the evidence supports |
| `source` | from E1 up | List of `- <key>: <value>` provenance entries; keys: `issue`, `ticket`, `incident`, `adr`, `rfc`, `pr`, `commit`, `decision`, `doc`, `url` |
| `evidence` | from E2 up | List of entries carrying exactly one of `path`, `test`, or `command`, plus optional `commit` and `result` |
| `validated_at` | from E2 up | `YYYY-MM-DD` the evidence was last confirmed against the current tree |
| `reviewed_by` / `reviewed_at` | with `accepted` | The human who signed off and the date; the reviewer must differ from `owner` |
| `superseded_by` | with `superseded` | The id of the document that replaces this one |

Unknown fields are rejected while `strict` is on, so a typo cannot silently become
an unchecked claim.

## Evidence levels

The level grades the *evidence*, not the confidence of the author. Declare the
strongest level the evidence actually supports: overstating it is rejected, and
understating it is allowed but wasteful.

| Level | Claim | Required to declare it | How the gate verifies it |
|-------|-------|------------------------|--------------------------|
| `E0` | No evidence yet: the text is an agent's description | Nothing | Only `draft` may claim E0 |
| `E1` | A human decision, ticket, or upstream document is the source | One `source` entry | The entry shape and keys |
| `E2` | The claim is checkable against the tree as it is now | One `path` evidence that exists, plus `validated_at` | The file exists and `validated_at` is fresh |
| `E3` | The behaviour was verified by a test or a recorded command | One `test` or `command` entry, plus `validated_at` | The test name is found under `test_globs` |

A path entry may carry the `commit` it was checked at. When the file changed after
that commit, the gate reports drift and asks for a fresh `validated_at`.

## Status and the evidence floor

Status says where the document sits in its life, and pins the weakest evidence the
gate will accept for it:

| Status | Meaning | Floor |
|--------|---------|-------|
| `draft` | Work in progress, not relied on | E0 |
| `review` | Complete and waiting for a human reviewer | E1 |
| `accepted` | Reviewed, in force, and maintained | E2 |
| `deprecated` | Still true, no longer recommended | E1 |
| `superseded` | Replaced by `superseded_by` | E1 |

`accepted` is the only status that requires the review pair. Promote a document in
one change: re-verify its evidence, bump `validated_at`, set `reviewed_by` and
`reviewed_at`, then flip `status`. A review older than the last validation is
rejected because it signed off material that has since changed.

## Freshness and drift

Dated evidence rots silently, so the gate treats it as an error rather than a warning:

- `validated_at` may not be in the future and may not be older than
  `max_age_days` (default 180) while the document is `review` or `accepted`.
- A stale page is fixed by re-checking the claim and moving the date forward, never
  by moving the date alone. If the claim no longer holds, mark it `deprecated` or
  `superseded` and link to its replacement.
- An evidence `path` that no longer exists, or that drifted past its `commit`,
  fails the gate with the reason attached.

## Review protocol

A reviewer spends three minutes per page, in this order:

1. Read the header: does `status` match reality, is the `owner` the right human,
   and does `evidence_level` match the evidence listed?
2. Follow one `source` entry and one `evidence` entry. They must lead to the
   decision and the file the prose is actually about.
3. Scan the body for claims that are not in the evidence: absolute guarantees,
   metrics, and promises with no owner. Reject or narrow them.
4. Check that the link targets still resolve and that the page states what is true
   now, not the history of how it got there.

Then record the outcome in the header, not in prose: flip `status`, and add
`reviewed_by` with `reviewed_at`.

## Templates by document type

Pick the `type` that matches the tier the document lives in, then fill the body.

```yaml
# Architecture: composition, extension points, and the reasons behind them
---
id: architecture-overview-001
type: architecture
status: accepted
owner: platform-team
evidence_level: E2
source:
  - adr: ADR-007
evidence:
  - path: docs/architecture.md
validated_at: 2026-10-17
reviewed_by: reva
reviewed_at: 2026-10-17
---
```

```yaml
# Runbook: a procedure an operator follows under pressure
---
id: runbook-restore-001
type: runbook
status: review
owner: oncall-team
evidence_level: E3
source:
  - incident: INC-451
evidence:
  - command: scripts/restore.sh --dry-run
    result: exits 0 against the staging snapshot
  - test: restore_test
validated_at: 2026-10-17
---
```

```yaml
# Postmortem: one incident, what changed, and what is still open
---
id: postmortem-inc-451-001
type: postmortem
status: accepted
owner: oncall-team
evidence_level: E3
source:
  - ticket: INC-451
evidence:
  - path: docs/postmortems/inc-451.md
  - test: failover_test
validated_at: 2026-10-17
reviewed_by: reva
reviewed_at: 2026-10-17
---
```

## Writing a new document

1. Pick the tier first: one fact has one home, and the tier decides the `type`.
2. Write the header before the prose. If you cannot name a `source`, the document
   is an `E0` `draft` and should say so.
3. Add evidence as you make claims convenient to check: a `path` for structure, a
   `test` for behaviour, a `command` for anything you ran by hand.
4. Set `validated_at` to the day you last checked the evidence against the tree.
5. Open the document at `review` and hand it to a human; do not self-approve.

## What the gate rejects

| Rejection | Fix |
|-----------|-----|
| Missing header block, or a body that does not open with one level-1 heading | Add the block and the title |
| `id` malformed, duplicated, or not prefixed by `type` | Rename to `<type>-<slug>-<nnn>` |
| `type` outside `allowed_types`, or in a tier that does not own the path | Move the page or widen `type_tiers` |
| `owner` or `reviewed_by` naming a model or agent | Name the accountable human or team |
| `evidence_level` above what the evidence supports | Lower the level or add the missing evidence |
| `source` missing from E1 up | Cite the issue, ADR, or decision the page rests on |
| `evidence` path missing, test not found, or drift past `commit` | Re-point the evidence at what is true now |
| `validated_at` missing, future, or older than `max_age_days` | Re-verify and move the date forward |
| `accepted` without a review pair, or reviewer equal to owner | Get a second human to sign off |
| Header differing between language versions of one document | Copy the header verbatim into the counterpart |

Run the gate with the rest of the doc system:

```bash
node --experimental-strip-types scripts/verify-doc-headers.ts --list
```
