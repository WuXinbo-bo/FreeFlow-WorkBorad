# FreeFlow Canvas Engine — 混合语言重构框架方案

> **版本**: v0.1-draft  
> **日期**: 2026-05-30  
> **定位**: 首席架构师级别技术方案  
> **范围**: 无限画布引擎 (`canvas2d-core`) 重构，不含 AI Mirror 等其他子系统

---

## 0. 现状诊断

### 0.1 项目规模

| 维度 | 现状 |
|------|------|
| 引擎总代码量 | ~73K 行 JavaScript (195 个文件) |
| 核心单文件 | `createCanvas2DEngine.js` — 24,962 行，承载全部引擎逻辑 |
| 运行时 | Electron 41 + React 19, 纯 Canvas2D, 无 WebGL, 无 WASM |
| 线程模型 | **单线程** — 所有渲染、命中测试、布局计算均在主线程 |
| Web Worker | 仅 2 个 (KaTeX 数学公式 + Prism 语法高亮)，与渲染无关 |
| 状态管理 | 自研 pub/sub store，直接可变 mutation + JSON 深拷贝快照 |
| 序列化 | `JSON.parse(JSON.stringify())` 全量深拷贝用于 undo/redo |

### 0.2 性能瓶颈热力图

基于代码审计，按严重程度排序：

| 优先级 | 瓶颈 | 现状代码 | 根因 |
|--------|------|---------|------|
| **P0** | 渲染管线主线程阻塞 | `renderer.js` 每帧合成 5 层 canvas | 所有 Canvas2D draw calls 独占主线程 |
| **P0** | 巨型单文件锁死并行化 | `createCanvas2DEngine.js` 24K 行 | 无法按模块独立优化/测试 |
| **P1** | 空间索引全量重建 | `hitTestSpatialIndex.js` / `sceneIndex.js` | 基于 Grid 的简单索引，change 时全量 rebuild |
| **P1** | 深拷贝开销 | `store.js` + `history.js` | undo/redo snapshot 全量 clone board state |
| **P1** | 叠加层 DOM 管理 | `overlayVirtualizer.js` 180+ DOM 节点 | 富文本/公式/代码编辑器同时存在于 DOM |
| **P2** | 文本度量 | `textLayout/` 689 行 | 逐元素调用 Canvas2D `measureText()` |
| **P2** | 导入管线 | 60 个文件 ~15K 行 | 多格式解析全部在主线程同步执行 |

### 0.3 核心结论

当前引擎的性能天花板已由 **JavaScript 单线程模型** 锁定。即使做尽 JS 层优化（已经做了 tile cache、LOD、viewport culling、interaction gate 等），也无法突破：

1. **渲染无法并行** — Canvas2D context 不可跨线程共享
2. **计算无法 offload** — 空间索引、碰撞检测、布局计算全部阻塞主线程
3. **内存无法精细管控** — JS GC 停顿不可控，大数组拷贝开销线性增长

引入系统级语言是正确方向，但关键不在于"用 Rust 重写 JS"，而在于 **用原生语言接管 JS 不擅长的部分，保留 JS 在 UI 编排上的优势**。

---

## 1. 分层架构：Core / Glue / Shell

### 1.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        Shell Layer                          │
│  Electron App Shell · React UI Overlay · Tool Palettes     │
│  Dialogs · Settings · Tutorial · Export UI                  │
│  [语言: JavaScript/JSX, 框架: React 19]                     │
├─────────────────────────────────────────────────────────────┤
│                         Glue Layer                          │
│  Engine Controller · State Bridge · Event Router            │
│  DOM Overlay Manager · Board I/O · History Controller       │
│  Import/Export Orchestrator · Collaboration Adapter         │
│  [语言: TypeScript, 运行时: Main Thread + Worker Pool]      │
├─────────────────────────────────────────────────────────────┤
│                         Core Layer                          │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐    │
│  │  Spatial      │ │  Rendering   │ │  Physics &        │    │
│  │  Index        │ │  Pipeline    │ │  Layout           │    │
│  │  (R-tree)     │ │  (Tile+LOD)  │ │  (Force-Directed) │    │
│  ├─────────────┤ ├──────────────┤ ├───────────────────┤    │
│  │  Hit Test     │ │  Geometry    │ │  Text Shaping     │    │
│  │  Engine       │ │  Operations  │ │  & Measurement    │    │
│  ├─────────────┤ ├──────────────┤ ├───────────────────┤    │
│  │  Binary       │ │  Board       │ │  Diff & Patch     │    │
│  │  Serialization│ │  Codec       │ │  Engine           │    │
│  └─────────────┘ └──────────────┘ └───────────────────┘    │
│  [语言: Rust, 编译目标: WASM + Native FFI]                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 各层职责边界

