# dsh-onebot-qq · 把 DSH 变成 QQ 机器人

> 一句话结论：零 Python、纯 TS 的 OneBot 11 通道，让 QQ 里的消息直接进 Agent；它是**通道**不是人格——想要"有性格的她"，还要自己在人设与记忆层做。

## 适合谁

- 想让 DSH 的 Agent 直接在 QQ（私聊/群）里回话的人。
- 已经有 NapCat / Lagrange / LLOneBot / go-cqhttp / SnowLuma 之一的人。
- 想用 QQ 当"移动端入口"、又不想装手机 App 的人。

## 解决什么

- OneBot 11 通道：反向 WS 服务器 / 正向 WS 客户端（自动重连）。
- **入站**：CQ 码解析、图片下载、语音转写（STT）、引用与合并转发展开。
- **出站**：单条 / t2i 卡片发送、Markdown 剥离、`[[qq_forward]]`、图片/语音/视频/文件工具。
- 兼容 SnowLuma 的 forward（`wsServers` + Bearer / access_token）与 reverse 两种鉴权方式。
- 纯 TypeScript 原生 Cordis 插件，挂进宿主进程，不改核心代码。

## 风险点

- **账号风险**：走 OneBot 协议端，本质是非官方客户端行为；风控与封号风险自担。
- **它是通道，不是人格**：群聊里它按 Agent 当前设定回话，没配好人设会出现"群里乱说话"。
- 需要额外跑一个协议端（NapCat 等），多一个进程与配置面；协议端更新也可能打断兼容。
- 群聊消息会进会话，等于把群内容写入你的 DSH 历史（隐私面）。
- 图片/语音/文件工具让 Agent 能发东西出去，误发风险要自己评估。

## 替代品

- **`dsh-fish-soul`**：在通道之上再包一层人格与按人记忆（更重、风险更高）。
- **`@tencent-connect/dsh-qqbot`** / **`@zaofan/dsh-qqbot`**：官方/第三方 QQ Bot 路线，合规性更好但要审核。
- **`@xmanrui/dsh-im`**：一次接多家 IM（微信/飞书/钉钉/Telegram 等）。

## 事实

- 安装 spec：`dsh-onebot-qq@0.10.0`（npm）· 许可证 BSD-3-Clause · 隔离 profile 安装成功（2026-11-18，102s）
- 来源：[npm](https://www.npmjs.com/package/dsh-onebot-qq) · [仓库](https://github.com/dsh-external/dsh-onebot)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（消息经 QQ 与 OneBot 协议端；群内容会进会话历史）
