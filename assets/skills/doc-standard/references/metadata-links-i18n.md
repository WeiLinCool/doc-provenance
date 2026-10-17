# Metadata, links, and bilingual pairs

## Summary

Document metadata is a retrieval and template-selection interface, not a miniature
report or advertisement. The `kind` field selects exactly one template in this
skill and maps to the document standard; the frontmatter carries no field that a
filename convention or an executed gate already owns. Bilingual pages keep equal
authority, one-to-one structure, and exact physical line alignment. The
`*.i18n.yaml` sidecar records the last-confirmed pair and supports automatic merges.
Link syntax must render correctly on forges and documentation sites, so repository
links stay renderer-valid relative URLs.

## Table of Contents

- [Document metadata](#document-metadata)
- [The kind system](#the-kind-system)
- [Description quality](#description-quality)
- [Repository links and path mentions](#repository-links-and-path-mentions)
- [Bilingual line alignment](#bilingual-line-alignment)
- [Bilingual consistency records](#bilingual-consistency-records)

## Document metadata

Start every authored document with YAML frontmatter. Permit custom fields, but keep
common fields stable enough for search and indexing.

```yaml
---
description: "Example capability for users and maintainers choosing, configuring, or debugging the package."
kind: "package-reference"
---
```

`description` and `kind` are required for package README pairs. The page title and
the package manifest already own the name, while the document job and its reader
path express the audience; duplicating either in frontmatter adds no retrieval
value. The counterpart path comes from the sibling filename (`README.zh.md`), and
the sidecar owns pair state, so document-local `i18n` metadata is redundant. Do not
add `tags` until a repository-owned taxonomy and search consumer justify them beyond
description and full-text search. Keep keys lowercase and hyphenated unless an
existing owner defines another spelling, and do not copy volatile code inventories
into frontmatter.

## The kind system

`kind` selects the document template directly; every kind maps to exactly one
template that exists in this skill, and no template exists without a kind. Derive
package README kinds mechanically — read [the workflow](../SKILL.md#kind-system-and-templates)
for the decision order. Folder READMEs are indexes, not records.

A repository extends the kind table only with a distinct template file, a documented
repository position or declared owner, and a focused check that maps documents to
it. Kinds whose subject is repository-specific (for example generated change
records or tagged release archives) stay in the repository’s own skill, not here.

## Description quality

A `description` is written for retrieval: name what the reader can choose,
configure, build, or debug, with searchable domain terms. Avoid marketing voice,
"This package…", and restating the package name. One or two concrete sentences.

## Repository links and path mentions

- Write repository-relative Markdown links; they render on forges and survive
  projection into documentation sites.
- Mention paths in text with backticks; do not turn every path mention into a link.
- A relative link target must exist. If a mechanical link gate reports a missing
  target, fix the target or the link — never the gate.
- Cross-language links point at the sibling filename, not an absolute URL.

## Bilingual line alignment

Bilingual pages keep equal authority and one-to-one structure: headings, lists,
tables, code blocks, links, frontmatter layout, and physical line count align
between the source and its counterpart. Keep machine blocks (YAML, schemas,
commands) byte-identical between languages; translate prose only. A structural edit
applies to both sides in the same change.

## Bilingual consistency records

Each paired page has a `foo.i18n.yaml` sidecar recording the last-confirmed pair
(git blob hashes of both sides). The pairing gate uses it to distinguish a
one-sided edit from a confirmed pair. After editing either side, re-record the pair
with the gate’s write command; see the doc-constraint skill’s
`verify-translation-pairing`.
