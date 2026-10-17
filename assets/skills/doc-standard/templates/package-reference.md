# Template: package-reference

Use this template for a package with a mountable or consumable surface (plugin, service, extension) — the default for `packages/<group>/<pkg>/README.md`.

## Frontmatter

```yaml
---
description: "What the package lets a reader choose, configure, or debug, in one or two concrete sentences with searchable domain terms."
kind: "package-reference"
---
```

## Skeleton

```markdown
# <package name>

English | [中文](README.zh.md)

## Summary

Three to five sentences and at most 100 wc -w-style words on what a user or agent can DO with the package: outcomes, when to choose it, main cost, most important boundary. Never describe its role, type, or internal identity.

## Table of Contents

Link the page’s H2 sections.

## Use

When to choose this package, required inputs, the smallest safe configuration, observable success, and likely failure with recovery. Every command and config snippet has been executed against the current checkout.

<!-- <details><summary>Implementation</summary> concept-level design: overall architecture, hand-waving dataflow, links to code. No API catalogs. </details> -->

## Further Exploration

Optional; three to seven adjacent pages.

## Dev Note

Non-authoritative working context, or exactly: None.
```

## Rules

- The Summary states reader-visible capability; omit source identifiers unless readers use them directly.
- State limits that matter to consumers: durability, security, performance, failure modes.
- The implementation fold explains concepts and links code; it never enumerates APIs or restates doc comments.
- The Dev Note is the only place for partial ideas and scratches.