#### Core Layer (Rust → WASM)

**原则**: 纯计算，零 DOM 依赖，零 I/O，确定性输出。所有输入/输出通过值类型传递。

| 模块 | 职责 | 对应现有代码 | 重写收益 |
|------|------|-------------|---------|
| **spatial-index** | R-tree 空间索引，支持增量插入/删除/区域查询 | `hitTestSpatialIndex.js` (329行) + `sceneIndex.js` (462行) | 查询 O(log n) vs Grid O(n)，增量更新避免全量 rebuild |
| **hit-test** | 高效碰撞检测：point-in-shape, rect-marquee, handle detection | `hitTest.js` (209行) | 与 spatial-index 集成，批量查询可并行 |
| **geometry** | 点/线/矩形/贝塞尔曲线运算，包围盒计算，距离计算 | 散布在 `elements/*.js` | SIMD 加速几何运算，避免 JS 数字精度损失 |
| **board-codec** | 二进制序列化/反序列化 (FlatBuffers)，替代 JSON | `store.js` + board file I/O | 序列化速度 10x+，体积减少 60-80% |
| **diff-engine** | 结构化 diff + patch (CRDT-ready) | `history.js` 基于 JSON.stringify 的 snapshot/patch | 增量 undo/redo，内存占用降一个数量级 |
| **text-shaper** | 字形整形 + 文本度量 (swash/fontique) | `textLayout/measureTextElementLayout.js` (689行) | 避免逐元素 Canvas2D measureText 调用 |

#### Glue Layer (TypeScript)

**原则**: 编排 Core 与 UI 之间的数据流，管理生命周期，处理 I/O。**不包含任何渲染逻辑和计算逻辑。**

| 模块 | 职责 | 对应现有代码 |
|------|------|-------------|
| **engine-controller** | 引擎生命周期，帧调度，工具路由 | `createCanvas2DEngine.js` 中的工具/模式管理 |
| **state-bridge** | Core WASM ↔ React UI 的状态同步，响应式信号 | `store.js` (347行) + `reactBridge.js` (241行) |
| **render-scheduler** | rAF 调度，dirty region 合并，帧预算控制 | `renderScheduler.js` (67行) + `dirtyRegionManager.js` (77行) |
| **overlay-manager** | DOM overlay 池化、预算控制、生命周期 | `overlayVirtualizer.js` + `overlayBudgetManager.js` |
| **import-orchestrator** | 多格式导入编排，Worker 池调度 | `import/` 60 个文件 |
| **history-controller** | undo/redo 栈管理，补丁收集 | `history.js` (354行) |
| **board-io** | 文件读写，localStorage，版本迁移 | `store.js` 持久化部分 |

#### Shell Layer (JavaScript/JSX, React 19)

**原则**: 纯展示层。只包含 React 组件、样式、用户交互事件监听。

| 模块 | 职责 |
|------|------|
| **ToolPalette** | 工具栏、快捷键绑定 |
| **CanvasOverlay** | React 组件叠加在 canvas 上（对话框、设置面板等） |
| **Navigator** | 画布目录/书签 |
| **SearchOverlay** | 搜索 UI |
| **ExportUI** | 导出预览/配置对话框 |
| **Tutorial** | 新手引导 |

### 1.3 分层依赖规则

```
Shell → Glue → Core (单向依赖，禁止反向)
```

- **Core 不依赖任何 Web API** — 可在 Node.js / 浏览器 / WASM 中统一运行
- **Glue 通过 message 与 Core 通信** — Core 运行在 Worker 中，不允许直接 import
- **Shell 通过 Glue 暴露的 hook 接口操作** — 永远不直接调用 Core

违反任何一条 = 架构腐化，CI 拦截。

### 1.4 UI 不变原则

本次重构 **不改动用户可见的任何 UI 和交互行为**。所有变更均发生在水面以下。

| 维度 | 是否改动 | 说明 |
|------|---------|------|
| React 组件 (`ui/index.jsx`) | **不改** | 工具栏、对话框、搜索面板等保持原样，仅做 JSX → TSX 类型标注迁移（纯语法，零功能变更） |
| 交互行为 | **不改** | 平移、缩放、拖拽、框选、快捷键等操作方式完全一致 |
| 状态订阅方式 | **不改** | React 组件仍通过 `onStateChange` 回调接收状态快照，订阅 store snapshot 渲染 |
| 视觉样式 | **不改** | Canvas2D 绘制结果在像素级别一致，LOD 降级策略、配色、字体不变 |
| 性能表现 | **提升** | 同样操作下帧率显著提升、响应延迟降低，尤其在大量 items 场景 |

