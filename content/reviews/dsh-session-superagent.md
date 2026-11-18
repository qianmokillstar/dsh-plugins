# dsh-session-superagent · 让会话自己盯仓库

> 一句话结论：给会话配一个"监工"——盯着 GitHub 仓库，有事发生时唤醒会话去处理，凭据不进模型上下文；**实测被 pnpm 构建脚本拦截，状态是半装**。

## 适合谁

- 希望"有 issue/PR 就自动处理"而不是自己轮询的人。
- 关心凭据安全：它强调凭据不会进模型上下文。
- 长任务跑着、需要外部事件驱动继续的人。

## 解决什么

- 监听 GitHub 仓库变化（issue、PR 等），满足条件时唤醒指定会话。
- 把"发生了什么"作为上下文交给 Agent 处理。
- 凭据保留在插件侧，不写进提示词。

## 风险点

- **安装被 pnpm 拦截**：与 IM 类插件同一问题（`protobufjs` 构建脚本），本站实测为"**半装**"——包落地、写进 dependencies，但未进 bundles，不生效。需要 `pnpm approve-builds` 处理。
- 需要 GitHub token，权限范围要给够才能读 issue/PR——**token 泄露等于仓库被读**。
- 自动唤醒会话 = 自动花 token；配置不当可能被事件刷爆。
- 事件驱动与 DSH 会话生命周期耦合，排查比普通插件难。

## 替代品

- **`dsh-hooks-*` / Claude Code hooks 桥**：事件钩子更通用。
- **`dsh-notify-me`**：只提醒你，不自动跑。
- **手动轮询 + `@` 引用**：最笨但最可控。

## 事实

- 安装 spec：`dsh-session-superagent@0.10.12`（npm）· 许可证 MIT
- 安装结果：**半装**（2026-11-18）——包已落地，`protobufjs` 构建脚本被 pnpm 拦截而未组合
- 来源：[npm](https://www.npmjs.com/package/dsh-session-superagent) · [仓库](https://github.com/MYCF711/dsh-session-superagent)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（读取 GitHub 事件；凭据留在插件侧）
