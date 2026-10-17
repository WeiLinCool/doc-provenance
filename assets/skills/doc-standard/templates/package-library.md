# Template: package-library

Use this template for a package with no mountable surface: its entry exports a plain module API and it registers nothing into a composition or runtime.

A library README differs from a package reference in two ways: no install-into-a-surface guidance (a library is a dependency, not a layer), and no mount configuration (there is nothing to mount).

## Frontmatter

```yaml
---
description: "What the library lets a caller build, in one or two concrete sentences with the consuming packages or searchable domain terms."
kind: "package-library"
---
```

## Skeleton

```markdown
# <package name>

English | [中文](README.zh.md)

## Summary

Three to five sentences and at most 100 wc -w-style words: what a caller can DO with the library, who consumes it, the smallest entry point, and the main boundary.

## Table of Contents

Link the page’s H2 sections.

## Usage

The smallest consumer entry point, one worked example executed against the current checkout, and the boundary: what the library does not own or promise.

<!-- <details><summary>Design</summary> concept-level architecture and dataflow, links to code. </details> -->

## Dev Note

Non-authoritative working context, or exactly: None.
```

## Rules

- No install-into-a-surface path and no mount configuration anywhere in the page.
- Name the consuming packages or the intended caller; a library exists for its callers.
- Link the API owner for exact signatures; do not restate them.