**一句话总结**: 用户打开应用看到的界面和操作方式完全一样，只是当画布上 item 数量上去后不再卡顿。

---

## 2. 跨语言通信机制选型

### 2.1 方案对比

| 机制 | 延迟 | 吞吐量 | 适用场景 | 本项目适用性 |
|------|------|--------|---------|-------------|
| **WASM Direct Call** | ~1-10μs | 高 | 同线程同步计算 | Core 内部热路径 |
| **SharedArrayBuffer + Atomics** | ~0.1μs | 极高 | 大数据零拷贝共享 | 渲染缓冲区、tile cache |
| **Web Worker + postMessage** | ~50-200μs | 中 | 异步计算任务 | Core 整体隔离运行 |
| **Comlink RPC** | ~100-500μs | 中 | Worker 上的结构化 API | Glue ↔ Core 编排 |
| **Native FFI (via koffi)** | ~1-5μs | 极高 | Native Rust 进程直调 | Electron 主进程特殊路径 |
| **WebSocket / IPC** | ~1-5ms | 低 | 进程间通信 | **不推荐，开销太大** |

### 2.2 推荐方案：分层通信策略

```
                    ┌───────────────────────────┐
                    │      Main Thread           │
                    │                            │
                    │  ┌─────────┐ ┌──────────┐  │
                    │  │ React   │ │ Glue     │  │
                    │  │ UI      │ │ Layer    │  │
                    │  └────┬────┘ └────┬─────┘  │
                    │       │           │        │
                    │       │  Comlink  │        │
                    │       │  RPC      │        │
                    └───────┼───────────┼────────┘
                            │           │
                    ┌───────┼───────────┼────────┐
                    │       │  Worker   │        │
                    │       ▼           ▼        │
                    │  ┌─────────────────────┐   │
                    │  │    Core Engine      │   │
                    │  │  (WASM Module)      │   │
                    │  │                     │   │
                    │  │ ┌─────────────────┐ │   │
                    │  │ │ Shared Memory   │ │   │
                    │  │ │ (SAB + Ringbuf) │ │   │
                    │  │ └─────────────────┘ │   │
                    │  └─────────────────────┘   │
                    └────────────────────────────┘
```

#### 通道 A: WASM Direct Call（同步热路径）

用于 **Core 内部** 的高频计算调用，每次调用开销 <10μs：

```typescript
// Glue 层调用 Core WASM 模块 — 同线程，同步返回
const spatialIndex = new WasmSpatialIndex();
spatialIndex.insert(itemId, left, top, right, bottom);   // O(log n)
const candidates = spatialIndex.query(viewportRect);       // O(log n) + k

const hitResult = wasmHitTest.pointTest(items, x, y, scale);
const bounds = wasmGeometry.getElementBounds(item);
```

**何时用**: 每帧调用 100+ 次的热路径函数（hit test、bounds 计算、空间查询）。

#### 通道 B: SharedArrayBuffer 零拷贝（渲染数据共享）

用于 **Core Worker ↔ Main Thread** 之间的大量结构化数据共享：

```typescript
// 初始化：创建共享内存环形缓冲区
const RING_SIZE = 4 * 1024 * 1024; // 4MB
const sab = new SharedArrayBuffer(RING_SIZE);
const ringBuffer = new RingBuffer(sab);

// Core Worker 写入渲染命令
ringBuffer.writeUint8(OP_DRAW_RECT);
ringBuffer.writeFloat32(x);
ringBuffer.writeFloat32(y);
ringBuffer.writeFloat32(w);
ringBuffer.writeFloat32(h);
ringBuffer.writeUint32(color);

// Main Thread 读取并执行 Canvas2D 绘制
Atomics.wait(ringBuffer.status, OFFSET_READY, 0); // 等待数据就绪
while (ringBuffer.hasData()) {
  const op = ringBuffer.readUint8();
  switch (op) {
    case OP_DRAW_RECT:
      const [x, y, w, h, color] = [ringBuffer.readFloat32(), ...];
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      break;
    // ...
  }
}
```

**何时用**: 渲染命令流、tile 像素数据、大型 item 数组的批量传输。

#### 通道 C: Comlink RPC（结构化 API）

用于 **Glue ↔ Core** 之间的异步编排调用：

```typescript
// main-thread.ts (Glue)
import { wrap } from "comlink";

const coreEngine = wrap<CoreEngineAPI>(
  new Worker("./core-worker.js", { type: "module" })
);

// 异步调用，自动序列化/反序列化
const board = await coreEngine.loadBoard(arrayBuffer);
const tiles = await coreEngine.renderTiles(viewport, scale);
await coreEngine.applyDiff(oldState, diff);
```

