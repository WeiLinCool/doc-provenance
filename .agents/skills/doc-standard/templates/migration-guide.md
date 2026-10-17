# Template: migration-guide

Use this kind for `docs/migrations/<version>/<item>/guide.md` and its Chinese sibling `guide.zh.md`, whose sections are `## 变更` (Change) and `## 迁移` (Migration). The tree has no folder index; one guide per externally perceptible break.

## Frontmatter

```yaml
---
kind: migration-guide
description: "The externally perceptible surface that breaks and what replaces it."
---
```

## Skeleton

```markdown
# <Specific break, for example: --profile replaces --preset>

English | [中文](guide.zh.md)

## Change

State the old and new behavior of the surface and who observes it.

## Migration

Steps to move an existing setup to the new surface, each executed against the current checkout. Name the last version where the old behavior applies.
```

## Rules

- One guide covers exactly one externally perceptible break.
- Keep the guide within 500 English words; link deeper material instead of inlining it.
- Keep the Change and Migration sections machine-checkable by their fixed headings in both languages.
- Both language versions keep identical structure and physical line alignment.