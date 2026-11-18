# @tencent-connect/dsh-qqbot · 官方 QQ Bot 通道

> 一句话结论：走腾讯官方 QQ Bot 开放平台，比 OneBot 方案合规；但要先去开放平台建机器人、拿 AppID/Secret，**实测同样被 pnpm 构建脚本拦截**。

## 适合谁

- 想要"合规优先"的人：不愿意用 OneBot 这类非官方客户端方案。
- 已经有 QQ 开放平台机器人账号（AppID/Secret/Token）的人。
- 需要在 QQ 群/私聊里提供官方机器人能力的人。

## 解决什么

- 通过腾讯 QQ Bot 开放平台接入 QQ 私聊与群聊。
- 官方鉴权体系（AppID + Secret + Token），比抓登录态稳。
- 消息交给 DSH Agent 处理，回复走官方接口。

## 风险点

- **前置条件**：需要先在 QQ 开放平台注册机器人并审核，不是装完就能用。
- **安装被 pnpm 拦截**：与 `@michengai/dsh-im-connect` 同一问题——`protobufjs` 构建脚本被拒，命令失败退出。本站实测为"**半装**"：包落地、写入 dependencies，但未进入 bundles，**不会生效**。
- 官方接口有频率与内容审核约束，Agent 输出的自由度受平台规则限制。
- 凭据（AppID/Secret/Token）泄露等于机器人被接管。

## 替代品

- **`dsh-onebot-qq`**：绕开审核但要自己跑协议端，账号风险更高。
- **`@zaofan/dsh-qqbot`**：另一套 QQ Bot 实现。
- **`@michengai/dsh-im-connect`**：一次接多家，但同样受 pnpm 拦截影响。

## 事实

- 安装 spec：`@tencent-connect/dsh-qqbot@0.5.5`（npm）· 许可证 MIT
- 安装结果：**半装**（2026-11-18）——包已落地，`protobufjs` 构建脚本被 pnpm 拦截而未组合
- 来源：[npm](https://www.npmjs.com/package/@tencent-connect/dsh-qqbot)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（消息经腾讯 QQ Bot 平台）
