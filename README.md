# DSH 插件站（非官方 · 第三方）

[![非官方第三方](https://img.shields.io/badge/%E9%9D%9E%E5%AE%98%E6%96%B9-%E7%AC%AC%E4%B8%89%E6%96%B9-f0b357)](https://qianmokillstar.github.io/dsh-plugins/rules.html)
[![人工核验](https://img.shields.io/badge/%E4%BA%BA%E5%B7%A5%E6%A0%B8%E9%AA%8C-32%20%E6%9D%A1-2f6fdd)](https://qianmokillstar.github.io/dsh-plugins/verifications.html)
[![场景施工图](https://img.shields.io/badge/%E5%9C%BA%E6%99%AF%E6%96%BD%E5%B7%A5%E5%9B%BE-15%20%E4%B8%AA-1f7a4d)](https://qianmokillstar.github.io/dsh-plugins/scenes.html)
[![养鱼专项](https://img.shields.io/badge/%E5%85%BB%E9%B1%BC%E4%B8%93%E9%A1%B9-6%20%E4%B8%AA-7a3ef3)](https://qianmokillstar.github.io/dsh-plugins/scenes.html#rp-memory)
[![核验方法](https://img.shields.io/badge/%E6%A0%B8%E9%AA%8C%E6%96%B9%E6%B3%95-%E5%8F%AF%E5%A4%8D%E7%8E%B0-8a8f98)](https://qianmokillstar.github.io/dsh-plugins/method.html)

> 我维护一个**非官方第三方** DSH 插件索引站，**专攻养鱼 / 角色扮演 / 陪伴向插件**：防失忆、防出戏、防隐私泄露。
> 人工真机跑过一批插件，记录安装结果、权限风险、隐私去向和替代品。
> **与 DeepSeek / DSH 官方无关联、无授权、无背书。**

站点：<https://qianmokillstar.github.io/dsh-plugins/>

不做"又一个插件目录"：dsh-market 这类站点解决"找得到"，官方市场解决"装得安全"，本站只做**"选得对"**——按场景给施工图、给带日期的核验记录、给作者没说但用户要知道的坑。

## 养鱼四大金刚

| 场景 | 要解决的问题 | 入口 |
|---|---|---|
| 长期记忆 | 聊着聊着 AI 忘了前情 | [施工图](https://qianmokillstar.github.io/dsh-plugins/scenes.html) |
| 人设防崩 | 设定被冲淡、语气跑偏 | [施工图](https://qianmokillstar.github.io/dsh-plugins/scenes.html) |
| 上下文瘦身 | 聊到卡顿、上下文爆掉 | [施工图](https://qianmokillstar.github.io/dsh-plugins/scenes.html) |
| 隐私排雷 | 私密聊天被同步到云端 | [核验记录](https://qianmokillstar.github.io/dsh-plugins/verifications.html) |

隐私分级：🟢 纯本地 / 🔴 需云端 / ⚪ 未确认 —— 读 README 与权限描述后的初次判断，未做抓包验证。

不卖排名、不接赞助、不收费收录。

## 给外部工具的接口

| 文件 | 内容 | 用途 |
|---|---|---|
| [`/index.json`](https://qianmokillstar.github.io/dsh-plugins/index.json) | DSH 市场索引（format 1，129 条可安装） | 可直接加入 DSH 的 `设置 → 插件 → 发现` 索引源 |
| [`/verifications.json`](https://qianmokillstar.github.io/dsh-plugins/verifications.json) | 结构化核验记录（schema `dsh-market-verification/1`） | 每条含插件名、版本、核验日期、DSH 版本、许可证、周下载量、风险等级、四问摘要、安装/启动结果 |
| [`/sitemap.xml`](https://qianmokillstar.github.io/dsh-plugins/sitemap.xml) | 全站地址 | 搜索引擎收录 |

核验记录只对标注的**日期 + 版本 + DSH 版本**成立；安装成功不代表运行正确，也不构成安全审计。

## 现状

| 指标 | 数值 |
|---|---|
| 参考目录（可安装 + 已核实） | 313 |
| 已核实（有包声明 / bundle 补丁） | 293 |
| 人工短评（适合谁 / 解决什么 / 风险点 / 替代品） | 43 |
| 安装实测（隔离 profile 真装） | 43 / 43 |
| 启动核验（最小 profile 启动） | 1 已加载 / 2 待激活（缺 webServer）/ 6 组合无报错 / 1 不参与组合 |
| 场景施工图 | 15（其中养鱼专项 6） |
| 周报 | 1 期（按快照对比，可复核） |
| GitHub 仓库检查 / 排除噪声 | 400 / 164 |

## 站点有什么

| 页面 | 内容 |
|---|---|
| `index.html` | 搜索、分类筛选、5 种排序（推荐 / star / 最近更新 / 周下载 / 名称）、卡片带 star、更新时间、核实状态、安装 spec 一键复制 |
| `scenes.html` | **场景施工图**：远程开发 / 成本监控 / 记忆管理，给出装哪几个、按什么顺序、哪些可跳过、权限与冲突注意 |
| `verifications.html` | **核验记录**：每条带日期、DSH 版本、依据、结论；明确区分"文档核验"与"安装实测" |
| `p/<slug>.html` | 详情页。有短评的显示四问判断；没有的明确标"未核实"并写清缺什么 |
| `changelog.html` | 最近 7 天有推送的插件 + 本期核实进度 |
| `submit.html` | 提交插件（无后端：生成可直接粘贴的提交内容） |
| `rules.html` | 收录规则、判断标准、排序与收费说明、命名与视觉自查 |
| `takedown.html` | 下架与侵权投诉：先下架再核实，24 小时内响应 |
| `disclaimer.html` | 评测免责：主观判断、不当担保、只对核验当日的版本成立 |
| `privacy.html` | 隐私与数据：不埋统计、不用 cookie、不引第三方资源 |
| `index.json` | DSH 市场索引（format 1），可被 DSH 的 Discover 直接读取 |

## 宣传口径

对外统一说法（可直接复制）：

> 我维护一个**非官方第三方** DSH 插件索引站，人工读过 README 并记录安装可行性，与 DeepSeek / DSH 官方无关联。

**禁用词**：官方插件站、合作目录、官方推荐、唯一指定索引、获官方认可、被官方收录。

遇到别人误称"官方站"，站长主动纠正——这比事后补声明更有说服力。

## 核心指标（不看收录总数）

看这四个：场景施工图数量、带日期的核验记录数、有真实判断的插件数、投诉响应时长。

收录总数只是"参考目录"，不代表质量，也不参与首页主指标。

## 快速开始

```powershell
# 日常更新：采集 npm + GitHub → 快照 → 重建索引与站点 → 起服务
E:\插件市场deepseek\scripts\refresh.cmd

# 只看站点，不重新采集
E:\插件市场deepseek\scripts\start-market.cmd
```

打开 `http://127.0.0.1:51888/`。已经在跑时脚本只复用、不会起第二个进程。

DSH 侧：`设置 → 插件 → 发现` 的索引源是本机地址 `http://127.0.0.1:51888/index.json`。

## 数据怎么来的

| 数据 | 来源 | 脚本 |
|---|---|---|
| 插件是否可安装 | npm registry 的 `package.json#dsh.bundle.patch` | `harvest.mjs` |
| 周下载量、许可证、版本 | npm registry + downloads API | `harvest.mjs` |
| star、最近推送、仓库 | GitHub Search API（`topic:dsh-plugin`） | `harvest-github.mjs` |
| 插件是否属实 | 仓库根 `package.json` 的 `dsh` 字段 / `cordis.patch.yml` / README 安装特征 | `harvest-github.mjs` |
| 判断信息 | 人工读 README + 实测 | `content/reviews/*.md` |

**为什么必须过滤**：`topic:dsh-plugin` 目前有 32,055 个仓库，抓前 400 个实测发现**164 个是无关项目**（图床、视频下载、逆向工具把 topic 当流量标签）。所以"抓 topic 就有清单"不成立，必须验证每个仓库是不是真的插件。

## 目录结构

```
E:\插件市场deepseek\
├─ data\
│  ├─ catalog.json        # npm 侧：128 个可安装 + 下载量/许可证/仓库
│  ├─ github.json         # GitHub 侧：236 个插件 + 164 个被排除的噪声（含原因）
│  ├─ curated.json        # 人工判断：分类、风险、推荐序
│  ├─ history\            # 每日快照（周报与"本周变化"的基线）
│  └─ readmes\            # 待审 README 原文（仅本地核对，不入库）
├─ content\
│  ├─ reviews\            # 10 篇四问短评
│  └─ weekly\             # 周报草稿
├─ market\index.json      # DSH 市场索引（format 1）
├─ site\                  # 静态站产物（首页 / 详情 / 更新日志 / 提交 / 索引副本）
├─ server\serve.mjs       # 零依赖静态服务（127.0.0.1:51888，带每日自更新）
├─ deploy\                # GitHub Actions：每日采集 / Pages 部署
├─ scripts\               # 采集、合并、构建、校验、启动
└─ docs\                  # 路线图 / 收录标准 / 发布 / 版权隐私
```

## 加一条判断

1. 读插件 README，必要时真装一次。
2. 按四问写进 `content/reviews/<包名>.md`，并在 `data/curated.json` 里登记分类、风险等级、推荐序。
3. 跑 `refresh.cmd fast`（不联网，3 秒）重建站点。

四问和风险分级的口径见 `docs/CRITERIA.md`。

## 已知限制（比优点更该先看）

- **兼容状态没实测**：全是包的声明值（`engines.dsh`），页面里明写"未实测"。试装记录是下一步最该补的东西。
- **只有 10 条判断**：其余 300 条只有元数据，详情页明确标注"未核实"。
- **采集是窗口采样**：GitHub 只抓了 star 最高的 400 个仓库；npm 抓的是关键词搜索去重池（约 1,057）里下载量前 140。
- **本地服务需要手动起**：电脑重启后第一次要跑 `refresh.cmd`；服务未启动时 Discover 会报读取失败。
- **不做安全审计**：风险评估是读 README 后的判断，不是代码审计。

## 文档

- [路线图（四周计划与三条硬规则）](docs/ROADMAP.md)
- [收录与判断标准](docs/CRITERIA.md)
- [发布：本机 → 公网](docs/PUBLISH.md)
- [版权与隐私边界](docs/COMPLIANCE.md)
