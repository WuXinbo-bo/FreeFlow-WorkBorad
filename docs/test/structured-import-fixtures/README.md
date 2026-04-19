# Structured Import Fixtures

## 1. 目的

本目录用于承载结构化导入新系统的基线样本。

这套样本资产独立于当前主链，服务以下目标：

- 冻结当前复制 / 粘贴 / 拖拽导入行为
- 为新旧链路差异对比提供统一输入
- 为 parser、renderer、element、regression 提供统一样本库

## 2. 目录结构

```text
docs/test/structured-import-fixtures/
  README.md
  fixture-index.json
  current-chain-baseline.md
  comparison-template.md
  samples/
    plain-text/
    html/
    markdown/
    code/
    math/
    web/
    office/
    image/
    file/
    node/
    drawing/
    mixed/
```

## 3. 样本命名规范

样本文件名建议使用：

`<TYPE>-<三位序号>-<简短描述>.<ext>`

示例：

- `PT-001-basic-paragraphs.txt`
- `HT-001-rich-inline-and-list.html`
- `MD-001-gfm-task-table-footnote.md`

类型前缀约定：

- `PT`：纯文本
- `HT`：HTML 富文本
- `MD`：Markdown / GFM
- `CD`：代码文本
- `MT`：数学公式
- `WB`：网页正文
- `OF`：Office 富文本 / Office 导出片段
- `IM`：图片 / 图片资源
- `FL`：文件 / 文件卡片
- `ND`：节点 / 节点混用
- `DR`：画图 / 连线 / 手绘兼容观察
- `MX`：混合内容

## 4. 样本收录规则

每个样本必须在 `fixture-index.json` 中有一条记录。

每条记录至少包含：

- `id`
- `category`
- `source_kind`
- `entry_modes`
- `file`
- `notes`
- `current_chain_expectation`
- `target_chain_expectation`

## 5. 样本新增规则

新增样本时必须同步完成：

1. 把原始输入文件放入对应子目录
2. 在 `fixture-index.json` 中登记元数据
3. 必要时在 `current-chain-baseline.md` 中补当前表现说明
4. 若来源于真实 bug，需在 `notes` 中标明问题背景

## 6. 样本维护规则

- 不直接覆盖已有样本语义，尽量新增新样本
- 一个样本只表达一个主问题，避免单样本承载过多边界
- 尽量保留“原始输入”而不是只保留截图描述
- 真实场景优先于手工构造场景

## 7. 现有画布元素纳入规则

样本库中涉及现有画布元素时，按三层纳入：

- 主线纳入：
  - 文本
  - 图片
  - 文件卡片
  - 代码块
  - 表格
  - 数学公式
- 兼容观察：
  - flow 节点
  - 节点文本
  - 备注类文本
- 暂不纳入主线：
  - 手绘
  - 几何图形
  - 连线 / 箭头

说明：

- “兼容观察”样本必须进入索引，但不代表第一阶段就深改协议
- “暂不纳入主线”样本仍应被记录，用于后续复制 / 导出 / 选中兼容观察
