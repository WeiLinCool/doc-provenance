# Agent Note: 移除 doc-constraint 的跨 skill 重复

Status: implemented
Archived: 2026-10-18

[English](2026-10-18-remove-cross-skill-duplication.md) | 中文

## 问题

一次针对 `assets/skills/doc-constraint/` 与 `assets/skills/doc-standard/` 的复查在问：doc-constraint 是否重复了内容。它确实重复了，但重复的对象不是 doc-standard：两者干净地分为「怎么写」与「怎么判定」。重复发生在内部，而且是有承重作用的 —— 分层集合存在于四个地方、有两种不同的大小，证据等级存在于三处，读者无法判断哪一份副本才是门禁真正执行的。

| 事实 | 发现的副本 | 分歧 |
|---|---|---|
| 分层集合 | `docs-constraint.yaml`、`SKILL.md`、`docs/AGENTS.md`、`references/tier-examples.md` | 配置声明四个分层；两份参考列出七个 |
| 证据等级 E0–E3 | `SKILL.md`、`docs/doc-header.md`、`AGENTS.md.template` | 三张表，列各不相同 |
| 配置 schema | `SKILL.md`（内联 YAML）、`templates/docs-constraint.yaml` | 两套各自独立的默认值 |

第三行正是这个项目对文档设门禁要防的那种失败：一份默认值的两份副本逐渐漂移，而没人执行的那份副本变成了谎言。`SKILL.md` 还声称自己有完整 schema，而真正的 schema 在 `templates/` 里。

## 决策

让每个事实只有一个家，其他位置指向它，遵循这两个 skill 都已经写明的规则。

- `SKILL.md` 保留值得知道的行为与指针，而不是定义本身：配置一节列出五个块并交由 `templates/docs-constraint.yaml`；分层一节说明安装出的配置才是权威；证据一节用散文陈述等级，把要求表交给 `docs/doc-header.md`。
- `docs/AGENTS.md` 不再声称自己定义证据契约，其中的分层表改为列出随包发布的四个分层，而不是描述路径。
- `references/tier-examples.md` 拆分为随包分层（pattern、job、budget）与仓库自行添加的分层（pattern、job、budget、为什么要加它），补上 `runbook` 形态，并写明添加分层的两条规则：收窄 pattern 以免分层重叠，并映射 `type` 让该分层可达。

`SKILL.md` 从 244 行降到 204 行，没有丢掉任何规则。

## 后果

- 随包分层集合只陈述一次，就在门禁读取的配置里。示例列表现已明确只讲扩展，读者不会再把这四个缺失的分层读成可用。
- `runbook` 是通过验证而非断言加入的：一个照着文档步骤做的新仓库能装上该分层、它的 `type_tiers` 映射与一篇文档，`audit` 返回 0。
- 编辑过程中 `.agents/skills/` 下的内置副本与 `assets/skills/` 发生了漂移，`dprov doctor` 报告了它（`vendored references/tier-examples.md differs from the shipped skill`）。重新内置后清除。那项检查在制造漂移的同一次改动中证明了自己的价值。
- 手工覆盖安装出来的 `docs/AGENTS.md` 打断了它的门禁链接：源文档写 `../scripts/...`，安装后的文档需要 `../.agents/skills/...`，只有安装器的重定向步骤才会补上这个差异。重新执行 `init` 会生成正确路径，所以修复属于流程，而不属于那个文件。
- 本仓库现在是一个处于初始提交的 git 工作树，`tests/sandbox/` 与 `.DS_Store` 已被忽略，重新生成的夹具不会进入历史。

## 考虑过的替代方案

- **从 `references/tier-examples.md` 直接删掉多出来的三个分层**，而不是分开「随包发布」与「可添加」。否决：它们是合法的扩展形态，删掉会失去「如何添加一个分层」的指引。分开两张表既保留指引，又移除「它们已经存在」这一错误主张。
- **保留 `SKILL.md` 中的表格，并加一个与配置比对的同步检查。** 否决：一个执行重复的检查仍然留下两处要改，而读者相信的依旧会是那份散文副本。删掉副本比看管它更便宜。
- **让 `docs/AGENTS.md` 继续作为证据契约的声明所有者。** 否决：`doc-header.md` 才是门禁与审查协议所指的文件，一个事实有两个所有者，正是这次改动要移除的重复。