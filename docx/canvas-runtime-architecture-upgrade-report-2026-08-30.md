# FreeFlow 画布统一运行时架构升级与测试报告

## 1. 结论

- 执行日期：2026-08-30（Asia/Shanghai）。
- Git 基线：`main` / `b85eb9189560305949d31cab2f1b312607a1973a`。
- 实施结论：已建立统一的元素类型注册、能力解析、帧上下文、生命周期、失效、Renderer、Editor、Overlay 和 Resource 管理体系，并将核心路径接入该体系。
- 性能结论：已完成不降低 DPR、字体质量、元素数量或内容质量的结构性优化。本文只记录本机测试样本，不宣称未经基准对照验证的提升比例。
- 验收结论：最终 `npm test` 退出码为 0，输出 `[air-canvas] interaction checks passed` 和 `[test] all checks passed`。

## 2. 原问题与根因

拖拽或缩放时元素跟随延迟、非文字元素颤动、背景短暂消失、长文本顶出画布、Ctrl+滚轮时内容闪烁和点击后短暂消失，属于同一类体系问题的不同表现：

1. Canvas、DOM Overlay、编辑器和资源加载曾在不同时间读取可变相机状态，单帧内可能使用不同的 scale/offset。
2. 元素能力散落在按 `item.type` 分派的独立分支中，渲染、命中、编辑、LOD、缓存和可见性没有同一个声明源。
3. 交互进入、持续、退出和恢复缺少统一生命周期，异步 Overlay 或缓存容易保留旧状态。
4. Renderer 需要逐元素遍历候选处理器，元素数量增加时存在无效分派成本。
5. 资源缓存缺少按场景 revision 的统一回收时机。

本轮处理目标不是只修某一个闪烁点，而是先建立统一运行时，再将已被替代的核心旧分派删除，最后在新体系上做无损性能优化。

## 3. 统一架构

### 3.1 元素定义注册表

13 种内建元素已全部登记：

`shape`、`image`、`fileCard`、`codeBlock`、`table`、`mathBlock`、`mathInline`、`mindNode`、`mindSummary`、`mindRelationship`、`flowNode`、`flowEdge`、`text`。

每种元素统一声明以下能力：

- 模型：normalize、bounds、translate、resize。
- 表现：renderer、LOD、layer、cache、visibility。
- 交互：hit test、handles、marquee、editor。
- 运行时：overlay、resource、lifecycle hooks。

注册表支持别名、动态注册、动态注销、能力完整性校验和 revision。别名冲突改为“先完整校验、后原子提交”，失败注册不会污染已有定义或 revision。

### 3.2 单帧上下文

每次正式渲染生成一个不可变 FrameContext，包含：

- frame ID 与时间戳。
- 冻结的 camera view。
- scene、board、registry revision。
- 实际 DPR。
- 当前 runtime mode。

Canvas 层以及 rich text、math、code 三类 DOM Overlay 使用同一份相机快照，避免同一帧内读取到不同视图。

### 3.3 生命周期与恢复链

统一状态机为：

```text
unmounted -> dormant -> visible -> interacting/editing -> settling -> visible
```

- 进入：元素挂载后进入 `dormant`，可见后进入 `visible`。
- 交互中：拖拽、平移、缩放或编辑进入 `interacting` / `editing`。
- 退出：交互结束先进入 `settling`，同帧 Overlay 和编辑布局协调完成后恢复 `visible`。
- 移除或引擎卸载：进入 `unmounted` 并清理运行时记录。
- 快速重复：测试连续进入/退出后没有遗留 `interacting`、`editing` 或 `settling` 状态。

稳定帧只重新评估可见或仍活跃的元素；场景 revision 变化时才同步全量元素集合。

### 3.4 Adapter 与扩展入口

Renderer、Editor、Overlay 和 Resource 均通过统一 adapter 入口管理：

- 同一能力键支持栈式覆盖。
- 卸载新 adapter 后恢复前一个 adapter。
- 清理函数幂等，不会误删后来注册的同名元素定义。
- 注册或卸载 Renderer 会立即触发场景失效和重绘。
- 注册或卸载 Resource adapter 会使 revision 守卫失效，下一帧必定收到当前场景。
- `registerElementDefinition()` 可一次登记元素定义及 renderer/editor/overlay/resource adapter。

### 3.5 统一失效协议

