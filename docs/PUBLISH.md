# 上线流程（B 方案：GitHub 自动更新 + Pages）

目标：站点有一个公网地址，之后每天自动采集、自动重建、自动部署，不需要你的电脑开机。

## 前提：这台机器没有 git

已确认：`git` 未安装，`winget` 可用。任选一种方式装：

**方式 1 · GitHub Desktop（推荐，无需管理员权限）**

```powershell
winget install --id GitHub.GitHubDesktop -e --accept-package-agreements --accept-source-agreements
```

它自带 git，图形界面处理登录与推送，不会因为认证卡住。

**方式 2 · Git for Windows（装完用命令行）**

```powershell
winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
```

可能弹 UAC 提权窗口，需要你点"是"。

---

## 第一步：建公开仓库

GitHub → New repository：

| 字段 | 填什么 |
|---|---|
| Repository name | `dsh-plugins`（或你喜欢的短名） |
| Visibility | **Public**（私有仓库的 Pages 要付费） |
| Initialize with README / .gitignore / license | **全部不勾**（本地已有文件，勾了会冲突） |

## 第二步：把本地目录变成仓库并推上去

### 用 GitHub Desktop

1. 打开 GitHub Desktop → Sign in 登录你的账号
2. `File` → `Add local repository` → 选 `E:\插件市场deepseek`
3. 提示"不是 git 仓库"时点 **create a repository**
4. 左边 Commit 面板填一句 summary（如 `init`）→ `Commit to main`
5. 右上 `Publish repository` → **取消勾选 "Keep this code private"** → Publish

### 或用命令行

```powershell
cd E:\插件市场deepseek
git init
git add .
git commit -m "init: DSH plugin site"
git branch -M main
git remote add origin https://github.com/<你的账号>/dsh-plugins.git
git push -u origin main
```

`data/readmes/` 已被 `.gitignore` 排除，不会推上去（第三方 README 原文只作本地核对）。

## 第三步：允许 Actions 写数据

仓库 → `Settings` → `Actions` → `General` → 最下面 `Workflow permissions`：

- 选 **Read and write permissions**
- 保存

否则每日采集能跑，但无法把更新后的数据提交回仓库。

## 第四步：开启 Pages

仓库 → `Settings` → `Pages`：

- `Source` 选 **GitHub Actions**
- 不用选主题、不用手动部署

## 第五步：确认两个 workflow 跑通

仓库 → `Actions` 标签页，应看到两个：

| workflow | 作用 | 触发 |
|---|---|---|
| `deploy-site` | 把 `site/` 发布到 Pages | 推到 main 时 |
| `harvest` | 每天采集 npm + GitHub、重建、提交 | 每天 08:17（可手动 Run） |

先等 `deploy-site` 变绿，再手动跑一次 `harvest` 验证自动采集。

## 第六步：拿到地址，告诉维护者

- 站点：`https://<账号>.github.io/<仓库>/`
- 索引：`https://<账号>.github.io/<仓库>/index.json`

把这两个地址发过来，接下来由维护者完成：改 DSH 索引源、验证公网索引可读、把提交入口换成真 Issue。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| Pages 打开 404 | Source 没设成 GitHub Actions | 重设后重跑 `deploy-site` |
| Actions 提交失败 | 第三步没开读写权限 | 开后重跑 |
| 站点样式丢失 | 只部署了 index.html | 确认 workflow 里 `path: site` |
| 索引读不到 | 用了重定向地址 | 必须用最终地址，DSH 拒绝重定向 |
| 我想停掉自动更新 | 不用了 | 仓库 Actions 里 Disable workflow 即可 |