**何时用**: 低频 (<100次/秒) 的结构化操作 — 加载文件、应用变更、触发批量计算。

### 2.3 通信开销预算

| 通道 | 单次开销 | 每帧预算 | 最大调用次数/帧 |
|------|---------|---------|----------------|
| WASM Direct | ~5μs | 1ms | 200 |
| SAB Ring Buffer | ~0.1μs | 0.5ms | 5000 |
| Comlink RPC | ~200μs | 2ms | 10 |

**帧预算**: 16.6ms (60fps) 中，通信总开销控制在 **<3.5ms (21%)** 以内。

---

## 3. 模块化 Core 详解

### 3.1 Rust Crate 拓扑

```
canvas-core/
├── Cargo.toml                    # workspace root
├── crates/
│   ├── spatial/                  # crate: canvas-spatial
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── rtree.rs          # R-tree 空间索引
│   │   │   ├── grid.rs           # 粗粒度 Grid 辅助索引
│   │   │   └── query.rs          # 查询接口: point, rect, radius
│   │   └── benches/
│   │       └── spatial_bench.rs
│   │
│   ├── geometry/                 # crate: canvas-geometry
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── primitives.rs     # Vec2, Rect, Transform
│   │   │   ├── bounds.rs         # 包围盒计算
│   │   │   ├── distance.rs       # 点到线段距离、最近点
│   │   │   ├── path.rs           # 贝塞尔曲线、路径运算
│   │   │   └── boolean.rs        # 路径布尔运算 (裁剪、合并)
│   │   └── benches/
│   │
│   ├── hittest/                  # crate: canvas-hittest
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── point_test.rs     # 点击检测
│   │   │   ├── rect_select.rs    # 矩形框选
│   │   │   └── handle.rs         # 控制手柄检测
│   │   └── tests/
│   │
│   ├── codec/                    # crate: canvas-codec
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── flatbuf_schema/   # FlatBuffers IDL 定义
│   │   │   ├── encode.rs         # Board → Binary
│   │   │   ├── decode.rs         # Binary → Board
│   │   │   └── migrate.rs        # 版本迁移
│   │   └── build.rs
│   │
│   ├── diff/                     # crate: canvas-diff
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── lcs.rs            # 最长公共子序列
│   │   │   ├── patch.rs          # 应用补丁
│   │   │   └── history_stack.rs  # 双端 undo/redo 栈
│   │   └── tests/
│   │
│   ├── layout/                   # crate: canvas-layout
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── text_shaper.rs    # 文本整形 (swash)
│   │   │   ├── text_measure.rs   # 文本度量
│   │   │   ├── force_directed.rs # 力导向布局 (思维导图)
│   │   │   └── flow_layout.rs    # 流程图自动布局
│   │   └── benches/
│   │
│   └── wasm-bindings/            # crate: canvas-wasm
│       ├── src/
│       │   ├── lib.rs            # #[wasm_bindgen] 入口
│       │   ├── spatial_api.rs    # 空间索引 JS binding
│       │   ├── geometry_api.rs   # 几何运算 JS binding
│       │   ├── codec_api.rs      # 编解码 JS binding
│       │   └── memory.rs         # WASM 内存管理
│       └── Cargo.toml            # 依赖 wasm-bindgen, js-sys, web-sys
│
├── benches/                      # 性能基准测试
│   ├── spatial_throughput.rs
│   ├── codec_throughput.rs
│   └── layout_throughput.rs
│
└── tests/                        # 集成测试
    └── integration/
```

### 3.2 核心数据结构设计

```rust
// ── Board 模型 (FlatBuffers schema 定义，此处展示 Rust struct) ──

#[derive(Clone, Copy, PartialEq)]
pub struct Rect {
    pub left: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
}

pub struct Item {
    pub id: u64,                    // compact ID (非 UUID)
    pub item_type: ItemType,
    pub bounds: Rect,
    pub data: ItemData,             // 枚举，按类型分发
    pub z_index: i32,
    pub parent_id: Option<u64>,     // 分组/嵌套关系
    pub flags: u32,                 // 位标志: visible, locked, selected...
}

pub enum ItemType {
    Text,
    Image,
    Shape(ShapeKind),
    FlowNode,
    FlowEdge,
    MindNode,
    MindRelationship,
    Table,
    CodeBlock,
    MathBlock,
    FileCard,
}

// ── 空间索引 ──

pub struct SpatialIndex {
    rtree: RTree<ItemEntry>,        // 主索引: R-tree
    grid: GridOverlay,              // 辅助: 粗粒度 Grid (热路径加速)
    id_map: HashMap<u64, ItemEntry>, // ID → entry 映射
    generation: u64,                 // 版本号 (替代 WeakMap 引用检查)
}

pub struct ItemEntry {
    pub id: u64,
    pub bounds: Rect,
    pub expanded_bounds: Rect,  // 扩展后的查询边界
    pub item_type: ItemType,
}

// ── 渲染命令 (Worker → Main Thread via SharedArrayBuffer) ──

#[repr(u8)]
pub enum RenderOp {
    Clear = 0,
    FillRect,
    StrokeRect,
    DrawPath,
    DrawText,
    DrawImage,
    DrawLine,
    DrawBezier,
    SetClip,
    RestoreClip,
    CompositeLayer,
}

// ── Diff 引擎 ──

pub struct Patch {
    pub sequence: u32,
    pub operations: Vec<PatchOp>,
}

pub enum PatchOp {
    Insert { item: Item },
    Update { id: u64, field: u16, value: Value },
    Remove { id: u64 },
    Reorder { id: u64, new_z_index: i32 },
}
```

