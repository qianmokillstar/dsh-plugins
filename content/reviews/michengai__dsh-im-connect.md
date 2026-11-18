# @michengai/dsh-im-connect · 一家插件接多家 IM

> 一句话结论：一个插件同时接微信/飞书/企微/钉钉/QQ/Telegram/WhatsApp/Slack/Discord/Matrix 等十几家 IM；**实测踩到 pnpm 的构建脚本拦截**，包落地了但没生效。

## 适合谁

- 想让 DSH 同时挂在多个 IM 上、不用一家装一个插件的人。
- 团队已经用飞书/企微/钉钉，想直接把 Agent 接进现有工作流的人。
- 需要跨平台认人（同一个人在多个 IM 里是同一个会话）的人。

## 解决什么

- 统一接入十几家 IM（微信、飞书、企微、钉钉、QQ、Telegram、WhatsApp、Slack、Discord、Matrix 等）。
- 一套配置管理多个通道，避免十几个插件互相打架。
- 消息进来交给 DSH Agent，回复发回对应平台。

## 风险点

- **安装会被 pnpm 拦截**：依赖 `protobufjs` 的构建脚本被 pnpm 11 拒绝执行，命令以 `ERR_PNPM_IGNORED_BUILDS` 失败退出。本站实测状态是"**半装**"——包在 `node_modules` 里、写进了 dependencies，但**没进入 profile bundles，不会生效**。需要 `pnpm approve-builds` 或白名单处理后重装。
- **每家 IM 都要凭据/登录态**，凭据面非常大；一旦泄露等于多个社交账号失守。
- 多平台同时在线，Agent 说错话的"溅射范围"也随之扩大。
- 各家接口都可能是非官方路径，随时失效。

## 替代品

- **`dsh-onebot-qq`**：只接 QQ，走标准 OneBot 11，更聚焦。
- **`@tencent-connect/dsh-qqbot`**：官方 QQ Bot 路线，合规更好。
- **单平台插件一家一个**：配置分散但故障隔离。

## 事实

- 安装 spec：`@michengai/dsh-im-connect@1.0.43`（npm）· 许可证 Apache-2.0
- 安装结果：**半装**（2026-11-18）——包已落地，因 `protobufjs` 构建脚本被 pnpm 拦截而未组合
- 来源：[npm](https://www.npmjs.com/package/@michengai/dsh-im-connect) · [仓库](https://github.com/MichengAI/dsh-im-connect)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（消息经各家 IM 服务）
