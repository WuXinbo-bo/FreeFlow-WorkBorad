# Windows 通用修复补齐与验证

日期：2026-10-09。范围：参考 mac 已验证的通用实现补齐 win，并同步到 main/mac；不推送远程。保留两平台各自的原生窗口、剪贴板、权限与安装器实现。

## 修复与预期变化

- 文件目录保留 POSIX 根、Windows 盘符根和 UNC 前缀。根目录画布与网络共享上的附件目录不会被截断。
- 文件 URL 统一使用现有 `toFileUrl`，编码 `#`、`?` 和百分号，保留 POSIX 文件名里的反斜杠；文本链接与图片路径使用同一编码语义。
- 相对附件路径只在同一盘符/共享内转换；不同盘符/共享保留绝对路径。还原时不允许 `..` 弹出盘符或共享根。POSIX 大小写敏感，Windows 路径忽略大小写。此项是在参考 Mac 修复后新增的往返缺口修复。
- 穿透请求在串行队列执行时检查当前状态，避免启用尚未完成时丢弃紧接着的关闭请求。启用 IPC 失败后恢复屏幕源和嵌入层；关闭失败保留暂停状态，重试关闭成功后恢复。
- 旧画布只将 Ctrl/Command+Shift+Z 与 Ctrl/Command+Y 识别为重做，避免抢占 Ctrl+Shift+C 等组合。
- 使用同一跨平台桌面启动脚本，删除子进程的 `ELECTRON_RUN_AS_NODE`，保留参数、环境与退出信号传递。
- 凭据备用密钥初始化共享一个 Promise，防止首次并发加密使用不同密钥；初始化失败可重试。Windows DPAPI 仍为首选。
- 画布初始化暴露 `whenReady()`，桌面实测等待初始载入完成后操作，避免启动状态与测试载入竞争。

## 验证

- `check-canvas-file-paths.js`：Unicode、盘符根、UNC、跨盘符/共享、大小写、父级边界、附件保存/载入往返和特殊文件名链接。
- `check-workbench-shared-recovery.js`：延迟启用后立即关闭、连续 8 次切换、启用失败恢复、关闭失败后重试、快捷键与启动脚本。运行真实函数，桌面 IPC 使用可控替身。
- `check-secret-storage-concurrency.js`：真实临时文件写入；Windows fallback 和 macOS AES 各 32 项并发写入，重新加载模块后仍可读取，清除/重写，以及密钥/凭据写入失败恢复。DPAPI 分支使用可逆替身验证；不宣称在 Mac 上实际执行了 Windows DPAPI。
- 完整共享套件：后端、安全、GitHub 同步、画布、37 项浏览器剪贴板检查、预览、后台恢复、设置和教程均通过。最后的 agent 浏览器滚动保持检查首次出现时序抖动（`frozenScroll:16`），单独重跑通过；没有修改该模块。
- Windows 打包静态检查、升级兼容检查、生成 bundle 一致性检查通过。
- 真实 Electron 桌面冒烟测试通过：独立配置目录和随机端口，确认原生 preload、画布和连续撤销/重做；执行平台是 darwin，未触碰用户正在运行的实例。

Windows Win32 窗口操作、实际 DPAPI 和 NSIS/Portable 安装器仍需在 Windows 主机验证。此轮 Mac 实测和静态检查不替代 Windows 实机验证。

新增回归检查已加入 `run-test-suite.js` 和 package scripts。依赖目录、本机画布、凭据、测试配置和未集成草稿不进入提交。
