为什么还是什么没有吗，检查所有代码，分析所有可能潜在的原因，并彻底解决

---
name: ui-scale-model-governor
description: Use when fixing or designing zooming, scaling, anchored overlays, canvas-attached panels, transform-based previews, responsive reflow bugs, or any UI where users say “it scales wrong”, “it changes shape when zooming”, “it should be 1:1”, or “it looks different at different view sizes”. Forces explicit choice of coordinate space, scaling model, and relayout policy before code changes.
---

# UI Scale Model Governor

用于所有“缩放 / 视图 / 画布附件 / 浮层 / 预览面板 / 1:1 还原”类问题。

目标不是“把比例调顺眼”，而是先防止最常见的根因：在没有定义清楚 UI 所属坐标空间和缩放模型时，直接改 CSS 和运行时尺寸，最终把多个互相冲突的模型混在一起。

这类问题如果不先定模型，极易出现：

- 一部分元素按画布缩放
- 一部分元素按屏幕固定尺寸
- 一部分元素用 `width/height * scale`
- 一部分元素用 `transform: scale(scale)`
- 文本和按钮在不同倍率下重新排版
- 用户看到的不是“同一组件整体缩放”，而是“每个倍率都像另一套 UI”

## 何时必须用

出现以下任一情况时必须先调用本 skill：

- 用户说“缩放逻辑不对”
- 用户说“1:1 还原”
- 用户说“不同倍率下看起来不是同一份内容”
- 画布内附件、预览面板、富文本工具条、悬浮卡片随缩放表现异常
- 修了多轮仍然反复
- 同一个组件同时涉及：
  - 画布坐标
  - 屏幕坐标
  - DOM 布局
  - CSS transform

## 先写死的三件事

改代码前，必须先在分析里明确回答这三件事：

### 1. 组件属于哪个坐标空间

只能明确选一种主模型：

- `canvas-space attached`
  - 组件属于画布内容的一部分
  - 跟随画布平移
  - 跟随画布缩放
- `screen-space overlay`
  - 组件挂在屏幕层
  - 跟随目标位置
  - 自身尺寸固定或独立缩放
- `hybrid`
  - 只有在非常明确时允许
  - 必须写清楚：位置跟哪一层，尺寸跟哪一层，文本跟哪一层

如果不能一句话说清楚，就不准开始改。

### 2. 缩放通过哪种机制实现

只能优先选一种主机制：

- `layout-box scaling`
  - 改 `width/height/top/left`
  - 适合真的希望内部重新排版
- `whole-surface transform scaling`
  - 基准尺寸固定
  - 对整个节点 `transform: scale(...)`
  - 适合要“1:1 整体缩放还原”

禁止默认混用。

如果要混用，必须明确：

- 哪一层是基准盒子
- 哪一层只做 transform
- 哪一层允许 relayout

### 3. 文本和控件是否允许重排

必须明确回答：

- 标题是否允许换行
- 说明文字是否允许在不同倍率下折行
- 控件条是否允许换两行
- 预览内容区是否允许重新分配高度

如果用户要求“看起来是同一个组件整体缩放”，默认答案应是：

- 文本不应因为倍率变化而重新排版成另一种结构
- 控件不应因为倍率变化而从单行变双行
- 组件应表现为同一份表面的整体缩放

## 这次问题为什么前面一直修不好

把这段当成通用反模式清单。

### 反模式 1：没先定主模型，边改边猜

这次前面来回出现过三种互相冲突的理解：

1. 预览应为屏幕固定尺寸
2. 预览应为画布附件并随画布缩放
3. 外层字固定、内层内容缩放

这三种不是“调参差异”，而是三种不同架构。没先定主模型，后续每次补丁都可能推翻上一次。

### 反模式 2：位置模型和尺寸模型分属不同空间

常见错误是：

- 位置按 canvas-space 投影
- 尺寸按 screen-space 固定

