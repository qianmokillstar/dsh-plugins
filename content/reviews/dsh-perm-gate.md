# dsh-perm-gate · 权限门（fail-closed）

> 一句话结论：在官方审批之上加一层**确定性优先、默认拒绝**的门：凭据材料、受保护路径改写、危险 shell 一律硬拒，且不被任何放行规则或人工覆盖——这是目前最"较真"的权限插件。

## 适合谁

- 让 Agent 长时间自己跑、担心它碰 SSH 私钥 / `.env` / 云凭据的人。
- 需要"可审计"的人：每次裁决都写事件、带 callId、理由与记录一致。
- 团队里要统一权限策略、又不想完全关掉审批的人。

## 解决什么

- 固定优先级链裁决每个工具调用：**P0 硬拒**（凭据/受保护路径/危险 shell）→ **P1 会话放行**（精确 grant，带 TTL 与 maxUses）→ **P2 静态规则链**（黑名单优先）→ **P3 可选 LLM 分类器**（默认关）→ **P4 官方审批**。
- 严格 fail-closed：P0 永不因 grant / 规则 / 分类器 / 人工而放行。
- 命令匹配基于 **argv 分解**（不是裸字符串），能下钻 `sh -c`、识别管道/重定向、`rm -rf` 递归强制。
- 七类凭据（ssh / cloud / package / gitcreds / env / cli / db）各有 deny/ask/readonly/readwrite 四档。
- 「自动审查」独立档位：前端只有一个开关，后台四个策略可组合，仍对 P0 fail-closed。

## 风险点

- **版本线复杂**：README 里写"版本 2.4.1"，而 npm 上最新是 **5.5.4**；两条线按 DSH 主线/legacy 分支分别维护，装之前确认你拿到的是哪条。
- **多语言有坑**：自带 `ja`/`ko` 字典，但官方 DSH 的 `LocaleRuntime` 只暴露 `zh`/`en`，选日语/韩语会报 `locale "ja" is not registered`——要用必须换 fork 重建。
- 规则配错会**误杀正常操作**；虽然 fail-closed 安全，但会打断工作流。
- 与官方审批、其他权限插件叠加时，行为取决于优先级实现，排查链变长。
- 它是"门"不是沙箱：不隔离进程、不设文件权限。

## 替代品

- **`cc-safety-net`**：更轻的命令拦截，没有 P0-P4 体系。
- **官方审批 + 沙箱**：底线能力，够用就别加层。
- **只开只读权限**：最省心。

## 事实

- 安装 spec：`dsh-perm-gate@5.5.4`（npm）· 隔离 profile 安装成功（2026-11-18，9s）
- 来源：[npm](https://www.npmjs.com/package/dsh-perm-gate) · [仓库](https://github.com/kenryu42/dsh-perm-gate)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🟢 纯本地（裁决在本机；P3 分类器默认关闭）
