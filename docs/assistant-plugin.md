# AI 助手独立组件：开发、验证与发布

## 产品边界

FreeFlow 主程序内置画布、工作区、文件预览与转换、导出、GitHub 画布同步及 AI 镜像。AI 助手是官方可选组件，未安装时不显示助手输入区、会话或 AI 模型设置，也不初始化助手 SQLite、探测 CLI、读取助手凭据或建立助手事件订阅。

公共右侧面板、收起、全屏、穿透和 AI 镜像由宿主维护。镜像不依赖助手组件；镜像网站登录、录屏等系统权限仍按其原有规则处理。

安装成功并通过自检后，下次启动应用才启用组件。启用只是允许加载界面和使用能力，后台进程仍在用户实际访问助手或 AI 设置时按需启动。打开外观、画布、工作台习惯等普通设置不会启动助手后台。

## 状态机与恢复路径

必须分别使用这三个状态，不能只用一个开关：

- `installed`：已有完整、签名正确并通过自检的组件版本。
- `desiredEnabled`：持久化的用户意愿，供下次应用启动使用。
- `activeEnabled`：本次启动已经激活的组件能力。与后台是否 `running` 分开。

| 操作或阶段 | installed | desiredEnabled | activeEnabled | 后台与恢复行为 |
| --- | --- | --- | --- | --- |
| 首次启动，未安装 | false | false | false | 无助手后台、无助手数据库初始化 |
| 下载、校验、自检中 | 原值 | 原值 | 原值 | 自检使用临时独立进程和临时数据库 |
| 首次安装成功 | true | true | false | 自检进程退出；提示重启后启用 |
| 下次启动且文件验证通过 | true | true | true | 后台仍未启动，直至实际使用 |
| 手动停用 | true | false | false | 先阻止新请求，再停止后台和任务；保留数据 |
| 再次开启 | true | true | false | 先验证组件文件；下次启动启用 |
| 更新安装成功 | true | true | 原值 | 已运行的旧版本继续到本次应用退出；下次使用新版本 |
| 卸载 | false | false | false | 停止后台，移除组件程序；保留会话与配置 |
| 文件缺失、损坏、签名错误 | 保留诊断状态 | 保留原意愿 | false | 不加载损坏代码；允许重新安装或卸载 |

`phase` 用于展示 `not-installed / downloading / verifying / checking / installing / ready / error` 等流程。`restartRequired` 表示已安装且希望启用的版本与本次激活目录不同；更新时同时显示 `version` 与 `activeVersion`，不能把新包安装成功描述为已运行新版本。

取消下载、超时、签名或内容校验失败、自检失败都不切换注册版本。临时目录会清理，之前可用版本继续保留。快速重复启停、同时请求启动及停用时的迟到回包均需回归测试。

停用后前端已经加载的 JavaScript 可能仍在模块缓存中，不能承诺全部内存立即归零。后台进程、订阅、重连与交互入口应退出；再次启动应恢复无助手后台的基线。

## 代码与数据

| 内容 | 位置或职责 |
| --- | --- |
| 组件包构建 | `scripts/build-assistant-plugin.js` |
| 安装、签名与生命周期 | `src/backend/plugins/assistantPluginManager.js` |
| 受信公钥及默认发布目录 | `src/backend/plugins/pluginTrust.js` |
| 宿主进程管理及 RPC | `src/backend/plugins/assistantProcessHost.js` |
| 独立进程入口 | `src/backend/plugins/assistantWorker.js` |
| 组件后端构建入口 | `src/backend/assistant-plugin/entry.js` |
| 组件前端构建入口 | `public/src/runtime/assistant-plugin/assistantEntry.js` |
| 组件 UI 模板 | `public/src/runtime/assistant-plugin/assistantTemplate.html` |
| 组件独立样式 | `public/ui.agent-assistant.css` |
| 构建产物 | `release/plugins/`，已被 Git 忽略 |

组件程序保存在 `<DATA_DIR>/plugins/freeflow.ai-assistant/versions/<version>-<随机标识>/`，状态记录为同目录上层的 `state.json`。不修改 macOS 已签名的 `.app`，也不修改 Windows 安装目录。

助手数据库、设置、附件、备份和工作区继续使用宿主原有路径。卸载组件不等于删除这些用户数据。凭据通过宿主的同一个凭据服务实例读取和写入，避免独立进程同时写凭据文件造成覆盖。