### 3.3 增量空间索引策略

**现状问题**: 每次 `board.items` 变更后，两个空间索引全量 rebuild。

**Rust 方案**: R-tree 增量更新 + generation 校验：

```rust
impl SpatialIndex {
    /// 增量插入 O(log n)
    pub fn insert(&mut self, item: &Item) {
        let entry = ItemEntry::from_item(item);
        self.rtree.insert(entry.clone());
        self.id_map.insert(item.id, entry);
        self.generation += 1;
    }

    /// 增量删除 O(log n)
    pub fn remove(&mut self, id: u64) -> bool {
        if let Some(entry) = self.id_map.remove(&id) {
            self.rtree.remove(&entry);
            self.generation += 1;
            true
        } else {
            false
        }
    }

    /// 增量更新: remove + insert, 复合复杂度 O(log n)
    pub fn update(&mut self, item: &Item) {
        self.remove(item.id);
        self.insert(item);
    }

    /// 批量更新: 接受 diff，批量操作避免多次 rebalance
    pub fn apply_batch(&mut self, removes: &[u64], inserts: &[Item]) {
        for id in removes {
            if let Some(entry) = self.id_map.remove(id) {
                self.rtree.remove(&entry);
            }
        }
        for item in inserts {
            let entry = ItemEntry::from_item(item);
            self.rtree.insert(entry.clone());
            self.id_map.insert(item.id, entry);
        }
        self.generation += 1;
    }

    /// 视口查询: O(log n + k) — k 为结果数
    pub fn query_viewport(&self, rect: Rect, margin: f32) -> Vec<&ItemEntry> {
        let expanded = rect.expanded(margin);
        self.rtree
            .search(&expanded)
            .collect()
    }
}
```

**收益估算** (10,000 个 items):

| 操作 | JS Grid (现) | Rust R-tree (新) | 加速比 |
|------|-------------|------------------|--------|
| 全量 rebuild | ~15ms | N/A (增量) | ∞ |
| 单个 insert | N/A (需 rebuild) | ~2μs | — |
| 单个 remove | N/A (需 rebuild) | ~3μs | — |
| 视口查询 (100 结果) | ~3ms | ~50μs | 60x |
| 批量更新 (100 items) | ~15ms (rebuild) | ~200μs | 75x |

---

## 4. Worker 线程架构

### 4.1 线程模型

```
┌─ Main Thread ────────────────────────────────────────────┐
│                                                          │
│  React UI ──→ Glue Layer ──→ Render Command Queue        │
│                              ↓                           │
│                    ┌─── Comlink RPC ───┐                 │
│                    │                    │                 │
├─ Core Worker ─────┼────────────────────┼─────────────────┤
│  WASM Module      │                    │                 │
│                   ▼                    ▼                 │
│  ┌──────────────────────────────────────────────┐        │
│  │              Core Engine                     │        │
│  │                                              │        │
│  │  ┌─────────────┐  ┌──────────────────────┐  │        │
│  │  │ Spatial      │  │  Tile Renderer       │  │        │
│  │  │ Index        │  │  (OffscreenCanvas)   │  │        │
│  │  │ (R-tree)     │  │                      │  │        │
│  │  └─────────────┘  └──────────────────────┘  │        │
│  │  ┌─────────────┐  ┌──────────────────────┐  │        │
│  │  │ Hit Test     │  │  Diff & History      │  │        │
│  │  │ Engine       │  │  Stack               │  │        │
│  │  └─────────────┘  └──────────────────────┘  │        │
│  │  ┌─────────────┐  ┌──────────────────────┐  │        │
│  │  │ Text Shaper  │  │  Board Codec         │  │        │
│  │  │              │  │  (FlatBuffers)       │  │        │
│  │  └─────────────┘  └──────────────────────┘  │        │
│  │                                              │        │
│  │  SharedArrayBuffer (渲染命令环形缓冲区)        │        │
│  └──────────────────────────────────────────────┘        │
│                    │                                     │
│  ┌─ IO Worker Pool ────────────────────────┐             │
│  │  Worker 1: Import (HTML/MD/Code parse)  │             │
│  │  Worker 2: Export (PDF/DOCX render)     │             │
│  │  Worker 3: Board Codec (decode/encode)  │             │
│  └──────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────┘
```