失效域统一为 background、geometry、content、resource、interaction、overlay、hitTest。调度器将元素失效转换为现有渲染脏标记，并去重局部元素 ID，避免各模块自行拼装不一致的刷新条件。

## 4. 已切换和清理的核心路径

已切换到统一定义或能力解析的路径：

- 元素规范化、边界、移动和缩放。
- Renderer 类型分派与 LOD 决策。
- 静态 tile cache 绕过策略、可见性和连接层。
- Hit test、handle、框选和空间索引记录构建。
- 编辑 begin/commit/cancel。
- rich text、math、code Overlay 同帧同步。
- 图片资源缓存清理。

已删除 Renderer 内被统一注册处理器替代的 file card、mind node、mind summary 和 text 旧 fallback 类型链。元素特有的绘制与编辑实现仍保留在各自模块内，这是有意的模块边界；统一的是生命周期、能力声明和调度，不是把所有类型实现合并成一个文件。

## 5. 无损性能优化

1. Renderer 从“每个元素遍历全部 renderer”调整为按规范类型直接定位，类型处理器查找为 O(1)；同类型覆盖采用栈式回退。
2. 生命周期稳定帧只评估可见或活跃元素。单元样本为 1000 个元素、2 个可见元素时，仅评估 2 个元素。
3. 图片缓存按场景 revision 精确回收；资源管理器的清空场景与重新同步已有反向路径单测。
4. Canvas 与 DOM Overlay 共用冻结 camera，减少重复布局和错帧引起的视觉闪动。
5. 保留现有 DPR、字体、LOD 内容质量和元素数量，没有通过降画质换取性能。

最终全量测试中的本机单次样本：

- 平移交互帧约 `2.9 ms`，提交帧约 `1.1 ms`。
- 选择拖拽交互帧约 `0.6 ms`，提交帧约 `0.7 ms`。
- 低缩放 3 元素 LOD 样本约 `26.3 ms`，3 个元素均进入现有简化策略。

这些数字受机器负载、浏览器调度和测试场景影响，只作为本次验收记录。

## 6. 测试与交互验收

### 6.1 正式全量测试

命令：`npm test`

结果：退出码 0。

实际通过范围：

- 生成 bundle 一致性。
- 后端安全、桌面原子保存、Electron IPC 安全。
- Canvas LOD、Overlay budget、交互协调。
- 新增元素运行时架构与 13 类型注册表检查。
- 9 组解析器验证。
- 22 组 Renderer/元素集成验证。
- Canvas2D 全量浏览器交互回归。
- Air Canvas 交互检查。

### 6.2 新增恢复链检查

浏览器内连续执行 6 次 Ctrl+滚轮缩放后：

- Frame ID 从 6 推进到 14。
- Canvas、rich、math、code Overlay 的 Frame ID 均为 14。
- FrameContext camera 与最终 board view 完全一致。
- runtime mode 恢复为 `steady`。
- text、code、shape 均恢复为 `visible`。

扩展与回退检查：

- 后注册 Renderer 返回 `false` 时，调用顺序实际为 `override -> base`。
- 动态元素类型注册成功、注销成功。
- 旧 disposer 重复调用后，新注册的同名类型仍存在。
- 新注册类型最终注销后，注册表重新通过完整性校验。

资源与生命周期单元检查：

- 相同 scene revision 不重复同步。
- 覆盖 Resource adapter 卸载后，基础 adapter 在同 revision 下立即恢复并同步。
- 清空场景后再次加入资源可重新同步。
- 1000 元素稳定帧只评估 2 个活跃元素。
- 连续 4 次 editing -> settling -> visible 正常恢复。
- 元素移除后状态为 `unmounted`。
- 矩形最小尺寸及线段 start/end 调整保持旧语义。

### 6.3 测试中发现并修复的问题

新增 Renderer 回退检查首次运行失败。诊断确认分派回退逻辑正确，失败原因是运行时注册/卸载 Renderer 没有主动使场景失效，静态场景不变时新 Renderer 不会立即参与渲染。

处理后，注册和卸载均统一触发 scene dirty；重新构建两个 bundle，Canvas2D 浏览器回归和最终 `npm test` 均通过。

## 7. 保留边界与下一轮候选

本轮没有为了追求“零类型判断”而删除元素模块内部必要的类型专用逻辑。以下内容适合下一轮独立评估，不应与本轮稳定提交混在一起：

