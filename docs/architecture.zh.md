---
id: architecture-dprov-001
type: architecture
status: review
owner: wlz
evidence_level: E2
source:
  - doc: 文档准确性评估 (2026-10-17)
  - decision: keep the skills, installer, and gates inside this repository
evidence:
  - path: app/cli/index.ts
  - path: platform/skills.ts
  - path: assets/skills/doc-constraint/scripts/run-gates.ts
validated_at: 2026-10-17
---

# 架构

dprov 分为两层，中间只有一条边界。CLI 是一层很小且稳定的前端；skills 则是自包含的运行时，可以被复制进任意仓库，仅靠 Node 就能在那里运行。其余设计都由这条分界推得。

## 两层结构

```text
bin/dprov.js                    launcher: re-executes the CLI under Node type stripping
  └─ app/cli/index.ts           argument parsing, command dispatch
       ├─ app/commands/init.ts      vendoring + config authoring
       ├─ app/commands/audit.ts     runs the gates
       ├─ app/commands/ci.ts        generates a workflow
       ├─ app/commands/status.ts    reports install state + doc-flow route
       └─ app/commands/doctor.ts    diagnoses broken installs and drift
            └─ platform/skills.ts   resolves assets/skills/<name>
```

CLI 里没有任何门禁逻辑。它只负责定位 skill，然后把 skill 复制进目标仓库（`init`），或者把执行委托给其中的某个脚本（`audit`）。正因如此，同一套门禁既能从源码检出运行，也能从已安装的仓库运行。

## 随包交付的内容

`assets/skills/` 存放三个内置 skill。它们既是运行时，也是唯一事实源：

| Skill | 职责 | 文件数 |
|---|---|---|
| `doc-flow` | 解析路由：只给出一个下游 skill，从不修改文件 | 4 |
| `doc-standard` | 写作标准：文档种类、模板、语气、评审 | 9 |
| `doc-constraint` | 机械门禁：头部、预算、链接、配对、笔记 | 23 |

判定结论的代码都在 `doc-constraint` 中：七个门禁脚本、共享的配置解析器（`doc-config.ts`）、笔记树遍历器，以及负责调度的 runner。

## vendoring 边界

`init` 会把每个 skill 的运行时表面复制到 `<repo>/.agents/skills/<name>/`。三条规则维持这条边界：

- **只复制运行时。** `SKILL.md`、`scripts/` 与 `references/` 才会被内置；`templates/` 与 `docs/` 是安装器的输入，留在原处，避免目标仓库意外拥有第二份安装器。
- **链接必须重定向。** 随包文档以 `scripts/...` 引用自身脚本；安装器会改写证据路径、命令与 Markdown 链接，使其指向内置位置——相对于 `docs/` 往上一级。
- **副本必须一致。** `dprov doctor` 会逐个比对内置文件与 `assets/skills/`，不一致即失败：过期的门禁，等于对无人运行的代码给出结论。

## 门禁的执行方式

七道门禁共同决定结论，各自独立成进程：一个门禁无法破坏另一个的状态，崩溃会表现为失败而不是沉默。每道门禁判定什么、范围与排除如何处理，见 [gates.md](gates.md)。

## 状态存在哪里

没有数据库，也没有缓存。状态就是目录树本身：

- `docs-constraint.yaml` 声明分层、i18n 与哪些门禁启用。
- 文档头部承载 `status`、`evidence_level` 与 `validated_at`。
- `*.i18n.yaml` 侧车记录每对翻译最后一次确认的哈希。
- `.agents/notes/` 按生命周期与分类存放决策记录。

因此门禁永远不需要信任上一次运行的结果，它从文件重新推导一切——这正是结论能在 CI 中复现的原因。

## 文档生命周期

一篇文档沿唯一的 status 机流转。每条边要么成功，要么被头部门禁拒绝；而每个守卫都是测试可以触发的条件——不存在只活在正文里的规则。

```text
                          evidence written
                                  │
                                  ▼
                          ┌───────────────┐
              ┌──────────▶│     draft     │  E0 · no source
              │           └───────┬───────┘
              │                   │ [claim a source and write the header]
              │                   ▼
              │           ┌───────────────┐
              │           │    review     │  E1+ · clock starts
              │           └───────┬───────┘
              │                   │ [validated_at ≤ max_age_days]
              │                   │ [reviewed_at ≥ validated_at]
              │                   │ [reviewed_by ≠ owner]
              │                   ▼
              │           ┌───────────────┐
              │           │   accepted    │  E2+ · in force
              │           └───┬───────┬───┘
              │               │       │
              │   [no longer advised]  [claim replaced]
              │               ▼       ▼
              │      ┌────────────┐ ┌────────────┐
              │      │ deprecated │ │ superseded │
              │      └──────┬─────┘ └──────┬─────┘
              │             │  [superseded_by: <id>]
              │             │              │
              └─────────────┴──────────────┘
                 [evidence changed: fix and re-validate]
                             │
                             ▼
                    ┌──────────────────┐
                    │ STALE → rejected │  asked of review/accepted only
                    └──────────────────┘
                      age > max_age_days
```

### 两条看似例外的守卫

两者都是带条件的边，而不是脚注——且都有测试覆盖：

