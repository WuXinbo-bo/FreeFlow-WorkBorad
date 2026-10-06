# FreeFlow 本机使用说明

版本：2.0.2，`mac` 分支，基于提交 `f4ef1ba`。

## 文件位置与启动

本分支工作区位于 `/Users/wxbbo/.codex/worktrees/mac/FreeFlow-WorkBorad`；原始 `main` 工作区仍位于 `/Users/wxbbo/Documents/FreeFlow-WorkBorad`。

在访达中打开该目录，双击 `Start-FreeFlow.command` 启动。它会打开终端并启动 FreeFlow 桌面窗口；使用期间保留该终端。退出后再次双击即可重新启动。没有配置开机自动启动。

`Cmd + Shift + X` 用于切换“完全穿透”模式。该模式会隐藏工作区；如果窗口看起来透明或空白，按此快捷键恢复。

也可在终端执行：

```bash
cd /Users/wxbbo/Documents/FreeFlow-WorkBorad
./Start-FreeFlow.command
```

桌面程序运行时自带本地网页服务。本次启动地址为 `http://127.0.0.1:53127/`。程序退出后该地址会拒绝连接，请重新启动桌面程序。建议直接使用桌面窗口，它支持本机文件功能。

## 环境与数据

- 本机 Apple Silicon ARM64；项目独立 Node.js 24.19.0、npm 11.17.0 位于 `.tools/node`。
- Electron 41.1.1；依赖按 package-lock.json 安装在项目的 node_modules 中。
- 默认画布目录：`/Users/wxbbo/Library/Application Support/FreeFlow/CanvasBoards`。
- 设置、会话及应用数据：`/Users/wxbbo/Library/Application Support/FreeFlow/AppData`。
- 备份时保留整个 `/Users/wxbbo/Library/Application Support/FreeFlow`；源码和用户画布分别存放。
- 运行维护命令请使用 `./scripts/npm-local.sh`，例如 `./scripts/npm-local.sh run prepare:desktop-build`。直接使用系统 npm 不保证使用本次安装的 Node 版本。
- 直接运行 `npm start` 是另一种网页启动方式，默认数据目录不同；日常使用上述启动脚本即可。

## 本机适配

替换 Windows 专用启动命令；启动时清除 ELECTRON_RUN_AS_NODE；添加 Mac 文件剪贴板读写；修复 POSIX 绝对路径丢失根目录的问题，并验证 Windows 盘符和 UNC 路径仍可用。新增 Mac LibreOffice 标准安装位置识别。

首次检查时产生的相对路径测试数据保存在 AppData/Recovery/first-launch-relative-path，修复前设置备份为 AppData/ui-settings.before-macos-path-fix.json。

## 验证与边界

已通过桌面构建、依赖完整性检查、Mac 剪贴板转换、跨平台文件路径、原子保存与失败恢复、桌面 IPC 安全、窗口状态恢复、后端安全、设置事务与回滚测试。已检查实际桌面主界面及教程画布渲染，本地 HTTP 服务返回 200。穿透模式隐藏/恢复已实际检查。

额外的 Playwright 启动生命周期自动化测试因未安装其专用 Chromium 浏览器而未运行；不计入通过项。

AI 助手尚未完成提供方配置：界面检测到多个 Codex CLI，需要在“前往 AI 设置”中选择 CLI 和模型；若使用云端提供方，按其要求配置账号或 API Key。本次没有发送 AI 请求。

Windows 专用的外部应用窗口嵌入在 Mac 上不可用。LibreOffice 尚未安装，依赖它的文档高保真转换未验证。当前是源码开发运行方式，尚未打包或签名为独立 macOS 安装包。

本分支包含 macOS 适配修改；原 `main` 分支未被修改。当前构建未签名或公证，首次打开时可能需要在 macOS 安全设置中允许应用运行。
