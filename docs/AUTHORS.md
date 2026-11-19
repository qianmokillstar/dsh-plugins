# 作者直联清单与模板

> 目的：让插件作者**自己**把链接带出去。作者转发一次，比我们发十次有效。
> 原则：只提**有信息量**的反馈，不为发链接而发链接。

## 优先联系（按"README 有可改进处 + 我们的核验写得细"排序）

| 插件 | 仓库 | 我们核验里值得作者知道的点 |
|---|---|---|
| `dsh-liketavern` | github.com/Amakurai/dsh-liketavern | 不在 npm 时用户容易误判"装不上"；可在 README 顶部加一句 GitHub 源安装 |
| `@tencent-connect/dsh-qqbot` | npm 页面 | pnpm 11 拦 protobufjs 构建脚本 → 用户会以为插件坏了 |
| `@michengai/dsh-im-connect` | github.com/MichengAI/dsh-im-connect | 同上，建议 README 加"半装"排查 |
| `dsh-perm-gate` | github.com/kenryu42/dsh-perm-gate | README 写"版本 2.4.1"但 npm 最新 5.5.4，用户会困惑 |
| `dsh-bili-scroll` | github.com/c1overzz/dsh-bili-scroll | 版本不满足会静默跳过 → 建议启动时打一行日志 |
| `dsh-plugin-memory` | github.com/LittleBlackTong/dsh-plugin-memory | 0.19.x 的会话注册事故，建议 README 顶部加迁移提示 |
| `meow-memory` | github.com/Phant0Meow/dsh-meow-memory | README 默认葡萄牙语，建议把中文/英文放首位 |
| `dsh-folia` | github.com/elysia395/dsh-folia | README 徽章写 `dsh-plugin-folia`，实际安装名是 `dsh-folia` |
| `dsh-see-now` | npm 页面 | 建议在隐私段落更醒目地写"屏幕内容会进模型" |
| `dsh-onebot-qq` | github.com/dsh-external/dsh-onebot | 建议明确"这是通道不是人格"一句 |

## 模板 A：GitHub Issue（推荐，公开、可被搜索到）

标题：`README 补充建议：pnpm 11 会拦截 protobufjs 构建脚本`

```
你好，我在核验你的插件时遇到一个容易让用户误判为"插件坏了"的情况，建议补进 README：

现象：`dsh plugin add @tencent-connect/dsh-qqbot` 输出 `+ 包名 版本`，但最后以
ERR_PNPM_IGNORED_BUILDS（Ignored build scripts: protobufjs）失败退出。
实际状态是：包已落地 node_modules、写入 dependencies，但没进 dsh.profile.bundles，所以不会启动。

我试过三种配置方式（package.json 的 pnpm 字段、pnpm-workspace.yaml 的 onlyBuiltDependencies、
--config 传参），在 pnpm 11.28.5 上都被拦；只有交互式 `pnpm approve-builds` 有效。

细节与复现：https://qianmokillstar.github.io/dsh-plugins/fix.html
（非官方第三方站点，只做人工核验；如不希望被收录，说一声我们立刻下架。）

如果你觉得值得，可以在 README 加一句"pnpm 11 需 approve-builds"。
```

## 模板 B：私信 / 邮件（更短）

```
你好，我是非官方第三方 DSH 插件核验站的维护者（不是官方）。

核验你的插件时发现一个 README 没提到、但用户很可能踩到的点：
<一句话现象 + 一句原因>

记录在这里：<对应页面链接>（含版本、DSH 版本、实测结果）

如果记录有误请指出；不想被收录也可以直接说，我们下架。
另外如果你愿意，可以把核验徽章贴进 README（一行 markdown，自动显示可安装性与版本状态）：
https://qianmokillstar.github.io/dsh-plugins/badges.html
徽章不代表背书，只表示「这个版本装得起来」；版本更新后徽章会自动变成提示色，不会一直是绿的。
```

## 三条纪律

1. **一次只发一条**，说清一个点，不要群发模板
2. **先说问题、后提链接**；链接是证据不是目的
3. 作者回复后：改记录、致谢；作者要求下架 → 立即下架并在提交记录留痕
