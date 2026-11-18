# @openviking/dsh-memory-plugin · OpenViking 记忆接入

> 一句话结论：它不是"装完就能用"的记忆插件——**必须先有一台 OpenViking 服务器**（支持 `viking://~` 别名），否则装了也只会报错。

## 适合谁

- 已经在用 OpenViking（或愿意自建）的人。
- 需要把记忆与技能放在 `viking://` URI 体系下、由外部服务统一管理的人。
- 团队共享记忆空间（调用方自己的 context space）的人。

## 解决什么

- 接 OpenViking 的自动召回与会话捕获。
- 注册 OpenViking 的 MCP 工具面，并保护 `viking://` URI。
- 召回目标固定为调用方自己的空间（`viking://~/memories`、`viking://~/skills`），新服务器会拒绝无 uid 的简写形式。

## 风险点

- **前置条件重**：没有 OpenViking 服务器 = 装了没用。README 明说需要带 `viking://~` 支持的服务端。
- 官方安装方式是**执行远程脚本**（`curl ... | bash`），这种装法本身就有供应链风险；更稳的是手动 `dsh plugin add`。
- 记忆数据存在外部服务上，隐私取决于你自建还是用别人的。
- 记忆与技能分两个 URI 空间，配错会"召回到空"。

## 替代品

- **`dsh-mnemon`**：本地优先、分层记忆，不需要外部服务。
- **`dsh-fish-memory`**：纯本地轻量。
- **`memory-eternal`**：本地 + 可选云同步。

## 事实

- 安装 spec：`@openviking/dsh-memory-plugin@0.5.38`（npm）· 许可证 Apache-2.0 · 隔离 profile 安装成功（2026-11-18，6s）
- 来源：[npm](https://www.npmjs.com/package/@openviking/dsh-memory-plugin) · [仓库](https://github.com/openviking/dsh-memory-plugin)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（记忆存在 OpenViking 服务端；自建可降低风险）
