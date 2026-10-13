# 文件卡片与画布交互优化

基线：mac 943fd3e；main ad53160；win b7f632c。各分支已建 backup/*-before-card-ux-20261013 回退分支。本轮为通用改动，各平台分别验证、构建，不推送远程。

## 批次与验收

1. 卡片比例与排版：默认 336×128，缩放保留原比例，字号/图标/留白同比例；旧布局不自动重排，阅读预览独立。检查四角、最小尺寸、多选、锁定、撤销重做、保存重载和 DOM/Canvas 显示。
2. 小地图与菜单：明确缩放触发，800ms 安静后收起；手动展开保持，手动关闭抑制本轮手势，悬停/键盘操作暂停收起。菜单分组、快捷键提示、边缘避让与键盘退出。
3. 快捷操作：选中文件快捷条、恢复标准尺寸、多选整理、副本和视口定位。优先复用现有命令与能力，禁用编辑态抢键，检查资源引用和撤销。

## 状态与恢复约束

- 缩放卡片：pointerdown 捕获原始几何 → pointermove 基于原始值等比计算 → pointerup 单次历史；Esc/失焦按已有取消链恢复。不能把逐帧结果作为下一帧基线。
- 小地图：自动收起/临时展开/手动常驻；真实缩放进入临时态，停止后计时退出；悬停或焦点暂停，离开后恢复计时。手动关闭抑制到手势停止，切画布、隐藏或卸载取消任务，临时状态不写画布或同步。
- 菜单/快捷条：选择且空闲时显示，拖动/缩放/编辑时隐藏，结束后恢复；关闭恢复焦点，Esc 优先退出最内层。旧计时器不能覆盖新状态。
- 文件/图片副本复用已有资源，移出画布不删除磁盘原文件；锁定元素不参与整理。

## 验证记录

完成各批次后补充实际结果与平台限制。

### 实施结果

- 卡片默认 336×128，最小 168×64；单选四角等比、纯文件多选整体等比，混合多选时仅文件保留自身比例。属性面板修改宽高也遵守比例。旧布局不重置；恢复标准尺寸可撤销，跳过锁定。
- 统一 DOM/Canvas 基准坐标、字体、圆角、文件名换行（含中文与后缀）、大小信息和低干扰标记。阅读预览保持独立布局；渲染不增加文件读取或逐卡片 blur。
- 文件快捷条：预览、打开、更多；已知缺失文件显示重新关联。拖拽/缩放/编辑时隐藏，稳定后恢复。菜单按任务分组，窄窗口同层子页，方向键与 Esc 分层退出；编辑器获得焦点时菜单不抢 Home/End。
- 小地图真实缩放触发，800ms 安静期自动收起，悬停/键盘焦点暂缓；手动展开常驻、关闭抑制本轮手势。隐藏/切画布/卸载取消计时，缓存场景缩略图，不写临时状态到画布。
- Cmd/Ctrl+D 和 Option/Alt 拖拽副本复用文件资源；Shift+1 显示全部、Shift+2 聚焦、Shift+0 默认视图。既有对齐/等距继续复用，添加统一文件卡尺寸。转换结果支持定位，旧文件导入路径按实际高度排列，拖入提示数量和落点。
- 回归发现并修复：Esc、pointercancel、失焦没有还原拖拽草稿；小地图鼠标焦点阻止自动收起；后台计时器晚到影响新手势；菜单键盘导航抢编辑器 End；等比多选侧边缩小受原高度限制。

### 已运行验证（macOS 本机）

通过：file-card-geometry、builtin-element-registry、canvas-semantic-transfer、canvas-card-ux（含 640×420 窄窗口）、canvas-card-ux-desktop（真实 Electron）、canvas2d-element-interactions（各类元素）、canvas-trackpad-browser、canvas-edit-integrity、canvas-rich-editing、canvas-state-history、canvas-runtime-hardening、canvas-command-integration、canvas-ui-runtime、macos-window-interaction、macos-frontend、desktop-packaging、generated-bundles。

file-workstation-desktop 通过：真实 PDF 读取/搜索/摘录/页面截图/转换 PNG/入画布/定位/撤销，重新关联，Word、表格、文字 PDF、LibreOffice，关闭/错误/晚到结果恢复。PDF 转换期间采样 RAF P95 约 9.1ms（测试场景，不代表所有文件）。

canvas-presentation-performance 通过：120 文本元素测试，RAF P95 8.6ms、恢复 P95 9.1ms；缩放期间 store emission 为 0；tile 缓存 36MiB，低于 128MiB 预算。250 段富文本缩放与恢复通过（不同运行 P95 约 24ms）。小地图测试验证连续缩放不重新生成场景缩略图。

Windows 的共享逻辑和打包静态检查将在 main、win 分别运行；当前机器无法执行 Windows 原生桌面实测。未推送远程。构建输出含既有 html2canvas vendor duplicate-case 警告，未修改第三方代码。
