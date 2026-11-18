# dsh-music-panel · 嵌在 DSH 里的播放器

> 一句话结论：把本地曲库、网易云/QQ/酷狗等在线源、自建 Navidrome 装进同一个播放器，边聊边放；**注意许可证是 AGPL-3.0**，商用前要看清楚。

## 适合谁

- 养鱼/写作时想放背景音乐，又不想切窗口的人。
- 有本地曲库或自建 Navidrome/Subsonic 的人。
- 需要歌词、缓存、音量均衡（EBU R128）、10 段均衡器的人。

## 解决什么

- 本地曲库 + 多在线源（网易云、QQ 音乐、酷狗、波点、汽水）+ Navidrome/Subsonic。
- 歌词显示、缓存、音量均衡、10 段均衡器。
- 原生嵌进 DSH 界面，不另开窗口。

## 风险点

- **许可证是 AGPL-3.0-only**：比 MIT 严格得多，**商用/二次分发**前必须确认义务（本站标了"许可证需确认"）。
- 多在线源意味着走各平台接口，**登录态与 Cookie** 是敏感凭据；接口变动会随时导致某个源失效。
- 在线源涉及版权，下载/缓存内容的合规性由使用者承担。
- 播放器占界面空间，且常驻解码会占 CPU。

## 替代品

- **系统播放器**：零安装、零风险。
- **`dsh-plugin-wallpaper-engine` / `dsh-folia`**：只做视觉氛围，不碰音乐接口。
- **自建 Navidrome + 浏览器**：合规性最好，但要切窗口。

## 事实

- 安装 spec：`dsh-music-panel@0.36.2`（npm）· 许可证 **AGPL-3.0-only** · 隔离 profile 安装成功（2026-11-18，79s）
- 来源：[npm](https://www.npmjs.com/package/dsh-music-panel) · [仓库](https://github.com/Aliboder/dsh-music-panel)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（在线源与登录态；本地曲库模式不联网）