1. 将导出、上下文菜单、批量格式和特有工具栏的剩余类型判断继续迁移为 command/export capability。
2. 评估每个引擎实例独立 registry，避免未来多画布实例共享动态定义。
3. 为异步图片、文件预览和 URL metadata 增加统一 generation token，系统化拒绝过期异步回填。
4. 建立长时间缩放/平移压力基准和帧时间分位数，而不是依赖单帧样本。
5. 增加多 DPR、触控板惯性滚动和真实高分屏的视觉差异截图基线。

上述项目未在本轮实现，也未记为已通过。

## 8. 最终呈现架构收口

在统一元素运行时基础上，最后两个批次进一步收口了画布的实际呈现所有权：

```text
Surface
├─ Main Canvas：背景、低缩放回退、旧扩展 renderer 主体
├─ SceneTransformRoot：唯一相机矩阵
│  ├─ VectorLayer
│  └─ ContentLayer
└─ ScreenSpace Interaction Canvas：所有屏幕空间交互控件
```

最终约束如下：

1. 场景坐标中的主体只由 `SceneTransformRoot` 接收一次相机变换，DOM 内容层和矢量层不再各自追赶相机。
2. 选择框、控制柄、旋转柄、锁定标记、框选和对齐线统一由顶部交互 Canvas 绘制，不再混入主体 Canvas。
3. 主 Canvas 与交互 Canvas 的 CSS 尺寸、backing store 和 DPR 同步；交互 Canvas 固定为 `pointer-events: none`，不改变原输入命中路径。
4. 主体节点在平移、缩放、外部尺寸拉伸和交互恢复期间保持同一 DOM 身份，不通过卸载重建制造视觉跳变。
5. 交互结束后统一经过 `settling` 回到 `steady`；低缩放释放、重新放大和快速重复进入/退出均检查反向恢复。

这次分层解决的是此前残影和颤动的共同根因：场景主体、屏幕空间交互图形和相机变换曾存在重叠所有权，外部拉伸时不同呈现路径可能在相邻帧使用不同尺寸或不同变换。最终结构使场景内容和交互控件分别只有一个写入者。

## 9. 最终两个实施批次

### 9.1 屏幕空间交互层

提交：`455fd0b refactor: isolate canvas screen-space interaction layer`

- 新增独立顶部交互 Canvas。
- 将全部屏幕空间交互控件从主体 Canvas 迁移到交互层。
- 同步两个 Canvas 的实际像素尺寸和 DPR。
- 增加层级、真实像素、缩放恢复和外部尺寸拉伸回归检查。

### 9.2 旧呈现路径清理

提交：`63b7f9f refactor: remove superseded canvas presentation paths`

- 删除已经没有消费者的旧交互合成分支。
- 删除主体 renderer 夹带交互控件的废弃开关。
- 删除空的旧文件预览清理钩子。
- 简化低缩放 DOM Overlay 的隐藏和恢复路径。
- 保留主 Canvas 的低缩放 LOD 回退，因为它仍是现有扩展 renderer 和低缩放体验的有效兼容边界。

删除旧路径发生在新层已接入并通过回归之后，没有先拆旧实现再依赖未验证的新实现。

## 10. 最终全量验证记录

### 10.1 自动化命令

以下命令均在最终代码状态下实际执行并通过：

- `npm test`
- `npm run test:canvas2d`
- `npm run test:element-runtime`
- `npm run test:element-registry`
- `npm run test:canvas-lod-scale`
- `npm run test:interaction-coordination`
- `npm run build:canvas-office`
- `npm run build:canvas2d-ui`
- `npm run check:generated-bundles`
- `git diff --check`

最终全量测试输出包含：`[test] all checks passed`。

### 10.2 浏览器状态机与交互恢复

实际浏览器回归覆盖：

- 交互状态从 `active` 进入 `settling`，最终恢复 `steady`。
- 表格编辑连续三次快速进入和退出后正常恢复。
- 低缩放释放后正常，重新放大后内容恢复。
- 图片、表格、文件卡、形状、流程节点和边在交互前后保持节点身份。
- 运行时自定义 renderer 的注册、调用和回退合同保持。
- 主 Canvas 背景在验收帧中始终有实际非透明像素。
- 交互控件在缩放前、交互中和恢复后均有实际非透明像素。

### 10.3 双视口最终体验数据

桌面视口 `1440 x 960`：

