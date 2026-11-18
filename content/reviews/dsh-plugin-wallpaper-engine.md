# dsh-plugin-wallpaper-engine · 把壁纸引擎搬进对话界面

> 一句话结论：把本机 Wallpaper Engine 的 Scene、Web、视频壁纸做成对话背景，还不注册工具、不注入提示词——**不花模型 token**。养鱼氛围感最省成本的一招。

## 适合谁

- 想让角色扮演界面有"场景感"的人（雨夜、咖啡馆、星空）。
- 已在 Wallpaper Engine 上买了壁纸、不想只为聊天再买一套素材的人。
- 在意性能与 token 的人：它明确说明不向 agent 注册工具、不注入提示文本。

## 解决什么

- 把本机 Wallpaper Engine 的 Scene / Web / 视频壁纸带进 DSH 对话界面。
- 配液态玻璃、字体、吉祥物与**可分享的外观预设**。
- 纯外观层：不改变会话内容、不影响模型行为、不增加 token 开销。

## 风险点

- **显示层插件也有性能代价**：Scene/Web 壁纸是实时渲染，低配机器或长时间开会有明显 GPU/CPU 占用。
- 壁纸来源是你本机的 Wallpaper Engine 资源，涉及第三方素材授权，**分享预设时注意素材版权**。
- 版本 1.4.x 迭代快；README 提到正式主仓在 elysia395/dsh-wallpaper-engine，npm 包名不同，升级时认准包名。
- 纯外观插件容易"装了就忘"，出问题时先怀疑它（尤其是界面卡顿）。

## 替代品

- **`dsh-dream-skin`**：8 套预设皮肤 + 壁纸 + 强调色，纯 token 实现、更轻。
- **`dsh-folia`**：另一种壁纸引擎路线（视频/网页/开机动画）。
- **内置深色主题**：零风险、零性能代价。

## 事实

- 安装 spec：`dsh-plugin-wallpaper-engine@1.4.2`（npm）· 许可证 MIT · 隔离 profile 安装成功（2026-11-18）
- 来源：[npm](https://www.npmjs.com/package/dsh-plugin-wallpaper-engine) · [上游仓库](https://github.com/elysia395/dsh-wallpaper-engine)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🟢 纯本地（读取本机壁纸资源，不上传会话内容）
