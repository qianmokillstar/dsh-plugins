# dsh-plugin-memory · markdown + git 的可迁移记忆

> 一句话结论：记忆就是一堆 markdown 文件 + git 版本，"灵魂"是一份 `SOUL.md`，会话启动时由 runtime context **硬注入**、不靠模型自觉去读；代价是它曾经有过"装了无法新建会话"的版本事故。

## 适合谁

- 想要"记忆能自己打开看、能进 git、能搬走"的人。
- 长线角色扮演：固定人格写在 `SOUL.md`，比每轮重复提示稳。
- 多台机器协作、想用 git 同步记忆的人。

## 解决什么

- 跨会话、可迁移的持久记忆：纯 markdown + git（LLM Wiki 模式）。
- 一份 `SOUL.md` 人格文件。
- 通过 runtime context **自动注入 boot 块**——硬保证，不依赖模型主动调用。
- 全平台（macOS/Windows/Linux），Node ≥ 18。

## 风险点

- **版本事故要记住**：README 自述早期 0.19.x 调用了 `ctx.agents.roots()`，而 DSH rc.2 起换成 `list()`，抛错发生在 agent 注册监听器里，**表现是"开启插件后无法新建会话"**。必须升到 0.19.2+ 并完全重启 DSH。本站实测装的是 0.20.0，无此问题。
- 记忆存成文件，改错会直接影响后续所有对话；好在你随时能打开看。
- 硬注入意味着每轮都占一部分上下文，长设定会挤压可用空间。
- 与其它记忆插件混用会重复注入。

## 替代品

- **`dsh-soul-md`**：人设卡 + 文件记忆，更偏"多角色切换"。
- **`dsh-mnemon`**：分层记忆 + 可见回合记忆栏。
- **`dsh-fish-memory`**：会淡忘、命中才注入的轻量方案。

## 事实

- 安装 spec：`dsh-plugin-memory@0.20.0`（npm）· 许可证 MIT · 隔离 profile 安装成功（2026-11-18，7s）
- 来源：[npm](https://www.npmjs.com/package/dsh-plugin-memory) · [仓库](https://github.com/LittleBlackTong/dsh-plugin-memory)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🟢 纯本地（markdown + git 全在本机）