### 4.2 关键设计决策

#### 为什么 Core 和 Main Thread 分离？

| 理由 | 说明 |
|------|------|
| **主线程保护** | Core 的重计算不会阻塞 UI 交互和 React 渲染 |
| **tile 渲染并行化** | Core Worker 可使用 OffscreenCanvas 独立渲染 tile |
| **WASM 隔离** | WASM panic 不会 crash 整个应用，Worker 可重启 |
| **增量更新友好** | Core 可在后台持续处理大 batch diff，通过 SAB 推送结果 |

#### 为什么不把 Core 拆成多个 Worker？

- **通信开销倍增** — 每增加一个 Worker，跨 Worker 协调开销上升
- **SAB 共享复杂度** — 多 Worker 共享同一块内存需要精细的锁协议
- **WASM 模块加载** — 每个 Worker 需要独立实例化 WASM 模块，内存翻倍

**结论**: 单 Core Worker + 单 WASM 实例 + Ring Buffer 模式是最佳平衡点。IO Worker Pool 作为补充，处理非实时的 I/O 密集任务。

### 4.3 渲染管线重设计

**现状**: 单线程同步渲染 5 层 canvas → 主线程阻塞。

**新方案**: 分离计算与绘制。

```
Core Worker (计算)                      Main Thread (绘制)
─────────────────                       ─────────────────
1. 接收 viewport + dirty regions
2. R-tree 查询可见 items
3. LOD 判定 (降级策略)
4. 计算 tile dirty 标记
5. 生成 RenderOp 指令序列              → 6. 读取 SAB Ring Buffer
6. 写入 SharedArrayBuffer              → 7. 执行 Canvas2D draw calls
                                        → 8. 合成 5 层 canvas
```

**关键优化**: Core Worker 只负责"画什么、在哪里"，Main Thread 只负责"怎么画"。计算密集的 culling、LOD、tile 管理全部在 Worker 中完成，主线程只做轻量的 Canvas2D API 调用。

---

## 5. 迁移策略：渐进式重构

### 5.1 不推荐的方案

**一次性重写** — 73K 行 JS 代码不可能一次性迁移到 Rust。风险极高，周期过长，且会丢失业务逻辑的隐性知识。

### 5.2 推荐方案：Strangler Fig 模式

