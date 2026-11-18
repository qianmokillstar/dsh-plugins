# dsh-config-manager · 配置备份、恢复与迁移

> 一句话结论：把 DSH 的设置、Provider、插件配置、MCP、Skills、Presets、Workspace 打成一个可移植备份，换电脑一键恢复；它还能导出 API 密钥（加密后）——**这是它最大的价值，也是最大的风险**。

## 适合谁

- 准备换电脑、重装系统的人（这是最实用的场景）。
- 多台设备之间想同步配置的人（Git / WebDAV）。
- 想从 Claude Code / Cursor / Codex 等 30 个来源导入配置与历史会话的人。

## 解决什么

- 一键备份 / 恢复 / 导出 / 导入完整 DSH 配置（设置、模型与 Provider、已装插件及配置、MCP Servers、Skills、Agent Presets、Workspace/AGENTS.md）。
- profile 本身不随备份迁移，但"档案"页可列表/新建/重命名/删除，**并用某个档案另起独立实例**（真正可用的切换）。
- 通过 Git / WebDAV 跨机同步；密钥默认不同步，勾选"导出密钥"并加密后可随加密快照迁移。
- 内置**配置市场**：浏览并一键安装社区分享的现成配置。
- 从其它 AI Agent 导入配置与历史会话（30 个来源）。

## 风险点

- **含密钥的备份 = 最高敏感文件**：一旦启用"导出密钥"，这个包就是你的账号通行证；必须加密、必须自己保管，别放公开仓库。
- Git/WebDAV 同步默认可能把备份推到远端，配置错了等于把凭据上传。
- 导入别人的"配置市场"预设 = 引入别人的插件组合与可能的口令配置，来源必须可信。
- 跨 Agent 导入会写入其它工具目录，改动前先备份。
- 版本 0.10.0，功能面极大（800 行 README），学习成本不低。

## 替代品

- **手动备份 `$DSH_HOME`**：最原始但完全可控。
- **系统级同步盘**：简单，但会把所有数据一起同步（含会话）。
- **`@michengai/dsh-archive-manager`**：只管会话归档，不碰配置。

## 事实

- 安装 spec：`dsh-config-manager@0.10.0`（npm）· 许可证 MIT · 隔离 profile 安装成功（2026-11-18，31s）
- 来源：[npm](https://www.npmjs.com/package/dsh-config-manager) · [仓库](https://github.com/xiajiajun516/dsh-config-manager)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（启用 Git/WebDAV 同步或配置市场时；纯本地备份不外发）