或者：

- 外层盒子按 screen-space
- 内层内容按 canvas-space

用户看到的结果就是“挂是挂住了，但大小关系不对”。

### 反模式 3：把“等比缩放”误写成“缩放后的重新布局”

如果你用：

- `width = baseWidth * scale`
- `height = baseHeight * scale`

浏览器会把内部排版在新的尺寸盒子里重新做一次。

这不等于“整块等比缩放”。

如果需求是：

- 两个倍率下看到的是同一份面板，只是整体大小不同

那主路径应该优先考虑：

- 固定基准盒子
- 整块 `transform: scale(scale)`

而不是在每个倍率给它一个新盒子重新排版。

### 反模式 4：局部逆缩放补偿破坏统一模型

常见补丁：

- 给标题 `1 / scale`
- 给工具条 `1 / scale`
- 给说明文字固定字号

这类补丁只适合在明确的 hybrid 模型里使用。

如果组件目标是“整体缩放”，局部逆缩放会直接制造第二套缩放系统，最终用户会说：

- “为什么字没跟着一起变”
- “为什么里面和外面不是同一套缩放”

### 反模式 5：把视觉变化误判成比例错误，其实是 reflow

有时用户感觉“还是变了”，真正原因不是缩放公式，而是：

- 标题换行了
- 说明变成省略号了
- 按钮从一行变两行
- 内容区高度分配变了

这不是缩放值错误，是布局重排错误。

所以改缩放类 bug，必须同时检查：

- `white-space`
- `overflow`
- `text-overflow`
- `flex-wrap`
- `grid-template-*`
- `min-width/min-height`

## 强制工作流

### 第一步：先写缩放契约

在真正改代码前，先写三行：

```text
Coordinate space:
Scaling mechanism:
Relayout policy:
```

示例：

```text
Coordinate space: canvas-space attached
Scaling mechanism: whole-surface transform scaling
Relayout policy: outer chrome and content keep one base layout; zoom must not create alternate line breaks or control wrapping
```

### 第二步：只搜四类代码

先搜：

- `scale`
- `transform`
- `width/height/top/left`
- 会导致重排的 CSS

尤其找：

- `width = ... * scale`
- `height = ... * scale`
- `transform: scale(...)`
- `flex-wrap`
- `white-space`
- `text-overflow`

### 第三步：禁止同时改两套模型

如果本轮选择了：

- `whole-surface transform scaling`

则不要再额外给内层某些块写“补偿缩放”。

如果本轮选择了：

- `layout-box scaling`

则要接受内部会 relayout，并专门控制重排策略。

### 第四步：先静态验证，再视觉验证

至少做：

- 语法检查
- 构建
- 两个不同缩放倍率下的视觉对比

视觉验证必须回答：

1. 组件只是整体变大变小，还是内部结构也变了？
2. 标题是否换行策略变化？
3. 控件条是否折行？
4. 内容区可视比例是否发生二次变化？

### 第五步：改完必须把“禁止事项”写进日志

缩放类问题必须在变更日志里写：

- 本次选用的主模型
- 哪种模型被证明不适合
- 后续禁止再混用哪两套机制

## 默认判断规则

### 用户说“1:1 还原”

优先理解为：

- 同一份表面的整体等比缩放
- 优先考虑 `whole-surface transform scaling`

### 用户说“固定在画布里”

优先理解为：

- `canvas-space attached`

### 用户说“文字不要变”

先追问或从上下文判断：

- 是“不换行不重排”
- 还是“固定屏幕字号”

这两者完全不同。

如果上下文已反复强调“整体一致”，优先理解为：

- 不要发生不同倍率下的布局重排

不是固定屏幕字号。

## 本 skill 的一句话守则

先定：

- 它属于哪一层
- 它怎么缩放
- 它允不允许重排

再改代码。

否则你改的不是 bug，而是在不同缩放哲学之间来回横跳。