后端入口提供 `createAssistantBackend(host)`，宿主注入路径、应用版本及受限服务代理；返回 Express 路由、设置服务、运行时、自检和关闭接口。CLI 连接、模型验证、会话、队列、审批和事件流继续使用现有助手实现，打入独立包。

## 进程和安全边界

桌面端使用 Electron `utilityProcess`。开发 Web 服务和独立 Node 测试使用子进程后备路径。进程隔离使助手退出或崩溃时能够回收运行资源，但 **utilityProcess 不是操作系统安全沙箱**。组件是经过签名的官方代码，仍能执行其进程可用的 JavaScript 和系统调用。

CLI 的 Node/npm 包装器使用 Electron 内置 Node 执行，并仅为该子进程设置 `ELECTRON_RUN_AS_NODE=1`；原生 CLI 清除继承的同名变量，避免误启动 Chromium 或改变原生程序的启动模式。真实 utilityProcess 回归同时检查版本探测、Codex 启停、Claude 退出和原生环境恢复。

宿主 RPC 仅允许约定的方法，凭据 ID 限定到助手 Provider，文件访问仍执行原有权限验证。内部 HTTP 服务仅监听回环地址，并要求随机宿主 capability；前端代理保留原有 Agent API cookie 和来源校验。不能把子进程端口当成公开服务。

安装流程为：下载或读取离线包 → 限制包体与解压大小 → 验证受信签名和每个文件的长度、SHA-256 → 写入受限临时目录 → 独立进程自检 → 原子发布版本目录与状态。只接受四个固定文件名，拒绝额外文件、路径穿越和符号链接等不符合契约的内容。不会在用户机器执行 `npm install` 或第三方安装脚本。

安装自检只加载组件模块，在临时目录创建并检查 SQLite/schema，然后退出；不启动 CLI、不读模型密钥、不迁移正式会话数据库。

## 包格式与签名密钥

`.ffplugin` 是 gzip 压缩的 JSON：

```text
{ manifest, signature, files }
manifest = {
  id: "freeflow.ai-assistant",
  version,
  hostApiVersion: 1,
  minAppVersion,
  files: { 文件名: { size, sha256 } }
}
signature = Ed25519(JSON.stringify(manifest)) 的 Base64
files = { 文件名: 文件内容的 Base64 }
```

固定四文件为 `backend.cjs`、`assistant.js`、`assistant.css`、`assistant.html`。后端包含所需 npm 代码和 Express，只外部依赖 Node 内置模块；路径与凭据服务通过宿主注入。浏览器端为单个 ESM bundle，不回到宿主加载助手源码。

当前受信公钥存于 `src/backend/plugins/pluginTrust.js`。**必须离线备份它对应的真实私钥，并记录公钥与指纹；不要丢失后直接生成另一个密钥替换。** 已发布主程序只信任编译进去的公钥，新私钥签出的包无法被旧程序接受。密钥轮换需要明确的主程序升级与信任迁移方案，首版不提供自动轮换。

私钥路径通过 `FREEFLOW_PLUGIN_SIGNING_KEY_FILE` 指定；本机默认路径是 `~/.config/freeflow/plugin-signing-ed25519.pem`，权限为 `0600`，不在仓库内。私钥不能进入 Git、发布附件、构建日志或聊天。可以用公钥验证，不需要向客户端分发私钥。

普通构建和测试都不会自动生成密钥。`--init-signing-key` 仅用于受控的首次开发密钥准备；新生成密钥与宿主公钥不匹配时构建仍会拒绝。它不是恢复丢失发布密钥的办法，也不得自动修改 `pluginTrust.js`。

## 开发与构建命令

需要项目既有依赖、Node（支持 `node:sqlite`）及 Electron。以下命令均在项目根目录运行。

```sh
npm run build:assistant-plugin
npm run check:assistant-plugin-packaging -- --package-file release/plugins/freeflow-ai-assistant-2.0.2.ffplugin
```

使用指定发布私钥和独立组件版本：

```sh
FREEFLOW_PLUGIN_SIGNING_KEY_FILE=/受控路径/plugin-signing-ed25519.pem npm run build:assistant-plugin -- \
  --plugin-version 2.0.3 --min-app-version 2.0.2 \
  --base-url https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/download/assistant-v2.0.3/
```

