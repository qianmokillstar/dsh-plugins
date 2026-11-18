# ds-harness-remote · 端到端加密的远程接入

> 一句话结论：给授权设备开另一扇窗看同一台 Harness，连接是端到端加密的；它还能让 Agent 远程开会话、传文件，所以权限边界要自己想清楚。

## 适合谁

- 电脑在公司/家里开着，想用手机或另一台机器接着用同一套工作区的人。
- 需要 Agent 在远端主机上建会话、跑任务、回传结果的人（它有 `remote_*` 系列工具）。
- 用 DSH Go 这类第三方安卓客户端的人。

## 解决什么

- Harness 继续跑在你的工作机上（工作区、工具、权限控制都保留），Remote 给授权设备开另一个窗口。
- Agent 工具集：`remote_list_hosts` / `remote_list_workspaces` / `remote_list_sessions` / `remote_read_session` / `remote_create_session` / `remote_send_message` / `remote_wait_sessions` / `remote_interrupt_session` / `remote_upload_file` / `remote_download_file` / `remote_get_operation`。
- 接受回执机制：同一 `operationId` 重复提交返回同一回执，避免重复执行；`accepted` 只代表排队，不代表完成。
- 文件传输：局域网/直连 P2P 单文件 1 GiB，否则 20 MiB；下载上限 50 MiB。

## 风险点

- **授权设备 = 你的第二把钥匙**：能读会话、发消息、传文件；设备丢失或被借用，等于工作机被别人看。
- 端到端加密保护传输，但**授权与身份绑定依赖 Remote 账号体系**，账号失守则一切失守。
- 文件上传会写进工作区根目录（不覆盖已有文件），Agent 误操作仍有落盘风险。
- `remote_interrupt_session` 只中断执行，**不会撤销已做的修改**。
- 需要官方 `tools` 服务才注册这些工具，profile 配不对会"装了没工具"。

## 替代品

- **`dsh-mobile-plugin`**：偏向手机看会话、批权限，工具面没这么深。
- **`dsh-remote`（SSH）**：面向远程开发工作区，不是"远程看会话"。
- **Tailscale + 自己开 DSH Web**：更底层，但没端到端封装与回执机制。

## 事实

- 安装 spec：`ds-harness-remote@0.6.5`（npm）· 隔离 profile 安装成功（2026-11-18）· 周下载 30,117
- 来源：[npm](https://www.npmjs.com/package/ds-harness-remote) · [仓库](https://github.com/liguobao/ds-harness-remote)
- 审核日期 2026-11-18 · 依据该版本 README 原文
- 隐私：🔴 需云端（连接经 Remote 账号体系与加密通道；授权设备可读写会话）