- 最终 phase：`steady`。
- 最终 runtime mode：`steady`。
- 主 Canvas 与交互 Canvas 实际尺寸：均为 `1440 x 960`。
- 场景主体节点身份保持：是。
- 主 Canvas 非透明像素：`1,382,400`。
- 交互 Canvas 非透明像素：`1,900`。
- 页面宽高与滚动宽高一致，无页面级溢出。
- 控制台错误：0。

紧凑视口 `900 x 700`：

- 最终 phase：`steady`。
- 最终 runtime mode：`steady`。
- 主 Canvas 与交互 Canvas 实际尺寸：均为 `900 x 700`。
- 场景主体节点身份保持：是。
- 主 Canvas 非透明像素：`630,000`。
- 交互 Canvas 非透明像素：`1,900`。
- 页面宽高与滚动宽高一致，无页面级溢出。
- 控制台错误：0。

两张最终截图已人工检查，没有发现主体重影、图片或表格错位、交互框重复绘制、画布空白或控件互相遮挡。紧凑视口左上方的部分内容裁切与桌面视口一致，来自当前相机位置和既有侧栏覆盖关系，不是交互残影。

### 10.4 验收准备阶段的非产品失败

为保证报告可复核，记录一次性验收脚本准备阶段出现的三次失败：

1. 首次等待非规范测试数据挂载时超时；修正为符合当前场景入口的数据后继续。
2. 一次临时验收脚本存在括号语法错误；修正脚本后重新运行。
3. 完整自动测试结束后本地服务已被关闭，一次浏览器连接出现拒绝；重新启动服务后继续。

上述三项均发生在临时验收设施准备阶段，不是产品运行时断言失败。修正测试数据、脚本和服务状态后，两个视口的最终体验验收均通过；报告保留失败记录，不将失败运行计为通过。

## 11. 最终范围与残余风险

本轮完成了统一注册表、运行时能力、生命周期、单帧相机、场景主体所有权和屏幕空间交互所有权的架构闭环，并清理了已被替代的核心呈现路径。它不等同于宣称画布今后不会再出现任何缺陷。

当前仍保留的边界：

1. 主 Canvas 中保留低缩放 LOD 回退和旧扩展 renderer 主体；这是兼容边界，不是重复的场景 DOM 所有权。
2. 元素专属绘制、编辑和资源实现仍在各元素模块中；统一的是协议、调度和生命周期，而不是强行合并业务实现。
3. 本轮真实体验覆盖桌面与紧凑 Web 视口，但没有覆盖所有显卡、所有高分屏 DPR、长时间触控板惯性操作和 Electron 多窗口组合。
4. 当前记录的是功能、恢复链和视觉稳定性验收，不是系统化的长时间帧时间分位数基准。

下一轮可独立推进：

1. 为长时间连续平移、缩放和外部拉伸建立 P50/P95/P99 帧时间基准与回归阈值。
2. 增加多 DPR、Electron 真机、多窗口和触控板惯性输入矩阵。
3. 将剩余导出、上下文菜单和类型专属命令迁移到 capability，但应保持与渲染架构分开提交。
4. 为异步图片、文件预览和 URL metadata 建立统一 generation token，阻止过期结果回填。
5. 评估多画布实例隔离的 registry 和 resource scope，避免未来实例间共享动态定义。

这些候选均未在本轮记为已完成。

## 12. 旧数据兼容与全元素交互收口

本批没有撤回统一运行时，也没有恢复旧渲染分支。重构前版本仅作为只读行为基线；旧版画布数据继续由新版注册表、统一场景层、统一相机和统一交互层加载与运行。

提交：

- `0c30faa fix: stabilize canvas overlay ownership and coordinates`
- `8d73ab0 fix: restore canvas element interaction parity`

### 12.1 本批修复

