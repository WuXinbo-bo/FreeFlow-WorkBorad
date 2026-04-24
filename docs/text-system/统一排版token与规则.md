# 统一排版 Token 与规则

## 目标

在不修改核心渲染引擎源码的前提下，先把文本间距体系固化为可回归规则，确保导入与渲染链路在正文、标题、列表、引用、代码块、表格上的间距语义稳定。

## Token 基线

- 正文行高: `TEXT_LINE_HEIGHT_RATIO = 1.3`
- 流程节点文本行高: `FLOW_NODE_TEXT_LAYOUT.lineHeightRatio = 1.45`
- 标题字号映射:
  - `h1 -> 36`
  - `h2 -> 30`
  - `h3 -> 26`
  - `h4 -> 22`
  - `h5 -> 20`
  - `h6 -> 18`

## 块级间距规则

以下规则用于测量阶段的 HTML 规范化（`measureTextElementLayout.js`）:

- 段落与块元素（`p/div/section/article/blockquote/pre/h1..h6/table/...`）统一进行 `margin/padding` 归零，避免默认浏览器样式漂移。
- 列表容器（`ul/ol`）保留缩进：`paddingInlineStart = 1.25em`。
- 列表项（`li`）间距归零，交由容器与行高控制。
- 引用块（`blockquote`）保留结构间距：`paddingInlineStart = 1em`。
- 代码块（`pre`）保留内部留白：`padding = 0.55em 0.7em`。
- 表格单元格（`td/th`）保留可读性留白：`padding = 0.38em 0.5em`。

## 自动化门禁

新增脚本:

- `scripts/structured-import/validate-text-spacing-rules.cjs`

覆盖断言:

- 正文行高存在且不小于最小阈值（`>= 1.2`）。
- flow node 行高不低于正文行高。
- 标题 1-6 级字号映射精确匹配。
- 标题级别字号单调非增。
- 段落/列表/引用/代码块/表格对应的间距样式规则在测量规范化逻辑中存在。

接入 runner:

- `scripts/structured-import/run-renderer-element-integration.cjs`

## 执行命令

```powershell
node scripts/structured-import/validate-text-spacing-rules.cjs
node scripts/structured-import/run-renderer-element-integration.cjs
```

