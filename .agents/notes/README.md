# Agent Notes

Proposals live under proposed/{class}/yyyy-mm-dd-topic.md.
Implemented decisions under implemented/{class}/yyyy-mm-dd-topic.md.
Archived (frozen) implemented notes under archived/{class}/. Only implemented notes can be archived; a sealed triplet is never edited again.
Rejected under rejected/{class}/.

## The file format

`# Agent Note: <title>`, a blank line, `Status: <lifecycle>`, a blank line, then the
language switcher, then the body. The body opens with `## Problem` and carries the
sections the lifecycle requires: `## Decision` and `## Consequences` for an
implemented note, `## Proposal`, `## Acceptance criteria`, and `## Risks` for a
proposal, `## Proposal` for a rejected one. Every note ends with
`## Alternatives considered`; a pre-format note whose alternatives are not
reconstructible carries the grandfather comment instead. `verify_agent_note_format`
enforces exactly this, and the classification gate enforces the date-prefixed
filename and the closed lifecycle/class tree.

An active note is a bilingual triplet: yyyy-mm-dd-topic.md, yyyy-mm-dd-topic.zh.md, and yyyy-mm-dd-topic.i18n.yaml. Both sides carry the switcher below the status line — English pointing at Chinese, Chinese pointing back — and a one-sided edit fails until the pair is re-recorded.
