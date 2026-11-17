# dsh-windows-mcp · Windows 桌面自动化

> 一句话结论：这是把"AI 真的能操作你的电脑"落地的那类插件——截屏、点鼠标、敲键盘、读注册表；也正因如此，它是本批里权限最重、最需要读懂授权模型的一个。

## 适合谁

- 需要 Agent 操作没有 API 的老软件、内部系统、桌面客户端的人。
- 做 UI 回归、批量填表、跨应用复制粘贴这类"只能真人点"的活的人。
- 已经在用 CursorTouch/Windows-MCP，想让它直接进 DSH 工具表的人。

## 解决什么

- 通过 DSH 自带的 MCP 客户端桥接入 Windows-MCP（`uvx windows-mcp@0.8.8 serve`），插件自身只是 carrier bundle，不重复打包协议客户端。
- Agent 拿到 18 个工具：截屏（真图片附件）、无障碍树快照（纯文本、不花图片 token）、鼠标点击/移动/滚动、键盘输入/快捷键、等待、网页抓取、批量选择与编辑、剪贴板、进程枚举与启停、系统通知、注册表读写。
- 输入框旁多一颗"AI 控制电脑"胶囊，显示当前注册了几个桌面工具；**授权只属于该会话**，A 会话点亮不会给 B 会话授权。
- 授权不落盘：换会话、换窗口、重启都要重新点亮；想默认开启可在设置里勾"新会话默认授权"。
- 关闭是硬约束：工具从模型工具表消失，调用在分发时被拒绝，无需重启；子代理继承父会话授权。
- `windows_mcp_doctor` 排障工具：工具缺失时告诉你卡在哪。

## 风险点

- **权限极高**：注册表读写、进程启停、键盘输入、剪贴板读写都在同一套授权下。默认关闭是对的，但"默认授权"设置一旦打开，新会话会直接继承。
- **依赖外部子进程**：需要 `uv`/`uvx` 与 Python 环境，`windows-mcp@0.8.8` 由上游发布，插件本身不锁定其行为；上游工具清单变化会影响可用工具。
- **截屏即上传**：Screenshot 把真实图片送进对话，屏幕上有什么就传什么——密码管理器、私聊窗口都可能入镜。
- **不可关闭的工具**：`ControlStatus` 是上游强制保留的，说明"关闭"并不等于所有入口都断。
- 实测环境为 Windows 11 + DSH 0.2.0-rc.2，其他版本/系统未在 README 中声明。
- 版本 0.2.x，仍在快速迭代。

## 替代品

- **官方 `dsh-computer-use` 生态**（`dsh-cua`、`dsh-experimental-computer-use-*`）：走 DSH 自己的 computer-use seam，接口更原生，但目前多为实验件。
- **`dsh-mcp-connector`**：通用 MCP 连接器，自己接任意桌面自动化 MCP，配置自由度高、省一个专用插件。
- **`@wxg-prc-cpg/browser-skill-dsh-plugin`**：只在浏览器里自动化，权限面小得多，适合纯网页任务。

## 事实

- 安装 spec：`dsh-windows-mcp@0.2.11`（由 DSH 插件页/Discover 执行，本市场不代装）
- 许可证 MIT · 周下载量 72,412（npm，2026-11-09 至 11-15）· 最近发布 2026-11-15
- 来源：[npm](https://www.npmjs.com/package/dsh-windows-mcp) · [仓库](https://github.com/helloHub1212/dsh-windows-mcp) · [上游 Windows-MCP](https://github.com/CursorTouch/Windows-MCP)
- 审核日期 2026-11-16 · 结论依据该版本 README 原文