| 守卫 | 作用于 | 结论 |
|---|---|---|
| `validated_at` 超过 `max_age_days` | `review`、`accepted` | **拒绝**：重新核验证据并推进日期 |
| 同样的过期日期 | `deprecated`、`superseded` | **允许**：归档的决策可以永远陈旧却依然正确 |
| `reviewed_at` 早于 `validated_at` | `accepted` | **拒绝**：签名早于它所签署的材料，必须重签 |
| `reviewed_by` 等于 `owner` | `accepted` | **拒绝**：文档不能自己批准自己 |

把表格读成图：过期是一条通向「拒绝」状态的边，而 status 决定这条边是否存在。这正是为什么豁免属于转移的性质，而不是日期的性质。

### 门禁看不见什么

它校验结构，不校验含义。正文是否仍与主张相符不是机器问题，也没有任何一张图能把它变成机器问题：那条边始终属于评审者。

## 测试套件

两条命令，两种职责。`npm test` **产出一份可查看的东西**——它会清空并用真实的 `dprov init` 重建 `tests/sandbox/`，因此那个目录就是该命令当前的输出。`npm run test:gates` **验证改动**：重新生成沙盒，并针对它断言。

```bash
npm test                     # generate tests/sandbox
npm run test:gates           # assert it, and assert the edit flows
npm run test:gates:fixtures  # the header gate's own regression fixtures
npm run snapshot             # rewrite tests/init-tree.txt after an intended change
```

| 路径 | 职责 |
|---|---|
| `tests/sandbox/` | 一份可直接打开、编辑、手动审计的真实安装；git 忽略，每次运行重建 |
| `tests/init-tree.txt` | 全新安装必须产出的树，可在 diff 中评审 |
| `tests/init.test.ts` | 沙盒与该树一致、链接可解析、门禁在其上通过 |
| `tests/edit.test.ts` | 每个用例一处编辑：哪道门禁发现，以及它说了什么 |
| `tests/flow.test.ts` | 环路闭合：route、audit、fail、fix、pass |
| `tests/lifecycle.test.ts` | 每一条带守卫的状态转移 |

### 工作节奏

生成、查看、改动、验证——只有当改动是刻意的且已评审，才重新生成记录：

```text
npm test ──▶ inspect tests/sandbox ──▶ change code ──▶ npm run test:gates
                                                              │
                                    intended? ──▶ npm run snapshot ──▶ review the diff
```

在 `tests/` 下留一份真实安装，正是「查看」与「猜测」的分界：你可以对安装器刚刚产出的那棵树运行 `bin/dprov.js audit tests/sandbox`，在里面改一个文件看某道门禁失败，然后重跑。断言覆盖的正是同一个目录，因此你查看的和通过的是同一个东西。

### 执行度，而不只是结构

结构清单回答的是「有什么」，回答不了「我改了一处之后会发生什么」——而这才是维护者真正关心的问题。流程套件把这条环路真正跑一遍，并断言两端：

```text
init ──▶ green ──▶ edit one file ──▶ fail (named gate + reason) ──▶ fix ──▶ green again
```

它同时断言：两处独立的破坏能在一次运行里同时暴露，而不是一次只报一个；以及 `dprov doctor` 能发现被篡改的门禁运行时——那种改动会让此后所有结论都失去意义。

在相信一次「绿色」之前，有三点需要知道：

- **空的套件会静默通过。** 匹配不到文件的 glob 会报告 `1..0` 并以 0 退出，于是「没有测试」与「测试全部通过」看起来完全一样。若某次运行报告 `# tests 0`，那说明什么都没验证。
- **目录形式找不到 TypeScript 测试。** `node --test tests/` 只发现 Node 无需额外参数即可加载的文件；配合类型剥离可用的是 `tests/*.test.ts`。
- **管道会吞掉退出码。** `dprov audit . | tail` 报告的是 `tail` 的状态，也就是 0，于是一个失败的门禁会被读成通过。请在管道之前捕获退出码：`dprov audit .; echo exit=$?`。

最后一条并非本项目独有，正因如此才值得写下来：门禁可以完全正确，却仍被调用它的那个 shell 报告为绿色。

## 设计约束

- **零运行时依赖。** 一切依赖 Node >= 20.11 的类型剥离。安装即复制文件；目标仓库内没有构建步骤，也不需要 `npm install`。
- **门禁只判定，不修改。** 任何门禁都不会重写文档。失败时它会给出文件、行号与原因；修改由人或 agent 完成。
- **语言之间是平等的。** 译本不是从属副本。任一侧都可以先改，门禁会报告是哪一侧发生了变动，以便有意识地传播。
- **一个事实只有一个家。** 分层决定事实归属；其他文档链接过去。重复应当是链接，而不是复述。

## 扩展点

- 新增门禁：在 `assets/skills/doc-constraint/scripts/` 写脚本，在 runner 的 `GATES` 表中登记，并在配置的 `gates:` 下加一个键。
- 新增分层：加一条 `tiers:` 与一个 `type_tiers` 映射，使头部的 `type` 能把文档钉在某个位置。
- 新增语言：加一条 `suffix_map`；配对门禁会据此推导两个方向，而不是假定单一硬编码的对端。