# meow-memory · 七层 SQLite 记忆

> 一句话结论：把记忆拆成 soul/user/project/fact/lesson/topic/rules 七层，首轮注入 + 每条消息关键词命中两条；工程化程度最高，代价是配置与理解成本。

## 适合谁

- 想要"角色人格(soul)"与"用户偏好(user)"分开存的人（养鱼尤其吃这个）。
- 长项目 + 长期陪伴混用，需要按项目锚定记忆的人。
- 在意缓存命中率、不希望记忆破坏 KV cache 的人（它把静态段注册为常量 section）。

## 解决什么

- **七层记忆**：soul / user / project / fact / lesson / topic / rules，每层一张 SQLite 表。
- **首轮注入**：第一条用户消息前注入 soul / user / 设计原则 / 记忆指南，作为独立快照消息，**不重写用户的 prompt**。
- **逐条命中**：从第二条消息起，按关键词检索 fact/lesson/rules/topic，注入 top-2。
- **压缩后重新注入**：会话被压缩后，下一轮自动补回长期快照与相关记忆。
- **Dream**：窗口闲置 ≥3 小时后可触发整合（避开 API 高峰时段），也能 `/dream` 立即整合。
- **反思**：单任务连续 ≥7 步工具调用后，问模型"有没有值得记的"。
- **外部记忆信任门**：克隆来的工作区里未在本机创建的 `.dsh-meow` 默认暂停，`/meow-trust` 才启用。

## 风险点

- **配置门槛高**：七层 + 锚定 + 信任门 + Dream 时段，新手第一次用容易只看到"没反应"。
- README 默认语言是葡萄牙语（v0.31.0 表述），中文用户读文档有额外成本；版本声明与实际（0.33.x）略有出入。
- 需要 `node:sqlite`，对 Node 版本有隐性要求。
- Dream 会在后台调模型（闲置时），**费用与内容外发**都要心里有数。

## 替代品

- **`dsh-fish-memory`**：更轻、会淡忘，命中即注入。
- **`dsh-prime-memory`**：L0–L3 蒸馏自动召回。
- **`dsh-mnemon`**：可见回合记忆栏，插件化来源/策略。

## 事实

- 安装 spec：`meow-memory@0.33.0`（npm）· 许可证 MIT · 隔离 profile 安装成功（2026-11-18）
- 来源：[npm](https://www.npmjs.com/package/meow-memory) · [仓库](https://github.com/Phant0Meow/dsh-meow-memory)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（检索与抽取依赖模型调用；Dream 后台也会调模型）
