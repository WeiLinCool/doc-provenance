# Template: package-group

Use this template for `packages/README.md` and every group-level package index. The page is a map: it orients the capability family, lists its direct packages with one-line roles, and links package-owned details. It never restates a package’s contract.

## Frontmatter

```yaml
---
description: "The <group> package group: what the packages own, for readers choosing or navigating the family."
kind: "package-group"
---
```

## Skeleton

```markdown
# <group>/ — <one-line subject>

English | [中文](README.zh.md)

## Summary

Three to five sentences and at most 100 wc -w-style words: what the family provides, what a reader can DO with it, which package owns which half, and the main boundary.

## Table of Contents

Link the page’s H2 sections.

## Packages

One entry per direct package: linked name, one-line role, and the group it sits in. Link package-owned detail; never restate a package README.

<!-- <details> fold: composition — how packages in the group combine; concept level only. -->

## Further Exploration

Three to seven adjacent pages, each with a phrase saying what it adds.

## Dev Note

Non-authoritative working context, or exactly: None.
```

## Rules

- Describe composition relationships between packages; do not copy their summaries.
- Keep package entries to one line each; the package README owns the contract.
- Fold any deeper explanation behind <details> with the title visible.