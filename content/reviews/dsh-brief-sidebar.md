# dsh-brief-sidebar · 会话简报侧栏

> 一句话结论：把"这一轮在做什么、产出了什么文件"摊成右侧栏的「概要」tab；**它是只读展示层，而且要配合 `dsh-better-sidebar` 才真正生效**。

## 适合谁

- 长任务里想一眼看到 todo 三态与进度、以及本轮写了哪些文件的人。
- 用 `dsh-better-sidebar` 的人（它是消费方，没有 better-sidebar 就大幅降级）。
- 嫌 composer 上方那条官方 todo 面板占地方的人（它会把那条遮蔽掉）。

## 解决什么

- 简报由两张列表构成：**todo 列表**（`todos` 投影的进展看板，三态 + 进度摘要）与**产物列表**（`dshSummaryDeliverables` 投影，回合内实时展示写入/修改的文件，codeplan 规划产物用「规划」pill 标注）。
- 遮蔽官方 composer 上方的 todo 面板，让看板成为 todo 的唯一可见载体。
- 纯只读：不编辑、不写回、不做多会话聚合、不复制第三方渲染层。

## 风险点

- **依赖宿主插件**：它是 `dsh-better-sidebar` 的消费方；没有 better-sidebar 激活时，本插件按设计 inert（console 干净、不拖死别人），但也就没有「概要」tab。
- **版本匹配有坑**：README 明确警告"不要在旧宿主上裸用 `latest`——不满足 engines 会被启动预检静默禁用"。支持线是 `>=0.1.0-rc.2 <0.3.0-0`，发布走 `dsh-0.2.0` dist-tag。
- 会遮蔽官方 todo 面板：如果你依赖官方那条，装完会觉得"少了个东西"。
- 只读展示意味着它不能替你改 todo——改还得回到模型或官方界面。

## 替代品

- **官方 composer 上方 todo**：零安装，就在输入框上面。
- **`@michengai/dsh-archive-manager`**：面向历史会话整理，不是本轮简报。
- **`dsh-context`**：看上下文与 token，不是任务与产物。

## 事实

- 安装 spec：`dsh-brief-sidebar@0.9.20`（npm）· 隔离 profile 安装成功（2026-11-18，10s）
- 兼容：`engines.dsh >=0.1.0-rc.2 <0.3.0-0`；README 示例版本 0.6.0 与本机装到的 0.9.20 不同，以 npm 实际发布为准
- 来源：[npm](https://www.npmjs.com/package/dsh-brief-sidebar) · [仓库](https://github.com/drscrewdriver/dsh-brief-sidebar)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🟢 纯本地（只读本机会话投影）