1. 将新建 rich text、math 和 code Overlay 先以隐藏状态完成布局，再统一提交可见性，避免同一元素的主体和 Overlay 在半完成帧同时出现。
2. 统一 Overlay 的场景局部坐标，rich text、旧公式、流程节点文字和代码块不再混用屏幕坐标与世界坐标。
3. 修复代码块首帧 Overlay 漏挂载。可见代码块未被虚拟器跟踪时会重新扫描，不再依赖鼠标经过触发显示。
4. 修复相机缩放污染自动尺寸。逻辑尺寸改为读取未受相机矩阵影响的 CSS 尺寸和滚动尺寸，公式在 `0.5 / 0.75 / 1 / 1.25` 缩放下均保持 `300 x 47`。
5. 为思维摘要补齐统一 resize 能力和最小尺寸合同，交互结束和撤销后恢复原始几何。
6. 将图片备注和文件卡备注纳入统一场景内容层；进入备注编辑时只移交备注编辑面，主体节点保持挂载，退出后恢复静态呈现。
7. 将全元素交互合同纳入仓库默认测试，覆盖移动、缩放、编辑、备注、连接和相机恢复。

### 12.2 新旧版本兼容对照

完整对照在同一浏览器、同一视口、同一画布数据和同一输入增量下串行执行。覆盖对象包括：

- 文本、旧公式、代码块、图片、表格、文件卡和形状。
- 流程节点、思维节点、思维摘要、流程线和思维关系线。
- 五类元素编辑器、图片备注、文件卡备注和 Ctrl+滚轮相机缩放。

对照结果为通过：新版与重构前版本的初始几何、移动提交、resize 提交、编辑进入/退出、备注进入/退出、连接提交/恢复和相机恢复结果一致。新版另行执行更严格的交互中实时呈现和反向恢复断言，确认：

- 所有可移动元素在 pointer move 期间已经更新，不等待 pointer up。
- 两类连接线在源节点移动期间实时更新端点。
- 所有新版 resize 合同在撤销后恢复原始几何。
- 编辑器和备注连续三轮进入/退出后均无残留编辑状态。
- Ctrl+滚轮连续三轮放大、缩小和退出后，公式逻辑尺寸保持不变。

重构前基线自身存在两个反向恢复缺陷：普通文本 resize 撤销后高度可从 `40` 漂到 `60`，思维摘要可从 `72` 漂到 `40`。新版没有复制这两个缺陷，而是恢复到各自原始高度；兼容对照比较旧版有效的初始与提交语义，新版恢复链单独采用更严格断言。

### 12.3 最终测试与体验验收

在提交前的最终工作区状态下，以下检查均实际执行并通过：

- `node scripts/check-generated-bundles.js`
- 完整新旧版本全元素交互对照
- `node scripts/check-canvas2d-regression.js`
- `npm test`
- `node --check scripts/check-canvas2d-element-interactions.js`
- `git diff --check`

`npm test` 最终输出为 `[test] all checks passed`，其中同时包含 Canvas2D 主回归、新增全元素交互合同和 Air Canvas 相邻交互回归。

可视化体验验收重新执行了桌面 `1440 x 960` 与紧凑 `900 x 700` 两个视口。在每个视口中执行四轮 Ctrl+滚轮缩放组合、平移输入、视口缩小和恢复，结果如下：

- 最终 presentation phase 和 runtime mode 均为 `steady`。
- 图片、表格、文件卡、形状和流程线的 DOM/SVG 节点身份均保持。
- 主 Canvas 与交互 Canvas 的 backing store 分别一致为 `1440 x 960` 和 `900 x 700`。
- 主 Canvas 非透明像素分别为 `1,382,400` 和 `630,000`；交互 Canvas 均为 `1,900`。
- 页面无横向或纵向溢出，浏览器错误为 0。
- 人工检查两张最终截图，没有发现主体重影、元素堆叠、图片或表格错位、重复选框、背景消失或控件遮挡。

左上区域仍存在既有侧栏覆盖部分画布文字的现象；它在旧版基线和新版中一致，来自当前相机位置与侧栏覆盖关系。本轮没有把该现象误报为已解决，也没有将其归入统一运行时回归。

### 12.4 最终结论与边界

本轮交付标准不是回退到旧版，而是在统一运行时内恢复旧数据与旧交互的有效行为，并修复旧版已知的反向恢复缺陷。当前自动化和双视口体验验收范围内，受测元素已经达到旧版有效行为水准，新版同时增加了统一呈现所有权、交互中实时同步、严格恢复链和可持续扩展的注册表合同。

“百分百一致”仅能对已纳入数据样本、元素类型、交互路径和视口矩阵给出可复核结论，不能严谨地外推到所有历史用户文件、显卡、DPR、Electron 多窗口和长时间触控板输入。剩余环境矩阵与长期帧时间基准仍按第 11 节列出的下一轮项目处理，不在本轮伪报为已完成。