```
Phase 1 (Month 1-2)    Phase 2 (Month 3-4)    Phase 3 (Month 5-6)
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Rust Core:       │    │ Rust Core:       │    │ Rust Core:       │
│ + spatial        │    │ + spatial        │    │ + spatial        │
│ + geometry       │    │ + geometry       │    │ + geometry       │
│ + hittest        │    │ + hittest        │    │ + hittest        │
│ + codec          │    │ + codec          │    │ + codec          │
│                  │    │ + diff           │    │ + diff           │
│ JS Engine:       │    │ + layout         │    │ + layout         │
│ (unchanged)      │    │                  │    │                  │
│                  │    │ JS Engine:       │    │ TS Glue Layer:   │
│ Glue: shim only  │    │ (partial decomp)│    │ (full replace)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### Phase 1: 基础设施 + 独立模块替换 (8 周)

**目标**: 建立 Rust/WASM 构建管线，替换无副作用的纯计算模块。

| 任务 | 输出 | 风险 |
|------|------|------|
| Rust workspace 初始化 | `canvas-core/` crate 结构 | 低 |
| WASM 构建管线 (wasm-pack / wasm-bindgen) | CI 可产出 `canvas_core_bg.wasm` | 低 |
| `canvas-spatial` crate | R-tree 实现 + benchmark | 低 (独立模块) |
| `canvas-geometry` crate | 基础几何运算 | 低 (独立模块) |
| JS shim 层 | `spatial-index.wasm.js` — 与现有 JS API 兼容的 wrapper | 中 |
| A/B 切换开关 | `localStorage` flag 控制使用 JS 还是 WASM 版本 | 低 |

**验收标准**: WASM spatial index 在 10K items 场景下查询性能 >5x 现有 JS 版本。

#### Phase 2: 渲染管线解耦 + 核心模块扩展 (8 周)

**目标**: 将 `createCanvas2DEngine.js` 拆分为独立 TypeScript 模块，Core Worker 上线。

| 任务 | 输出 | 风险 |
|------|------|------|
| `createCanvas2DEngine.js` 拆分 | 5-8 个 TypeScript 模块 | **高** (最大风险点) |
| Core Worker 启动 | `core-worker.ts` + Comlink RPC 骨架 | 中 |
| `canvas-hittest` crate | 利用 R-tree 的 hit test | 低 |
| `canvas-codec` crate | FlatBuffers encode/decode | 中 |
| SharedArrayBuffer 渲染通道原型 | Ring Buffer + RenderOp | 中 |
| 渲染管线拆分: 计算与绘制分离 | Worker 负责 culling, Main 负责 draw | **高** |

**验收标准**: 核心交互（平移、缩放、选择）在 10K items 下帧率 >55fps。

#### Phase 3: Glue 层完整替换 (8 周)

**目标**: JS Engine 完全退场，TypeScript Glue Layer 成为唯一编排层。

| 任务 | 输出 | 风险 |
|------|------|------|
| TypeScript Glue 完整实现 | `engine-controller`, `state-bridge`, `render-scheduler` 等 | 中 |
| `canvas-diff` crate | 结构化 diff + undo/redo | 中 |
| `canvas-layout` crate | 文本整形 + 力导向布局 | 中 (复杂度高) |
| IO Worker Pool | Import/Export Worker 池 | 低 |
| 性能回归测试套件 | 自动化 benchmark pipeline | 低 |
| Shell 层 React 组件迁移至 TSX | 类型安全 | 低 |

**验收标准**: 全功能替代，所有 JS Engine 代码移除，无功能回归。

### 5.3 构建管线

```
canvas-core/
├── Cargo.toml
├── crates/
│   └── wasm-bindings/
│       └── Cargo.toml
├── wasm-pack.config.toml
└── package.json          # npm workspace 集成

# 构建流程:
# 1. Rust → WASM
wasm-pack build --target web --release crates/wasm-bindings

# 2. 产物自动复制到前端
cp pkg/canvas_core_bg.wasm → public/wasm/

# 3. JS/TS 前端构建
esbuild (现有) + wasm-bindgen 生成的 JS glue

# 4. 联合构建
npm run build:wasm && npm run build:frontend
```

**Electron 集成**: WASM 文件作为 static asset 加载，无需 Node.js native addon（避免 koffi 开销）。特殊场景（如文件系统 I/O 密集操作）可选用 koffi 调用 Native CLI。

---

## 6. 风险矩阵与缓解策略

| 风险 | 等级 | 缓解策略 |
|------|------|---------|
| WASM 内存管理泄漏 | 中 | 使用 Rust 所有权系统 + WASM GC (proposal)；定期 `wasm_heap.size()` 监控 |
| SAB 兼容性 (部分环境不支持) | 低 | 渐进降级：SAB 不可用时退化为 postMessage；Electron 环境默认支持 |
| Worker 崩溃恢复 | 中 | Core Worker 持有不可变 board snapshot；崩溃时从 Glue 层恢复并重启 Worker |
| WASM 初始加载延迟 | 中 | 预加载 (app 启动时后台实例化)；WASM 体积控制 <2MB；gzip 后 <500KB |
| 调试困难度上升 | 高 | Rust 端使用 `console_error_panic_hook` 输出到 DevTools；WASM sourcemap (wasm-pack debug) |
| 二进制协议兼容性 | 中 | FlatBuffers 天然前向兼容；版本字段 + migration 模块 |
| 团队 Rust 学习曲线 | 高 | Phase 1 安排 pair programming；Rust 代码以独立 crate 为单位 review |

---

## 7. 性能目标 (Success Metrics)

### 7.1 帧率目标

| 场景 | 现状 (JS) | 目标 (Rust Core) | 测量方式 |
|------|----------|-----------------|---------|
| 空画布平移/缩放 | 60fps | 120fps | requestAnimationFrame 间隔 |
| 1K items 平移 | ~55fps | 120fps | 同上 |
| 5K items 平移 | ~30fps | >60fps | 同上 |
| 10K items 平移 | <15fps (卡顿) | >55fps | 同上 |
| 10K items 框选 | >500ms 响应 | <50ms 响应 | hit test 延迟 |
| 撤销/重做 (批量) | ~200ms | <20ms | patch 应用时间 |
| Board 加载 (50MB) | ~3s | <500ms | decode 时间 |

### 7.2 内存目标

| 指标 | 现状 | 目标 |
|------|------|------|
| 1K items 基线内存 | ~80MB | <30MB |
| 空间索引内存/1K items | ~12MB | <1MB |
| undo/redo 栈 (80 步) | ~50MB | <5MB |

### 7.3 WASM 模块目标

| 指标 | 目标 |
|------|------|
| WASM 体积 (gzip) | <500KB |
| 首次实例化时间 | <50ms |
| 100K 次 API 调用吞吐 | >100M ops/sec |

---

## 8. 长期架构演进路线

```
Phase 3 完成后 ────────────────────────────────────────────→

