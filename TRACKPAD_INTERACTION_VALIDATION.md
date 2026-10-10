# 触控板与工作区交互验证

日期：2026-10-10。归属：跨平台通用改动，同步到 `mac`、`win`、`main`；平台窗口、权限、剪贴板和打包能力保持各自实现。本轮只做本地提交。

## 行为与恢复链

- Chromium 将触控板捏合表示为带 `ctrlKey` 的像素 wheel 事件。记录实际 Control 键按下状态，区分捏合与 Ctrl + 滚轮；捏合系数从 0.0015 调为 0.01，物理 Ctrl / Command + 滚轮保持 0.0015。Web API 不能可靠识别硬件型号，因此不使用滚动幅度猜测设备。
- 双指平移保留小数增量，并将像素、行、页单位统一到像素。沿用现有相机按帧批量更新，围绕指针所在位置缩放；每次事件的倍率受限，整体缩放继续限制为 10% 至 400%。不新增惯性动画或后台轮询。
- 状态链：首个 wheel 进入交互态；连续事件更新临时相机并重置 160ms 恢复计时器；手势结束、窗口失焦或页面隐藏时提交视图并走现有呈现恢复流程；返回前台后恢复预热与绘制。拖拽期间抑制 wheel，避免改变正在操作的坐标系。卸载清理新监听器和修饰键状态。
- 文字、表格、代码和备注编辑层上的捏合统一交给相机；普通滚动仍交给编辑器。工具栏和菜单不接管手势。现代引擎工作时关闭旧相机 wheel 的重复处理，防止一次手势放大两次。
- 每个工作区的收起按钮放到自身左上控制组，使用 32px 固定点击区域；控制组悬停不再移动。展开按钮使用 36px 点击区域，并避让全局菜单。助手、镜像、锁定和镜像选择控件固定同排；顶部内容、小地图和窄屏导航栏留出相应空间。减少动态效果的系统偏好禁用这些控件的过渡。

## 验证证据

- `scripts/check-canvas-wheel-input.js`：捏合、物理修饰键、像素/行/页单位、小数平移与单事件倍率限制。
- `scripts/check-canvas-trackpad-browser.js`：正反缩放、指针锚点、正反平移、6 类编辑层事件路由、10 轮快速混合手势、失焦恢复、5 轮交互中隐藏/显示、缩放边界、真实文字输入及退出编辑后的内容提交、拖拽期间相机保护、结束后视图与渲染版本稳定。
- `scripts/check-air-canvas-interactions.js`：1600x1000、900x900、680x820，检查实际点击命中、同排及无遮挡、按钮悬停/按下位置、面板半屏/全屏/恢复、5 轮双面板收起/恢复、左右换位、尺寸调整、信息栏与小地图收放、助手/镜像切换、穿透退出恢复。保留原有菜单、玻璃效果和镜像目标恢复用例。
- `scripts/check-desktop-canvas-smoke.js`：启动独立配置的原生 macOS Electron，验证 preload、撤销/重做、上述手势与编辑用例；CDP `Input.synthesizePinchGesture` 产生 `isTrusted` wheel 输入，执行放大和反向缩小，并确认 `visualViewport.scale` 保持 1，未缩放软件界面。
- 完整 `scripts/run-test-suite.js` 已通过，涵盖构建一致性、共享运行时、剪贴板 37 项浏览器场景、元素编辑、设置、教程、启动与 AI 助手恢复；工作区调整的 p95 帧耗时为 8.5 至 9.4ms，低于原有测试阈值。这个局部结果不代表所有交互或硬件的性能。

## 运行边界

测试使用独立数据目录，不接触用户画布。共享代码可在两种系统运行；Windows 本机鼠标、精密触控板与原生窗口操作仍需要 Windows 主机验收。macOS 受信任 Chromium 手势测试不能替代真人在实体触控板上对灵敏度的体验确认。

参考：[MDN wheel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)、[WheelEvent.deltaMode](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/deltaMode)、[Electron webFrame](https://www.electronjs.org/docs/latest/api/web-frame)。沿用 Electron 默认页面缩放限制，手势只调整画布相机。
