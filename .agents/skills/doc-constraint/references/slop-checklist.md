# Documentation Slop Checklist

Slop is documentation that looks fine but carries no durable information for a
future reader. The mechanical gates catch structure; this checklist catches
content. Keep these patterns out of every tier.

## Patterns to avoid

- **Change history dressing as state.** “Added a settings page”, “fixed a bug in X”.
  Document what is true now, not what changed.
- **Process transcripts.** “We decided to try X after discussion.” State the decision
  and its rationale, not the meeting.
- **Vague connectors.** “This is important because…”, “Note that…”. Say why, or cut.
- **Re-stated links.** Repeating a fact that already has a home doubles maintenance
  and drifts. Link instead.
- **Undefined jargon.** An acronym used once with no expansion.
- **Proposal-speak in implemented docs.** “Will / should / plan to / migration plan”
  in an Agent Note marked `implemented`. State what is.
- **Aggregate promises with no owner.** “All pages should use the new design” with no
  pointer to the owner.
- **Level inflation.** `evidence_level: E3` with no test or recorded command, or
  `status: accepted` with no human reviewer. Claim the strongest level the evidence
  supports, and let the gate hold you to it.
- **Undated freshness.** `validated_at` copied forward without re-checking anything, so
  the date reads current while the claim is stale.

## Slop that fails the mechanical gates

- An implemented Agent Note carrying `## Proposal`, `## Plan`, or
  `## Acceptance criteria` headings (rejected by `verify-agent-note-format`).
- A budgeted doc over its ceiling (rejected by `verify-doc-budgets`).
- A broken relative link or fragment (rejected by `verify-md-links`).
- An incomplete or drifted bilingual triplet (rejected by `verify-translation-pairing`).
- A header whose declared evidence level, provenance, or freshness the evidence cannot
  support (rejected by `verify-doc-headers`, documented in `docs/doc-header.md`).

## Preferred phrasing

- State the present tense: “The engine supports tolerance analysis.”
- Attribute the why: “Tolerance analysis lives in the quote engine so drawings and
  quotes share one computation path.”
- Link to the owner instead of duplicating.
