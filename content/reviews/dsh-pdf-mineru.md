# dsh-pdf-mineru · 用 MinerU 解析 PDF

> 一句话结论：把 PDF 交给 MinerU 解析成结构化内容，Agent 能按证据读正文、公式、表格与插图，还能回原页核对；**用官方云就意味着文档上传**。

## 适合谁

- 要读论文、财报、说明书这类复杂 PDF 的人。
- 需要公式/表格结构（而不只是文字）的场景。
- 有自建 MinerU 服务、想完全本地处理的人。

## 解决什么

- 支持三种后端：MinerU 官方云（v4）、自部署 4.x（V1 API）、3.x 旧版任务 API。
- Agent 分段读取正文、公式、表格与插图；长文档后台解析。
- 关键内容可在本地回看原页核对（PDF 留在本机）。

## 风险点

- **隐私分叉**：用官方云 = 文档上传到第三方；要完全本地就得自建 MinerU（额外运维成本）。
- 要求 **Node ≥ 24.9.0**、DSH `>=0.2.2-rc.1 <0.3.0-0`，环境不满足装不了。
- 解析质量依赖 MinerU 版本，扫描件/手写体误差大。
- 大 PDF 解析耗时与内存占用都高（README 提到长文档后台解析）。

## 替代品

- **官方 `dsh-tool-office`**：能转/读文档，但没有 MinerU 这种公式与版式还原。
- **`dsh-tool-fs` 直接读文本版 PDF**：简单，丢结构。
- **手动转 Markdown**：可控，费时。

## 事实

- 安装 spec：`dsh-pdf-mineru@0.2.3`（npm）· 许可证 MIT · 隔离 profile 安装成功（2026-11-18，134s）
- 来源：[npm](https://www.npmjs.com/package/dsh-pdf-mineru) · [仓库](https://github.com/Yurzi/dsh-pdf-mineru)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（官方云会上传文档；自建服务可本地）
