# FreeFlow Workspace

当前仓库的唯一运行核心已经收口到 [core](D:/FreeFlow-WorkBoard/core)。

根目录现在只保留这些职责：

- 统一入口转发
- 仓库级说明
- 非核心资料与历史文档

如果你要开发、启动、构建或打包 FreeFlow，请只看 `core/`：

- 核心说明：`core/README.md`
- 桌面启动：`start-desktop.cmd` 或 `core/start-desktop.cmd`
- Web 调试：`npm start`
- 构建与打包：全部通过根目录脚本转发到 `core`

## 当前规则

- `core/` 是唯一有效的应用核心代码
- 根目录旧 `public / electron / src / scripts / build / release` 不再作为正式运行基线
- 后续 GitHub 开源、开发调试、正式打包，都应以 `core/` 为准

## 常用命令

```powershell
npm start
npm run start:desktop
npm run build:canvas2d-ui
npm run dist:win
```

以上命令都会统一落到 `core`。
