---
id: reference-gates-001
type: reference
status: review
owner: wlz
evidence_level: E2
source:
  - doc: 文档准确性评估 (2026-10-17)
  - decision: one gate per contract, each a separate process
evidence:
  - path: assets/skills/doc-constraint/scripts/run-gates.ts
  - path: docs-constraint.yaml
validated_at: 2026-10-17
---

# 门禁

`run-gates.ts` 读取 `docs-constraint.yaml` 中的 `gates:` 段，把每个启用的门禁各起一个 `node --experimental-strip-types` 进程。它收集全部失败，而不是遇到第一个就停：一次只报一个问题的运行，会让人修一次、重跑一次、再撞见下一个，门禁套件正是这样变得烦人而非有用。

| 门禁 | 判定内容 |
|---|---|
| `verify_doc_budgets` | 有预算的页面是否仍在上限之内 |
| `verify_doc_headers` | 标识、负责人、来源、证据等级与证据是否匹配、时效、评审对 |
| `verify_md_links` | 相对链接、图片与锚点是否可解析 |
| `verify_translation_pairing` | 双语三件套是否完整，两侧是否仍是记录中的配对 |
| `verify_agent_note_format` | Agent Note 的头部与章节骨架 |
| `verify_agent_note_classification` | 生命周期/分类目录树与文件名 |
| `verify_archived_agent_notes` | 冻结归档的哈希与三件套 |

每个门禁独立成进程是刻意的：一个门禁无法破坏另一个门禁的状态，崩溃会表现为失败而不是沉默。

## 退出码

全部启用门禁通过时为 `0`；任一失败或配置不可读时为 `1`。在 `gates:` 下被禁用的门禁根本不会运行，因此关于它的沉默并不构成对相关文档的结论。

## 范围与排除

每道门禁有自己的范围。被某道门禁排除的文件，仍然受其他门禁检查：例如翻译排除不再泄漏到链接门禁，因为一篇不参与配对的页面，其链接依然会腐坏。
