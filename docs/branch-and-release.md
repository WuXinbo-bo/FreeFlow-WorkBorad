# 分支维护与发布

[返回首页](../README.md) · [插件构建与安全](assistant-plugin.md) · [包体积维护](desktop-package-size.md)

## 分支职责

| 分支 | 内容 |
| --- | --- |
| `main` | 通用开发基线，保留 Windows 桌面入口与默认发布能力 |
| `mac` | 基于通用逻辑维护的 macOS 路径、权限、窗口交互和打包适配 |
| `win` | Windows 发布线路，与 `main` 共享通用能力，原生行为仍需 Windows 验收 |
| `plugins` | 独立历史的官方插件目录、版本清单、兼容说明及分发规范；不包含用户数据 |

分支名称使用小写。通用修改以提交同步到应用分支，平台修改保留在对应平台，不手工复制整份源码覆盖其他分支。每次同步后运行共享检查，并分别记录目标平台的原生验证状态；在 Mac 运行共享测试不能代表 Windows 原生实测通过。

按 [AGENTS.md](../AGENTS.md) 执行 worktree 状态检查、精准修改、恢复路径验证和跨分支同步。用户文件、依赖目录、安装包、私钥、缓存和本机配置不随应用分支提交。

## 从源码开发

使用 Node.js 24 LTS 或更高版本：

```sh
npm ci
npx playwright install chromium
npm run prepare:desktop-build
npm test
npm run check:release-version
npm run check:desktop-packaging
npm run check:desktop-upgrade
```

`npm ci` 保留完整开发依赖，前端构建需要它们。助手包独立构建；主程序构建不安装助手，也不需要插件私钥。

## 平台打包

```sh
# mac 分支，Apple Silicon 测试包
npm run pack:mac -- --arm64

# mac 分支，生成分发文件
npm run dist:mac -- --arm64

# Windows 上的 win 分支
npm run dist:win
```

产物位于 `release/`。平台打包命令应在相应分支和目标操作系统执行；Windows 构建配置和原生依赖不能在 macOS 精简时被删除。Mac Intel 构建选项存在，但在真机验证前不宣称通过验收。

实际包需补充验证，不能只检查源码：

```sh
node scripts/check-desktop-runtime-assets.js --asar-file /绝对路径/app.asar --platform darwin
node scripts/check-assistant-plugin-packaging.js --asar-file /绝对路径/app.asar
npm run test:packaged-desktop -- /绝对路径/FreeFlow.app
```

Windows 检查归档时使用 `--platform win32`，并在 Windows 实测启动、原生文件操作、镜像能力、升级和卸载。Mac 需检查签名、权限、文件读写、助手安装及重启恢复。

## 应用版本与附件

- 应用标签使用 `v<主.次.修订>`，例如 `v2.0.2`，指向已经验收的源码提交。
- Windows 安装包：`FreeFlow-v<版本>-x64.exe`。
- Windows 免安装版：`FreeFlow-v<版本>-x64-portable.exe`。
- Mac：`FreeFlow-v<版本>-arm64.zip`／`.dmg`；Intel 使用 `x64`，仅发布已验证的架构。
- 每次发布提供校验信息、系统与架构、源码提交、验证范围、签名／公证状态和已知限制。
- 源码版本可领先于正式安装包，README 不把某个本地包描述为已经公开下载。

Windows 更新入口需要安装包，只有便携版或源码附件不能替代它。Mac 测试包的 ad-hoc 签名不等于 Developer ID 签名或 Apple 公证；正式公开发布前应另外完成签名、公证与下载后启动验证。

## 应用与插件更新隔离

GitHub Releases 和标签属于整个仓库，与分支不隔离。主程序 Release 与插件 Release 必须遵守不同的入口约定：

| 内容 | 约定 |
| --- | --- |
| 应用发布标签 | `v<版本>` |
| 助手发布标签 | `plugin-ai-assistant-v<版本>` |
| 官方插件目录 | `plugins` 分支下的 `catalog/v1/freeflow.ai-assistant.json` |
| 插件二进制 | 固定标签对应的 Release 附件 |
| 用户同步目标 | 用户自己的仓库，与上述分发源无关 |

应用更新检查应只接受有效应用标签与匹配平台的附件。插件 Release 创建时显式设置 `make_latest=false`，不能占用应用更新入口；目录不能依赖 `releases/latest`，否则下一个应用发布会改变地址。

稳定目录地址为 [`https://raw.githubusercontent.com/WuXinbo-bo/FreeFlow-WorkBorad/plugins/catalog/v1/freeflow.ai-assistant.json`](https://raw.githubusercontent.com/WuXinbo-bo/FreeFlow-WorkBorad/plugins/catalog/v1/freeflow.ai-assistant.json)。目录负责指向已经上传且通过校验的固定版本附件，不承载用户数据。

## 插件发布顺序

1. 在应用代码分支构建和测试插件，使用宿主已信任公钥对应的私钥签名。私钥只保留在受控环境，不提交或上传。
2. 使用固定 Release 标签地址构建 `.ffplugin`，校验插件 ID、版本、宿主 API、最低应用版本、大小与 SHA-256。
3. 完成共享测试、真实独立进程自检、安装／取消／启停／卸载／重装和历史保留测试。
4. 创建不占用应用 Latest 的插件 Release，上传签名包；实际下载并核对完整性。
5. 包已经可下载后，更新 `plugins` 分支的目录与兼容清单，目录指向该固定安装包 URL。
6. 使用隔离的新用户目录通过公网执行目录读取、下载、安装、自检与重启启用，并测试停用、卸载、重新安装。失败时保留旧版本，恢复目录可回退到前一有效版本。
7. 最后更新对外安装说明。README 的“可在线安装”应以真实 HTTPS 链路测试为依据。

具体包格式、信任边界、构建参数与验证命令见 [助手插件说明](assistant-plugin.md)。现阶段为官方签名插件分发，不把独立进程宣传为安全沙箱，也不宣称已支持任意第三方插件。

## 分支改名与推送

`Mac → mac` 的远端改名需要同时核对默认分支、分支保护、CI、原始文件地址、插件目录和文档引用。GitHub 网页链接可能重定向，raw 地址与工作流引用不能假定自动迁移。先确认小写分支内容完整可取，再调整旧引用；不重写无关远程分支。

推送前检查每个目标分支工作区干净、提交范围可解释，核对远端没有其他人新增提交。以普通快进推送为默认，不使用强制推送覆盖协作者的变更。
