# Review criteria

## Summary

Review documentation by whether a reader completes an outcome, not by whether every
template heading exists. Verify prose against code and tests, preserve exact
contracts, and keep package READMEs useful to consumers while exposing enough
implementation detail for maintainers. Run current repository gates.

## Table of Contents

- [Newcomer test](#newcomer-test)
- [Evidence review](#evidence-review)
- [Package README review](#package-readme-review)
- [Verification](#verification)

## Newcomer test

A professional engineer with no repository context should answer the following after
three to five linked pages: what the product or feature does, how to run or use it
safely, where its state lives, which component owns it, how it fails, and where to
change it. If the reader must inspect source merely to discover the public flow,
restore the missing explanation. If the reader must absorb unrelated internals, move
those details deeper.

## Evidence review

Check each material statement against its strongest owner. Use package metadata for
names and entry points, public types and doc comments for API contracts, runtime
code for behavior, tests for exercised failure paths, generated catalogs for
exhaustive inventories, and active decision notes for rationale. Never treat a prior
README, discussion, or report as stronger than current code and tests.

For every operational claim — a CLI command, a config snippet, a default value, an
error message, a platform difference — the evidence is running it, not reading it.
Execute the exact command or mount the exact configuration against the current
checkout before the page may state its behavior; quote only observed output,
warnings, and failures. Claims that depend on unavailable keys or networks name
their verification owner instead of asserting behavior. For pre-existing pages,
compare against the latest default branch and re-verify stale statements against
code.

Classify the package before reviewing its install guidance: an installable,
layering distribution form gets the install path; a mountable surface gets the
mount configuration; a plain module API is a dependency with no install path. Reject
install guidance written for another shape.

Retain a statement only when it helps the target reader act, reason, or avoid
misuse. Move rationale, history, test walkthroughs, duplicate catalogs, and
unrelated package detail to their owners.

## Package README review

Require the following without forcing one universal internal heading set:

- searchable YAML metadata with a precise `description` and the mechanically
  derived `kind`;
- a three-to-five-sentence English Summary of at most 100 `wc -w`-style words
  that says what the subject DOES for its user or agent reader, with a linked Table
  of Contents;
- controlled English with explicit actors, stable terms, direct verbs, separated
  instructions and conditions, and unchanged modality;
- when to choose or avoid the package;
- a smallest safe configuration or usage path when one exists, matching the
  package’s actual shape;
- observable behavior, failures, durability, security, and performance limits
  relevant to consumers;
- developer-facing ownership and data/lifecycle design at concept level — overall
  design, architecture, hand-waving dataflow — that cannot be recovered cheaply from
  public types, with code links for exact detail;
- newcomer-facing Further Exploration where adjacent docs materially help;
- a final non-authoritative Dev Note as the only home for partial ideas, scratches,
  and undecided directions.

Do not restate doc comments or generated catalogs. Link the owner and explain only
the decision or relationship needed locally. A package Summary describes
reader-visible capability rather than internal roles, registrations, or components,
and it omits source identifiers unless readers directly use them in configuration,
commands, or a public API. Reject any user-facing section that narrates internals
(function subjects, event streams, data flow) and any fold that enumerates APIs
instead of explaining the concept.

If the repository’s policy requires Model Experience and Known Limitations sections,
keep them as the final two H2 headings; place Further Exploration before them.

## Verification

Run the smallest focused checks while iterating, then the standing documentation
gates (doc-constraint’s `run-gates.ts` in a doc-constraint repository). Compare
English/Chinese physical line counts for a line-aligned pair. Re-read the final diff
once for factual completeness and once for brevity and repository fit.
