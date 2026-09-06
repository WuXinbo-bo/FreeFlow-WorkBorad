# FreeFlow v2.0.1 发布说明

## 版本与更新检测

- 当前正式版本：`v2.0.1`。
- GitHub 仓库：`WuXinbo-bo/FreeFlow-WorkBorad`。
- 正式标签：`v2.0.1`，Release 不标记为草稿或预发布后才进入最新正式版本检测。
- 检测接口：`https://api.github.com/repos/WuXinbo-bo/FreeFlow-WorkBorad/releases/latest`。
- 安装包：`FreeFlow-v2.0.1-x64.exe`。
- 便携版：`FreeFlow-v2.0.1-x64-portable.exe`。
- 校验文件：`SHA256SUMS.txt`。

更新检测优先匹配安装包的准确名称。必须在发布 Release 前上传安装包，不能只上传便携版或源码。应用提供下载入口，用户运行新版安装程序完成覆盖升级。

## 打包准备

1. 使用 Node.js 24，运行 `npm ci` 并安装 Playwright Chromium。
2. 更新 package、锁文件、欢迎版本、教程版本、“关于画布”、示例画布及本文件中的发布版本。
3. 运行 `npm run prepare:desktop-build` 和 `npm test`。
4. 运行版本、升级和打包检查。
5. 运行 `npm run dist:win`，生成 NSIS 安装版和便携版。
6. 实测打包程序的启动、端口冲突避让、文件保存、设置版本与更新检测；生成校验文件。
7. 先保留旧远程 main 分支，再推送源码 main 和对应标签。上传产物后发布正式 Release。

## 安装与数据

产品名保持 `FreeFlow`，应用标识保持 `com.wuxinbo.freeflow`，默认安装目录为 `%LOCALAPPDATA%\Programs\FreeFlow`。

覆盖安装保持原用户目录。业务数据默认位于 `%USERPROFILE%\FreeFlow`，画布也可位于用户指定的目录。卸载程序不删除这些业务数据。

教程内容更新先备份旧教程，再生成新版。相同模板的重复打开不会覆盖练习内容。默认监听 `127.0.0.1:53127`，端口冲突时由系统分配可用端口。

## 打包边界

包内包含运行代码、前端资源和官方教程示例。个人 `.env`、工作区缓存、凭据、历史会话、开发工具配置和临时诊断文件不应进入发布包。

安装器的产品标识和用户数据策略由 `installer.nsh` 与 `package.json` 保持一致。提交前执行 `check:desktop-packaging`，确认额外资源仅包含官方示例。

