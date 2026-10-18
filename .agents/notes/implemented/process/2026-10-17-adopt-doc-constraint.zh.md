# Agent Note: 在本仓库采用 doc-provenance 的文档约束

Status: implemented

English | [中文](2026-10-17-adopt-doc-constraint.zh.md)

## 问题

doc-provenance 自带 doc-constraint skill，但它所约束的这个仓库从未被它约束过：没有 `docs-constraint.yaml`，没有文档头部，也没有接入 CI 的门禁。一个以机械化的文档诚实为卖点的平台，自身却是未经校验的 —— README 中关于 E0–E3、时效与预算的主张，只是可读的散文，背后没有任何门禁。

## 决策

用平台约束它自己，并且只使用它随包发布的那个安装器，让本仓库成为自己的第一个采用者。

- `doc-provenance init .` 把 `doc-constraint`、`doc-standard`、`doc-flow` 的运行时表面内置到 `.agents/skills/`，并写出 `docs-constraint.yaml`、`AGENTS.md`、`docs/AGENTS.md`、`docs/doc-header.md` 与 `.agents/notes/` 生命周期目录树。
- `README.md` 保留英文源，新增 `README.zh.md` 对应版本与其 `README.i18n.yaml` 侧车，因为 `docs-constraint.yaml` 发布时即带有 `i18n.enabled: true`，且把 `README.md` 列入了 `scope_patterns`。
- `doc-provenance ci .` 写出 `.github/workflows/doc-sync.yml`，让门禁在触及 Markdown 的 pull request 与 `main` 推送时运行。

第一次运行门禁恰好只失败一项：README 三件套缺失。修的是文档，而不是门禁。

## 后果

- 现在所有门禁都通过（`run-gates: 6 gate(s) passed`），README 这一对记录在两侧一致的 blob 哈希上。改动 README 任意一侧而不重记配对，门禁就会失败。
- `docs/doc-header.md` 以 `status: review` 安装，所以仍需人工把它提升为 `accepted`；agent 不得自行批准。这篇笔记的同类文档同理。
- `AGENTS.md` 分层的预算是 1600 词、`docs/architecture.md` 是 1800 词，但当时两个文件都不存在；这些检查只在文件写出之后才生效。
- Agent Note 门禁报告「no `.agents/notes` tree; nothing to check」，尽管 `init` 已经创建了它。walker 把根解析为 `resolve(scripts/, '../.agents/notes')`，落在内置 skill 目录内（`.agents/skills/doc-constraint/.agents/notes`），因此永远看不到仓库根的目录树。在路径修好之前这些门禁是空转的；这篇笔记仍按强制格式书写，以便发现逻辑修好后直接通过。
- `docflow status` 在 CI workflow 存在之前仍会报告「Incomplete installation」；执行 `ci` 之后，这是唯一被补上的缺口。

## 考虑过的替代方案

- **关闭双语配对（`i18n.enabled: false`）** 而不是翻译 README。否决：模板发布时配对是开启的，且把 `README.md` 列入范围，关掉它等于为迁就文档而削弱契约 —— 而这正是设计原则所禁止的那一个动作。
- **只翻译，不写侧车。** 否决：门禁要求 `README.i18n.yaml` 记录；没有记录哈希的配对，无法区分「已确认的配对」与「单侧改动」。
- **给 `README.md` 手写一个头部**以抬高其证据等级。否决：`README.md` 按设计就在头部门禁的排除列表里，承载证据头部的是安装出来的那份规格文档。
