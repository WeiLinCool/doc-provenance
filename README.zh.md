# doc-provenance

> 面向 Agent 撰写文档的溯源与证据门禁 —— 让仓库文档保持为真正的资产，而非形式主义的产物。

## 为什么

在后 AI 时代，仓库里的文档由 Agent 编写、由人类阅读。稀缺的早已不是数量，而是信任。读者没有看着这一页被写出来，所以一篇文档要有价值，先得回答三个问题：

| 问题 | 只有文档时会失效的地方 | dprov 补上的东西 |
|---|---|---|
| 是否**准确**？ | Agent 可以用同样的自信断言任何内容 | 一个门禁可校验的证据等级（E0–E3） |
| 是否**及时**？ | 带日期的证据会无声腐坏 | `validated_at` 加上针对 commit 的路径漂移检查 |
| 是否**易读**？ | 篇幅只增不减，直到没人读 | 分层归位、字数预算、链接检查 |

能在仓库里留存下来的文档，是核心资产：它承载决策、契约，以及决策背后的理由。一旦它变成形式主义的产物 —— 为满足流程而产出、无人阅读、与它所描述的代码互相矛盾 —— 它就不再是资产。

所以这不是为约束而约束。一篇主张可被核验、年龄可见、读者成本有上界的文档，才是人类仍能据以行动的文档。机械门禁的作用是守住这一点，而不是制造合规，更不是取代背后的判断。

这三个问题以及 E0–E3 分级来自 *文档准确性评估*：`docs/doc-header.md` 中的头部块正是其元数据示例的直接后裔。

## 脉络

- **[comet](https://github.com/rpamis/comet)** —— 工作流形态：一条确定性的 skill 链，终点是机械判定的结论，没有任何一步留给模型自由裁量。
- **[dsh-doc](https://github.com/deepseek-ai/deepseek-harness)** —— skill 打包方式：路由 skill、写作 skill、门禁 skill 各司其职。
- ***文档准确性评估*** —— 度量方式：docs 由 agent 编写、human 审阅，所以文档必须携带可核验的证据、时效状态，以及明确的读者阅读成本。

doc-provenance 的不同之处：它不是给某一个 Agent-harness 用的 skill，而是把同一套约束安装进任意仓库的 CLI 平台；门禁以零依赖的 Node 运行，因此结论在 CI 中可复现。

## 三个问题，落到门禁上

证据等级衡量的是证据本身，而不是作者的自信程度。声明高于证据支持的等级会导致门禁失败。

| 等级 | 主张 | 机器校验方式 |
|---|---|---|
| `E0` | 只有 Agent 的描述，尚无可核验之物 | 仅在 `status: draft` 时允许 |
| `E1` | 依据是人工决策、issue 或 ADR | 校验 `source` 条目的结构与键名 |
| `E2` | 可对着当前代码树核对 | 证据 `path` 存在且 `validated_at` 未过期 |
| `E3` | 行为已由测试或记录下来的命令验证 | 该测试能在 `test_globs` 下找到 |

范围内每篇文档都以这样的头部开头：

```yaml
---
id: spec-auth-001
type: spec
status: review
owner: wlz
evidence_level: E2
source:
  - issue: AUTH-123
evidence:
  - path: src/auth/AuthService.java
validated_at: 2026-10-17
---
```

- **准确性**：`evidence_level` 设定下限，`status` 再把它钉住 —— `accepted` 需要 E2，以及一个不同于 `owner` 的人工 `reviewed_by`。
- **时效性**：处于 `review` 与 `accepted` 的文档，其 `validated_at` 不得早于 `max_age_days`（默认 180 天）；若证据路径在记录的 `commit` 之后发生漂移，门禁会连同原因一并失败。
- **可读性**：每个事实只属于一个分层，每个分层有唯一职责，有预算的分层一旦超过上限即失败。重复内容应当链接，而不是复述。

## 安装

```bash
npm install -g doc-provenance   # or run locally: node bin/dprov.js
```

## 命令

| 命令 | 作用 |
|---|---|
| `dprov init [target]` | 内置 skill 运行时，写入 `docs-constraint.yaml`、`docs/AGENTS.md`、`docs/doc-header.md` 与 `.agents/notes/` 目录树 |
| `dprov audit [target]` | 运行所有启用的门禁；退出码即结论 |
| `dprov ci [target]` | 生成 `.github/workflows/doc-sync.yml` |
| `dprov status [target]` | 显示安装状态与 doc-flow 路由判定 |
| `dprov doctor [target]` | 诊断残缺安装与过程产物 |

## 架构

```text
doc-provenance (CLI platform)
  ├─ assets/skills/doc-flow        entry router + deterministic workflow chain
  ├─ assets/skills/doc-standard    writing standard (kinds, templates, voice, review)
  └─ assets/skills/doc-constraint  mechanical gates (headers, budgets, pairing, links, notes)
```

`init` 只把每个 skill 的运行时表面内置到 `<repo>/.agents/skills/<name>/`，与 comet 把 skills 装进项目的方式一致。安装器与模板是一次性输入，不会进入目标仓库。

初始化之后，agent 沿内置的 skill 链工作：`doc-flow` 决定路由，`doc-standard` 负责写作，`doc-constraint` 负责判定。

```text
setup → write → verify → (on failure) fix and verify again
```

```bash
node .agents/skills/doc-flow/scripts/doc-entry.mjs . --json     # route
node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts   # verify
```

## 设计原则

- 零运行时依赖；只依赖 Node 的类型剥离（Node >= 20.11）。
- 门禁即完成标准 —— 修文档，永远不要修门禁。
- 内置的 skill 不携带过程产物（`node_modules/`、锁文件、安装器模板）—— `docforge doctor` 会拒绝它们。
- doc-flow 入口脚本只解析出一个下游 skill，且从不修改文件。
- 文档绝不声明超出其证据的结论；若连来源都举不出，它就是 E0 草稿，并如实说明。