Q3 2026          Q4 2026          Q1 2027          Q2 2027
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ WASM Core │    │ WebGL2   │    │ Multi-   │    │ Collab-  │
│ Canvas2D  │    │ 渲染层   │    │ Worker   │    │ orative  │
│ 管线      │    │ 升级     │    │ 并行渲染 │    │ CRDT     │
│           │    │          │    │          │    │ 集成     │
│ + SAB 通道│    │ Tile GPU │    │ 动态     │    │          │
│ + R-tree  │    │ 加速     │    │ Worker   │    │ diff-engine│
│ + Codec   │    │          │    │ 调度     │    │ → CRDT   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**Phase 4 (远期)**: 将渲染从 Canvas2D 升级到 WebGL2/WebGPU — Rust Core 天然兼容 GPU 计算管线 (wgpu)，这是未来性能天花板的第二次突破。

---

## 附录 A: 项目目录映射

将现有 JS 代码映射到目标 Rust/TS 模块：

| 现有 JS 文件 | 目标层 | 目标模块 |
|-------------|--------|---------|
| `createCanvas2DEngine.js` | Glue | `engine-controller` (TS) + 拆分到多个 Core crate |
| `renderer.js` | Core + Glue | Worker 渲染调度 (Core) + Canvas2D 绘制 (Main Thread Glue) |
| `hitTestSpatialIndex.js` | Core | `canvas-spatial` crate |
| `scene/sceneIndex.js` | Core | `canvas-spatial` crate (合并) |
| `hitTest.js` | Core | `canvas-hittest` crate |
| `store.js` | Glue | `state-bridge` (TS) + `canvas-codec` (Rust) |
| `history.js` | Core + Glue | `canvas-diff` crate + `history-controller` (TS) |
| `textLayout/` | Core | `canvas-layout` crate |
| `elements/*.js` | Core | `canvas-geometry` + `canvas-hittest` |
| `render/tileSceneCache.js` | Glue | Tile cache 管理逻辑留在 TS，像素数据通过 SAB |
| `render/dirtyRegionManager.js` | Glue | `render-scheduler` (TS) |
| `overlay/` | Glue | `overlay-manager` (TS) |
| `reactBridge.js` | Glue | `state-bridge` (TS) |
| `ui/index.jsx` | Shell | 保持 React，迁移至 TSX |
| `import/` | Glue + Worker | `import-orchestrator` (TS) + IO Worker Pool |
| `export/` | Glue + Worker | Export IO Worker |
| `canvasNavigator.js` | Glue | 保持 TS (与 Core 无关) |

---

## 附录 B: 技术选型决策记录

| 决策 | 选择 | 被否决方案 | 原因 |
|------|------|-----------|------|
| 系统语言 | **Rust** | C++, Zig, C | 所有权系统消除内存安全问题；wasm-bindgen 生态成熟；零成本抽象 |
| WASM 绑定 | **wasm-bindgen + wasm-pack** | Emscripten, AssemblyScript | Rust 官方推荐路径；tree-shaking 友好；生成的 JS glue 最小 |
| 序列化格式 | **FlatBuffers** | Protocol Buffers, MessagePack, bincode | 零拷贝反序列化；schema 演进兼容；Electron/浏览器双端支持 |
| RPC 层 | **Comlink** | Hand-written postMessage, gRPC-web | 类型安全的 RPC；支持 Proxy 透明调用；体积小 (<5KB) |
| 构建工具 | **wasm-pack** + esbuild | wasm-bindgen-cli, rollup | 一站式 Rust→WASM 构建；npm 生态集成好 |
| 空间索引 | **R-tree** | k-d tree, BVH, Quadtree | 2D 空间索引的工业标准；增量操作 O(log n)；Rust crate `rstar` 成熟可用 |
| 文本整形 | **swash** | HarfBuzz (via FFI), cosmic-text | 纯 Rust 实现；字体查询 + 字形整形一体；无需 C 依赖 |
| CRDT (远期) | **automerge** | Yjs (JS), diamond-types | Rust 原生实现；操作变换 (OT) + CRDT 混合；schema-aware |

---

*本方案为 v0.1 草案，待架构委员会评审后进入详细设计阶段。*
