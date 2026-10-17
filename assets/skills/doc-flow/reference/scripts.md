# Script discovery and command contract

Canonical path: `doc-flow/reference/scripts.md`.

This file is the single source of truth for the doc-flow script chain. The entry
script resolves which downstream skill handles the request; the gates script is
the only verdict on whether documentation work is done.

## Entry resolution

Prefer the repository-vendored copy; fall back to the installed skill root only
when the vendored path is missing:

```bash
# 1. preferred: repository-local
node .agents/skills/doc-flow/scripts/doc-entry.mjs . --json

# 2. fallback: locate the installed skill (never hardcode a home path)
DOC_ENTRY="$(find . "$HOME"/.*/skills "$HOME/.config" -path "*/doc-flow/scripts/doc-entry.mjs" -type f -print -quit 2>/dev/null)"
[ -n "$DOC_ENTRY" ] && node "$DOC_ENTRY" . --json
```

Output contract: JSON with `schema: doc.resolution.v1` and exactly one `skill`
value (`doc-constraint` or `doc-standard`). Reject any other schema or
skill, and never guess when the script fails — report the error.

## Chained commands

| Step | Command | Owner skill |
|---|---|---|
| Setup | `node .agents/skills/doc-constraint/templates/install.ts init` | doc-constraint |
| Gates | `node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts` | doc-constraint |
| Audit one gate | `node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-doc-headers.ts --list` | doc-constraint |
| Write / review | follow doc-standard SKILL.md (templates under its `templates/`) | doc-standard |

## Rules

- The entry script never edits files; it only resolves the route.
- Gates are the completion criterion: work is done only when `run-gates.ts`
  exits zero. A red gate is fixed by correcting the docs, never by weakening the
  config or skipping the gate.
- Every step in [../runtime/doc-flow.yaml](../runtime/doc-flow.yaml) invokes only
  the two declared skills; adding a third requires updating this contract first.