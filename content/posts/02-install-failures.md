# 装一个插件，把我整个 DSH 搞坏了

（面向"正在被安装问题折磨"的人。适合发技术群、V2EX、掘金。）

---

事情是这样：我想试个记忆插件，装完之后——**什么都装不了了**。

不是那个插件坏了，是整个 profile 被我搞坏了。这篇把三个坑写清楚，你大概率会遇到其中一个。

## 坑一：一个坏包，让之后所有安装都失败

我装 `dsh-purge` 时报错：

```
ERR_PNPM_TARBALL_EXTRACT  Failed to add tarball from ".../dsh-purge-0.0.0-stage.tgz":
Unexpected end of TAR archive at offset 2560
```

然后我改去装别的插件，报错**还是指向那个 purge 的 tarball**。

原因是：这个截断的包被写进 profile 的 `pnpm-lock.yaml`，之后每次 `add` 都会重试它，你真正要装的那个根本没轮到。

**修法**：先把坏包 remove 掉；不行就删该 profile 的 `node_modules` 和 lockfile；最省事是换个干净 profile。

## 坑二：装上了，但没生效

后来我又遇到：

```
+ @tencent-connect/dsh-qqbot 0.5.5      ← 装上了
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: protobufjs
Command failed with exit code 1         ← 但报失败
```

pnpm 11 默认不许依赖执行构建脚本（安全策略）。结果是：包进了 `node_modules`、进了 `dependencies`，**但没进 `dsh.profile.bundles`**，所以不会启动。

我试了三种"配置白名单"的写法，**全部无效**：

1. `package.json` 的 `pnpm.onlyBuiltDependencies` → pnpm 11 直接说这个字段已废弃
2. `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` → `pnpm config get` 能读到，安装照样被拦
3. `--config.onlyBuiltDependencies=protobufjs` → 同样被拦

**能用的只有交互式 `pnpm approve-builds`**，它要你逐个确认。

## 坑三：手改配置文件，把 BOM 带进去了

排查过程中我用 PowerShell 改了 profile 的 `package.json`，结果：

```
SyntaxError: Unexpected token '﻿', "﻿{..." is not valid JSON
```

PowerShell 的 `Set-Content -Encoding UTF8` 会写 BOM，而 DSH 的 JSON 解析不接受 BOM。**整个 profile 当场装不了任何插件。**

## 三条纪律

1. **一次只装一个**，出问题才知道是谁
2. **手改 profile 配置前先备份**，并保存为 UTF-8 无 BOM
3. **看到报错别急着判断"插件坏了"**——先看报错里提到的包名是不是你正在装的那个

---

我把这些坑整理成了一个**可搜索的报错诊断器**（输入 `tarball` / `IGNORED_BUILDS` / `装了没反应` 就能查到原因和修法）：
**qianmokillstar.github.io/dsh-plugins/fix.html**

非官方、无广告，每条都带实测证据。查不到可以在讨论区告诉我。
