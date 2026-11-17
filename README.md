# DSH 插件站

一个**能快速判断"该装哪个"**的 DeepSeek Harness 插件站：搜一个插件，能立刻看到它能不能装、适合谁、有什么坑、有没有替代。

不追求收录最多——追求判断信息。不收钱、不卖排名、不接赞助。

## 现状

| 指标 | 数值 |
|---|---|
| 收录插件 | 310 |
| 已核实（有包声明 / bundle 补丁） | 290 |
| 未核实（仅 README 线索） | 20 |
| 人工短评（适合谁 / 解决什么 / 风险点 / 替代品） | 10 |
| GitHub 仓库检查 / 排除噪声 | 400 / 164 |
| npm 侧确认可安装 | 128 |

## 站点有什么

| 页面 | 内容 |
|---|---|
| `index.html` | 搜索（插件名 / 功能 / 作者）、12 个分类筛选、5 种排序（推荐 / star / 最近更新 / 周下载 / 名称）、卡片带 star、更新时间、核实状态、安装 spec 一键复制 |
| `p/<slug>.html` | 详情页。有短评的显示四问判断；没有的明确标"未核实"并写清缺什么 |
| `changelog.html` | 最近 7 天有推送的插件 + 本期核实进度 |
| `submit.html` | 提交插件（无后端：生成一段可直接粘贴的提交内容） |
| `index.json` | DSH 市场索引（format 1），可被 DSH 的 Discover 直接读取 |

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