Windows PowerShell 可先设置 `$env:FREEFLOW_PLUGIN_SIGNING_KEY_FILE` 再执行相同 npm 命令。未指定时，组件版本与最低应用版本默认使用 `package.json` 的版本。可选 `--out-dir`、`--key-file` 分别覆盖产物目录和私钥文件。

输出包括 `.ffplugin`、`assistant-plugin-catalog.json` 和用于本地审计的 `build-inputs.json`。后者不需要上传；私钥永远不是输出文件。主程序的 `start:desktop`、`prepare:desktop-build` 和生成物一致性检查不会构建或下载助手组件。

本机测试环境缺少系统 npm 时，可临时使用 `/tmp/freeflow-build-tools/bin/npm`（本轮下载的官方 npm 11.6.2），并把内置 Node 的 `bin` 加入 `PATH`。该临时目录可能被系统清理，不能作为项目启动或发布依赖；正式开发环境应安装可用的 Node/npm。

## 下载目录与正式发布

当前默认不配置公网下载目录，设置页会明确提示可导入签名插件包，不显示可用下载的假象。发布后可通过 `FREEFLOW_ASSISTANT_CATALOG_URL` 指定真实 HTTPS 目录，或在下一次主程序发行时设置固定默认目录，例如：

```text
https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/latest/download/assistant-plugin-catalog.json
```

**本轮只完成本地真实下载、安装和桌面测试，没有发布 GitHub Release，也没有推送远程。线上目录和包尚未上传，不能把本地 HTTP 测试描述为公网发布已可用。** 在正式发布前，可使用经过签名的离线包完成安装。

发布操作需要仓库维护者在准备好发布时执行：

1. 保持受信公钥不变，使用对应私钥构建；使用版本固定的 Release URL 作为 `--base-url`，避免目录指向另一个 Release 的包。
2. 执行下面的组件完整测试，以及目标系统的桌面测试、主程序打包检查。确认本次构建的 SHA-256 与目录一致。
3. 向对应 GitHub Release 上传 `.ffplugin` 与 `assistant-plugin-catalog.json`。目录中的 `id/version/hostApiVersion/minAppVersion/url/size/sha256` 都必须对应实际包。
4. 确认默认 `releases/latest` 实际指向包含该目录的 Release。GitHub 的预发布和后续主程序发布会影响 `latest`；后续 Release 也需要附带适配的目录，或在主程序中显式更换稳定目录地址。不要假设任意新建一个 Release 就一定能被默认地址找到。
5. 从另一台设备访问实际 HTTPS 地址，完成目录读取、下载、自检、重启启用和卸载，之后才宣布公网安装可用。

生产下载只接受 HTTPS。测试可通过 `FREEFLOW_ASSISTANT_CATALOG_URL` 指向目录；HTTP 回环地址只在 Node 或未打包的 Electron 开发环境明确设置 `FREEFLOW_PLUGIN_TEST_LOOPBACK=1` 时允许。打包后的桌面端不放开 HTTP 下载。官方组件下载不使用用户的 GitHub 画布同步 Token，也不访问其私有同步仓库。

## 离线导入与故障恢复

设置 → 画布插件 → AI 助手 → 导入组件包，选择官方签名的 `.ffplugin`。网络下载和离线导入执行相同签名、完整性和运行自检，不能通过离线导入绕过校验。成功后提示重启；关闭并重新启动应用后启用。

| 问题 | 处理方式 |
| --- | --- |
| 下载地址 404、不可达或超时 | 保留当前版本，重试或导入官方离线包；正式目录未发布时先完成发布 |
| 签名或完整性失败 | 不运行包；重新取得匹配当前受信公钥的官方包，不能关闭校验 |
| 自检失败或磁盘空间不足 | 不切换版本；释放空间、检查系统运行时后重试 |
| 组件文件缺失或被改写 | 本次启动不激活，重新安装或卸载；画布和镜像继续使用 |
| 助手进程异常退出 | 画布和镜像继续；再次使用助手时可以重新启动进程，历史从原数据库恢复 |
| 停用失败 | 已先阻止新接入；重试停用并检查停止/持久化错误，不能显示成仍正常运行 |

失败安装会保留旧注册版本；成功更新不会覆盖当前运行版本的文件。首版没有自动在“已升级数据库后”回退数据的功能，也不提供任意历史版本列表。若要回退组件，可停用后导入兼容当前宿主、同样受信的旧包并重启；**先备份助手数据，确认旧包支持当前数据库 schema**。组件包回退不等于数据库回退。

