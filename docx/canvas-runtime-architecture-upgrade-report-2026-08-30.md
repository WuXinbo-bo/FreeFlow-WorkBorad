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