升级前的助手会话、配置、凭据不会因为引入插件而自动删除。停用、卸载和重新安装均应保留它们。需要删除用户数据时应另行明确操作，不应以清理组件缓存代替删除历史。

## 分层验证

常规 `npm test` 增加无发布密钥依赖的核心打包边界、管理器状态机与 UI 检查。管理器单测使用临时测试密钥和隔离目录，不创建或更换受信发布密钥。常规测试不要求本地已有 `.ffplugin`。

完整真实组件链路：

```sh
npm run test:assistant-plugin
```

按顺序构建真实包、校验打包边界/签名、实际 HTTP 下载安装和自检、跨进程 RPC/事件流与恢复、浏览器 UI，以及原生 Electron 安装/四次启动/停用/再启用/卸载。需要原有受信签名密钥、Playwright 浏览器和可用桌面环境。没有签名密钥时必须明确失败，不得自动生成替代密钥。

已有官方签名包、无需持有私钥的 CI 或另一台设备：

```sh
npm run test:assistant-plugin -- --artifact /绝对路径/freeflow-ai-assistant-2.0.2.ffplugin
```

该模式跳过构建，仍执行后续完整验证。测试使用临时用户目录，不清空实际画布、助手记录或登录凭据。

实际主程序包的检查：

```sh
node scripts/check-assistant-plugin-packaging.js --asar-file /打包路径/FreeFlow.app/Contents/Resources/app.asar
```

Windows 使用其 `resources/app.asar` 路径。该检查确认助手实现、模板、样式及 `.ffplugin` 没有进入主包，同时确认插件宿主和镜像共用 chrome/dom 仍存在。检查工具的 `@electron/asar` 来自构建环境，不是用户端安装组件的依赖。

Mac 与 Windows 共享组件逻辑和 UI，各自保留平台适配。当前 Mac 上的原生测试不能代替 Windows 原生桌面测试；Windows 发布前必须在 Windows 执行完整组件测试和安装包检查。

## 体积与性能验收

本轮样例签名包约 **412 KB（十进制）**，安装后的四文件约 **1 MB**，后续源码或依赖变化会改变数字。这不是主安装包节省值，也不是内存降低值；没有内置大模型，不应承诺减少几十或几百 MB。

主程序已经排除助手原始实现与界面产物。默认无助手时的明确标准是：不加载助手脚本/样式、不启动助手进程、不探测 CLI、不初始化助手 SQLite、不创建助手轮询或 SSE；镜像、画布和普通设置保持可用。进入助手、连续使用、退出、停用、重启与快速反复启停都应验证恢复路径。

启动时间、空闲内存和 CPU 的收益需要使用同一设备、相同画布、相同构建参数进行前后实测，不能用源码体积或功能关闭状态推算百分比。

## 本轮验收记录（2026-10-16）

- 全项目 `npm test` 通过，包含画布编辑、文件预览、导出、GitHub 同步、镜像面板、设置、教程及桌面数学公式/链接回归。
- `npm run test:assistant-plugin` 通过：真实签名包经本地 HTTP 下载，在 Electron 内完成签名/SQLite 自检和四轮启动；另测离线导入、取消、停用、再启用、卸载和历史保留。
- 实际构建的 Mac arm64 `.app` 已启动验证：助手源码从 `app.asar` 排除后，核心仍可启动，签名插件可安装、自检、重启启用并加载会话。
- 已安装的后端包通过本地协议 CLI fixture 验证流式回复、请求幂等、队列、停止和恢复；真实 Electron utility 另测 npm/JS CLI 的探测、Codex 启停及 Claude 退出。当前本机没有完整的模型连接配置，未把这些测试描述为真实云端模型联网对话。
- 本机现用配置已备份、清除旧插件初始化，并完成安装、自检、重启、停用及再启用验证。未安装启动和安装自检前后的原助手数据库 SHA-256 一致。
- 已修正实测发现的安装受理状态轮询遗漏、共享面板样式层叠、临时文件清理失败锁定安装及独立进程 CLI 包装器启动问题。
- 本轮不推送远程、不发布 Release。正式公网下载安装仍需按上面的发布流程上传签名包与目录，再完成 HTTPS 实测。
