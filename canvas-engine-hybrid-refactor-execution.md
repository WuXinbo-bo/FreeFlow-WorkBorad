# FreeFlow Canvas Engine — 混合语言重构执行规划书

> **基于**: `canvas-engine-hybrid-refactor.md` v0.1 草案  
> **视角**: 首席工程师落地执行  
> **定位**: 从"地图"到"怎么走"  
> **日期**: 2026-05-30

---

## 0. 对草案的总体评价

先说结论：这份草案在架构设计上是 **B+** 级别的，分层清晰、技术选型合理、风险识别到位。但作为可执行的规划书，它有三个关键缺陷：

1. **迁移切入点有误** — Phase 1 优先做 spatial/geometry crate 是技术上正确但工程上错误的选择。用户在 Phase 1 结束后感知不到任何变化，团队士气是个问题。
2. **严重低估了 `createCanvas2DEngine.js` 拆分的难度** — 草案把它放在 Phase 2 作为一个任务项列出，但这个 24,962 行的 God Object 拆分是整个重构的 **核心路径**，应该从 Phase 1 就开始。
3. **遗漏了测试策略** — 在一个 73K 行的项目上做渐进式重构，没有像素级回归测试就是在裸奔。

下面逐节展开。

---

## 1. 草案遗漏的风险与补充

### 1.1 缺失：测试基础设施是第一优先级

草案完全没有提到测试策略。在一个要做渐进式替换的项目里，没有测试就是没有安全网。

**我建议在写第一行 Rust 之前，先做这件事**：

| 任务 | 做什么 | 为什么 |
|------|--------|--------|
| **截图回归基线** | 对核心场景（空画布、1K/5K/10K items、缩放、平移、框选、undo/redo、导入/导出）拍摄截图基准 | 每次替换模块后对比，确保渲染零回归 |
| **帧率基线** | 用 Performance API 采集关键操作的帧率和帧时间分布 | 有数据才能证明重构有效 |
| **交互录制** | 用 Playwright 录制核心交互流程（项目已有 Playwright 依赖） | 自动化回归检测 |

**具体做法**：

```typescript
// tests/baseline/render-regression.test.ts
import { test, expect } from '@playwright/test';

test('10K items pan renders correctly', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(() => loadTestBoard('10k-items'));
  
  // 基线截图
  await expect(page.locator('#canvas-main')).toHaveScreenshot('baseline-10k-pan.png', {
    maxDiffPixelRatio: 0.01,  // 允许 1% 像素差异（抗锯齿等）
  });
  
  // 基线帧率
  const metrics = await page.evaluate(() => {
    return new Promise(resolve => {
      const frames: number[] = [];
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          frames.push(entry.duration);
        }
      });
      observer.observe({ entryTypes: ['frame'] });
      
      // 执行 100 帧平移
      simulatePan(100).then(() => {
        observer.disconnect();
        resolve({
          p50: percentile(frames, 50),
          p95: percentile(frames, 95),
          p99: percentile(frames, 99),
        });
      });
    });
  });
  
  expect(metrics.p95).toBeLessThan(16.6);  // 60fps
  expect(metrics.p99).toBeLessThan(33.3);  // 至少 30fps
});
```

**这一步的投入：3-5 天，但它是整个重构的安全网。**

### 1.2 缺失：God Object 拆分应该从 Day 1 开始

草案把 `createCanvas2DEngine.js` 的拆分放在 Phase 2，这是最大的风险点。这个 24,962 行的文件不拆开，什么都做不了——你无法独立测试空间索引、无法隔离渲染管线、无法给新模块写集成测试。

**我建议的拆分策略**：从 Day 1 开始，按功能域把 God Object 拆成 TypeScript 模块，不改任何逻辑，只做结构重组。

具体拆分方案（按 `createCanvas2DEngine.js` 的实际内容）：

```
createCanvas2DEngine.js (24,962行)
│
├── engine-helpers.js           (~2,500行) — 工具函数，纯函数，无副作用
│   ├── HTML escaping, text preset formatting
│   ├── clipboard cache, export history
│   ├── idle batch queue
│   └── math/code block helpers
│
├── engine-core.js              (~1,000行) — 引擎初始化 + 生命周期
│   ├── store creation, state setup
│   ├── canvas element references
│   └── render scheduling setup
│
├── engine-elements.js          (~2,000行) — 元素 CRUD
│   ├── add/delete/move/resize elements
│   ├── clipboard paste/duplicate
│   └── board load/save
│
├── engine-file-io.js           (~2,000行) — 文件系统集成
│   ├── board file I/O
│   ├── path normalization
│   ├── settings read/write
│   └── workspace manager
│
├── engine-richtext.js          (~4,000行) — 富文本编辑
│   ├── toolbar sync
│   ├── text selection
│   ├── font size controls
│   └── formatting commands
│
├── engine-flow-mindmap.js      (~2,000行) — 流程图/思维导图编辑
│   ├── flow node connections
│   ├── mind map auto-layout
│   └── code block editing sessions
│
├── engine-clipboard.js         (~2,000行) — 剪贴板操作
│   ├── copy/cut/paste
│   ├── structured import flowback
│   └── rich text clipboard payload
│
├── engine-contextmenu.js       (~2,000行) — 右键菜单
│   ├── inline HTML generation per element type
│   └── context menu actions
│
├── engine-overlay.js           (~800行) — overlay 管理
│   ├── rich text overlay positioning
│   ├── math overlay management
│   └── edit state tracking
│
├── engine-styling.js           (~800行) — 样式操作
│   ├── shape styling (color, stroke, dash)
│   └── line styling
│
└── createCanvas2DEngine.js     (~500行) — 最终的入口文件
    ├── import 所有子模块
    ├── 组装 api 对象
    └── export
```

**关键原则**：

1. **零逻辑变更** — 只是把函数从一个文件搬到多个文件，保持所有函数签名和行为不变
2. **逐步拆分** — 不是一次性拆完，而是每次拆一个功能域，验证通过后再拆下一个
3. **每个拆分都是一个可独立验证的 commit** — 拆完跑一遍回归测试，通过就合并

**拆分顺序**（按依赖关系，从低到高）：

```
Week 1: engine-helpers.js      (纯函数，无依赖，最容易)
Week 1: engine-styling.js      (纯函数，低依赖)
Week 2: engine-overlay.js      (依赖较少)
Week 2: engine-file-io.js      (I/O 相对独立)
Week 3: engine-clipboard.js    (依赖 helpers)
Week 3: engine-contextmenu.js  (依赖 helpers + elements)
Week 4: engine-elements.js     (核心逻辑，依赖较多)
Week 4: engine-richtext.js     (最复杂，依赖最多)
Week 5: engine-flow-mindmap.js (依赖 richtext + elements)
Week 5: engine-core.js         (最后组装)
```

### 1.3 缺失：TypeScript 迁移应该和拆分同步进行

草案把 TS 迁移放在 Phase 3（Shell 层 JSX → TSX），但我建议在拆分 God Object 的同时就迁移为 TypeScript。原因：

- 拆分时你正在逐行阅读代码，此时加类型标注的成本最低
- TypeScript 的类型系统可以帮助你发现拆分时遗漏的隐式依赖
- 拆完再迁移等于把同一件事做两遍

**具体做法**：每个拆出的模块直接用 TypeScript 编写，保持 JS 兼容（`allowJs: true`），渐进启用 strict 模式。

### 1.4 缺失：WASM 加载失败的降级路径

草案提到 "SAB 不可用时退化为 postMessage"，但没有讨论 **WASM 模块本身加载失败** 的场景。在 Electron 环境中，WASM 文件可能因为以下原因加载失败：

- 杀毒软件拦截 `.wasm` 文件
- 磁盘权限问题（特别是 Windows）
- 文件被清理工具删除

**降级策略**：

```typescript
// wasm-loader.ts
let wasmModule: CanvasCoreWasm | null = null;
let fallbackMode = false;

export async function initWasmCore(): Promise<CanvasCoreWasm> {
  try {
    const module = await import('./canvas_core_bg.wasm');
    wasmModule = await module.default();  // wasm-bindgen init
    return wasmModule;
  } catch (err) {
    console.error('WASM load failed, falling back to JS:', err);
    fallbackMode = true;
    return createJsFallback();  // 保留 JS 版本作为降级
  }
}

export function isWasmAvailable(): boolean {
  return wasmModule !== null && !fallbackMode;
}
```

**这要求 Phase 1 完成后保留所有 JS 实现，不能删除。** 草案的 "A/B 切换开关" 方向正确，但应该扩展为永久降级路径，至少保留到 Phase 3 稳定运行 3 个月后。

### 1.5 缺失：内存管理策略

草案提到 WASM 内存泄漏风险，但没有给出具体的内存管理方案。在 WASM 中，内存管理有两个层面：

**Rust 侧**（自动管理，但需要注意）：

```rust
// 问题：频繁 alloc/dealloc 导致内存碎片
pub fn query_viewport(&self, rect: Rect) -> Vec<ItemEntry> {
    let mut results = Vec::new();  // 每次调用都分配
    // ...
    results  // 调用者拿到后一次性使用
}

// 解决方案：使用 bump allocator 或 arena 分配临时数据
pub struct QueryArena {
    entries: Vec<ItemEntry>,  // 预分配，复用
}

impl QueryArena {
    pub fn query_viewport(&mut self, index: &SpatialIndex, rect: Rect) -> &[ItemEntry] {
        self.entries.clear();  // 不释放内存，只重置长度
        // 填充 self.entries
        &self.entries  // 返回借用，不分配
    }
}
```

**JS-WASM 边界**（最容易泄漏）：

```typescript
// 问题：每次从 WASM 读取数据都通过 copy 堆分配
const results = spatialIndex.queryViewport(rect);  // 每次都 clone 整个 Vec

// 解决方案：使用 SharedArrayBuffer 预分配结果缓冲区
const QUERY_RESULT_BUFFER_SIZE = 1024 * 4;  // 4K items 足够
const resultBuffer = new SharedArrayBuffer(QUERY_RESULT_BUFFER_SIZE * 8);  // 每个结果 8 bytes

// WASM 侧直接写入共享内存，JS 侧直接读取，零拷贝
spatialIndex.queryViewportIntoBuffer(rect, resultBuffer);
const count = Atomics.load(resultHeader, 0);  // 从 header 读取实际结果数
```

### 1.6 草案风险矩阵补充

| 风险 | 等级 | 说明 | 缓解策略 |
|------|------|------|---------|
| **WASM 加载失败** | 中 | 杀毒软件/权限/文件缺失 | 保留 JS 降级路径，WASM 加载失败时自动切换 |
| **God Object 拆分引入 bug** | **极高** | 24,962 行文件拆分几乎必然引入回归 | 截图回归测试 + 帧率基线 + 每次拆分独立 commit |
| **Electron 版本升级破坏 WASM** | 低 | Electron 42+ 可能改变 WASM 加载策略 | 锁定 Electron 版本，升级前在 CI 测试 WASM 加载 |
| **WASM 体积超预算** | 中 | Rust 全功能编译可能 >2MB | `wasm-opt -Oz` + `opt-level = "s"` + feature gates |
| **团队瓶颈（单人 Rust）** | 高 | 如果只有一个人写 Rust，Phase 2-3 会成为串行瓶颈 | Phase 1 就开始 pair programming；复杂 crate 拆分为更小的子 crate |
| **FlatBuffers schema 演进** | 中 | 前后版本不兼容的 schema 变更 | 每个 schema 变更必须带 migration 测试 |
| **OffscreenCanvas 兼容性** | 低 | Electron 41 支持，但需验证 Worker 中的使用 | Phase 2 做 OffscreenCanvas 集成测试 |

---

## 2. 迁移顺序的重新评估

### 2.1 草案的顺序 vs 我建议的顺序

草案的 Phase 1 优先做 Rust 基础设施 + spatial/geometry crate。我认为这不是最优切入点。

**我的核心论点**：重构的第一优先级不是"写 Rust"，而是"让代码可维护"。在 God Object 没拆开之前，任何模块级优化都无法独立验证。

**重新排序的 Phase 1（8 周）**：

```
Week 1-2: 测试基础设施 + 截图基线
  ├── Playwright 截图回归测试套件
  ├── 帧率基线采集
  └── CI 集成（每次 PR 自动跑回归）

Week 3-5: God Object 拆分 (TypeScript)
  ├── 按 1.2 节的方案逐步拆分 createCanvas2DEngine.js
  ├── 每个模块直接写成 TypeScript
  ├── 拆分完后所有现有测试必须通过
  └── 产出: 10+ 个独立 TypeScript 模块

Week 6-8: Rust 工作空间 + 第一个 crate
  ├── canvas-core/ workspace 初始化
  ├── wasm-pack 构建管线
  ├── canvas-spatial crate (R-tree)
  ├── JS shim 层（API 兼容包装）
  └── A/B 切换 + 性能对比测试
```

**为什么这样排序？**

| 原因 | 说明 |
|------|------|
| **降低每次变更的风险** | 拆分 JS 文件是低风险操作（不改逻辑），放在前面做即使出问题也容易回滚 |
| **为 Rust 模块铺路** | 拆分后才能清晰定义 WASM 模块的边界——你需要知道哪些函数属于 spatial-index |
| **团队能更快看到进展** | 拆分完 God Object 后，代码可读性立刻提升，这对团队士气很重要 |
| **测试基线必须先于任何优化** | 没有基线就没有"重构前 vs 重构后"的对比 |

### 2.2 Phase 2 的调整

草案的 Phase 2 有太多高风险任务堆在一起。我建议拆成两个子阶段：

**Phase 2A（Week 9-12）：Core Worker 上线**

```
Week 9-10: Core Worker 骨架
  ├── core-worker.ts + Comlink RPC
  ├── WASM 模块在 Worker 中加载
  ├── 基本的初始化/销毁生命周期
  └── 验收: Worker 能正常启动并返回 WASM 模块实例

Week 11-12: 渲染管线分离（第一版）
  ├── Core Worker 负责: viewport culling + LOD 判定 + tile dirty 标记
  ├── Main Thread 负责: Canvas2D draw calls
  ├── 通过 SharedArrayBuffer 传递渲染命令
  └── 验收: 10K items 平移帧率 >50fps
```

**Phase 2B（Week 13-16）：核心模块替换**

```
Week 13-14: hit-test + geometry crate
  ├── canvas-hittest crate（利用 R-tree）
  ├── canvas-geometry crate（基础几何运算）
  ├── JS shim 层
  └── 验收: hit test 性能 >10x JS 版本

Week 15-16: codec crate + SAB 渲染通道
  ├── canvas-codec crate（FlatBuffers）
  ├── 完整的 SAB Ring Buffer 渲染通道
  └── 验收: Board 加载速度 >3x JS 版本
```

### 2.3 Phase 3 的调整

草案的 Phase 3 把 diff、layout、IO Worker Pool、Shell 迁移都放在同一个 Phase，我建议按优先级重排：

**Phase 3A（Week 17-20）：diff + history 替换**

```
优先做 diff-engine 的原因：
1. 用户操作频率最高的路径之一就是 undo/redo
2. 结构化 diff 是后续 CRDT 集成的基础
3. 相比 layout，diff crate 的复杂度更低
```

**Phase 3B（Week 21-24）：layout crate + IO Worker + 收尾**

```
Week 21-22: canvas-layout crate
  ├── text shaper (swash)
  ├── force-directed layout
  └── flow layout

Week 23-24: IO Worker Pool + Shell 迁移 + 清理
  ├── Import/Export Worker 池
  ├── React 组件 TSX 迁移
  ├── 移除所有 JS Engine 代码
  └── 性能回归测试套件完整化
```

---

## 3. 技术选型的挑战

### 3.1 FlatBuffers：是否过度设计？

草案选择 FlatBuffers 作为序列化格式，理由是"零拷贝反序列化"。但在 Electron 桌面应用场景下，我需要挑战这个选择：

**FlatBuffers 的代价**：
- Schema 定义和维护成本
- 生成的代码可读性差，调试困难
- 需要 `flatc` 编译器，增加构建管线复杂度
- 不支持动态类型（你的 board schema 有 10+ 种 item type，schema 会很复杂）

**我建议的替代方案：考虑 MessagePack 作为中间选择**

| 维度 | JSON (现) | FlatBuffers | MessagePack |
|------|-----------|-------------|-------------|
| 序列化速度 | 1x (基线) | 10-20x | 5-8x |
| 反序列化速度 | 1x | 50-100x (零拷贝) | 3-5x |
| 体积 | 1x | 0.2-0.4x | 0.5-0.7x |
| 实现复杂度 | 低 | **高** | **低** |
| Schema 维护 | 无 | **需要** | **不需要** |
| 调试友好度 | 高 | 低 | 中 |
| Rust crate 成熟度 | — | `flatbuffers` | `rmp-serde` |

**我的建议**：Phase 2 先用 MessagePack（快速落地，立刻看到 5-8x 提升），Phase 3 或更远期再评估是否需要迁移到 FlatBuffers。MessagePack 的 5-8x 提升已经足够解决 50MB board 加载 3s → <500ms 的目标，而 FlatBuffers 的额外收益（50-100x vs 5-8x）在这个场景下边际收益递减。

**除非**：你的 board 文件需要跨版本兼容（schema 演进），或者你需要在 native 端直接读取而不需要反序列化（随机访问）。如果这两个需求不存在，FlatBuffers 是 overkill。

### 3.2 Comlink vs 手写 postMessage

草案选择 Comlink 做 RPC 层，理由是"类型安全 + Proxy 透明调用"。我基本同意这个选择，但有一个重要的实际问题：

**Comlink 在 Worker 崩溃时的错误处理不够好**。当 Worker 中的 WASM panic 导致 Worker 崩溃时，Comlink 的 Promise 会永远 pending，不会 reject。

**解决方案**：在 Comlink 外层包装一个心跳检测：

```typescript
// core-worker-client.ts
import { wrap, proxy } from 'comlink';

const HEARTBEAT_INTERVAL = 1000;
const HEARTBEAT_TIMEOUT = 3000;

class CoreWorkerClient {
  private worker: Worker;
  private api: CoreEngineAPI;
  private lastHeartbeat = 0;
  private heartbeatTimer: ReturnType<typeof setInterval>;

  constructor(workerPath: string) {
    this.worker = new Worker(workerPath, { type: 'module' });
    this.api = wrap<CoreEngineAPI>(this.worker);
    
    this.heartbeatTimer = setInterval(async () => {
      try {
        const alive = await Promise.race([
          this.api.heartbeat(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), HEARTBEAT_TIMEOUT)),
        ]);
        this.lastHeartbeat = Date.now();
      } catch {
        if (Date.now() - this.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          this.recoverWorker();
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  private async recoverWorker() {
    // 1. 从 Glue 层保存的 board snapshot 恢复状态
    // 2. 重新创建 Worker
    // 3. 重新加载 WASM 模块
    // 4. 恢复 board 状态
    console.warn('Core Worker crashed, recovering...');
    clearInterval(this.heartbeatTimer);
    // ... 重建逻辑
  }
}
```

### 3.3 swash vs cosmic-text

草案选择 swash 做文本整形，理由是"纯 Rust 实现，无需 C 依赖"。我建议重新考虑 **cosmic-text**：

| 维度 | swash | cosmic-text |
|------|-------|-------------|
| 功能范围 | 字体查询 + 字形整形 | 完整文本布局（整形 + 换行 + 方向） |
| 依赖 | fontique (自己的) | swash + fontique (都依赖) |
| Unicode 支持 | 基础 | 完整（bidi、垂直文本） |
| 项目活跃度 | 中 | **高**（正在被 Linebender 生态广泛采用） |
| 多语言支持 | 需要额外工作 | 内置 CJK/bidi 支持 |

**我的建议**：如果你的文本系统需要支持中文竖排、阿拉伯语 bidirectional、复杂排版等场景，直接用 cosmic-text，它已经封装了 swash。如果只是做基础的英文文本度量，swash 足够。考虑到你的产品面向中文用户（从代码中的中文注释判断），**cosmic-text 是更安全的选择**。

---

## 4. 单人执行的计划调整

如果只有 1 个人来做这件事，计划需要重大调整：

### 4.1 时间线翻倍

| Phase | 团队执行 | 单人执行 |
|-------|---------|---------|
| Phase 1 (测试 + 拆分 + Rust 基础) | 8 周 | 12-14 周 |
| Phase 2A (Core Worker) | 4 周 | 6-8 周 |
| Phase 2B (模块替换) | 4 周 | 6-8 周 |
| Phase 3 (diff + layout + 收尾) | 8 周 | 10-12 周 |
| **总计** | **24 周** | **34-42 周** |

### 4.2 单人执行的关键差异

| 方面 | 团队 | 单人 |
|------|------|------|
| Rust crate 拆分粒度 | 可以拆得很细（多人并行） | 拆成 3-4 个大 crate（减少上下文切换） |
| Code review | 互相 review | 自己 review + 延迟 1 天再看 |
| 测试策略 | 单元测试 + 集成测试 + 截图测试 | **截图测试为主**（投入产出比最高） |
| God Object 拆分 | 可以多人分模块拆 | 一个人按顺序拆，每周 2-3 个模块 |
| 文档 | 可以分工 | **不做中间文档**，直接在代码注释中记录决策 |

### 4.3 单人精简的 Crate 策略

草案设计了 6 个独立 crate。单人执行时合并为 3 个：

```
canvas-core/
├── crates/
│   ├── spatial/        # 合并: spatial + hittest + geometry
│   │   ├── src/
│   │   │   ├── rtree.rs
│   │   │   ├── grid.rs
│   │   │   ├── hittest.rs
│   │   │   ├── geometry.rs
│   │   │   └── query.rs
│   │   └── benches/
│   │
│   ├── data/           # 合并: codec + diff
│   │   ├── src/
│   │   │   ├── encode.rs
│   │   │   ├── decode.rs
│   │   │   ├── diff.rs
│   │   │   ├── patch.rs
│   │   │   └── history.rs
│   │   └── tests/
│   │
│   └── layout/         # 独立: layout（复杂度足够高）
│       ├── src/
│       │   ├── text_shaper.rs
│       │   ├── text_measure.rs
│       │   └── force_directed.rs
│       └── benches/
│
└── wasm-bindings/      # 统一的 WASM binding 层
```

**理由**：减少 Cargo workspace 的管理开销，减少 crate 间的依赖图复杂度，减少跨 crate 重构的频率。当只有一个人时，上下文切换的代价远大于模块化的收益。

---

## 5. Phase 1 用户可感知的性能提升策略

如果团队决定在 Phase 1 就想看到用户可感知的性能提升，应该优先做什么？

### 5.1 快赢：不写 Rust 也能做的优化

在 Rust WASM 还没上线之前，以下优化可以立刻做，且用户能感知到：

| 优化 | 做什么 | 预期效果 | 实施难度 |
|------|--------|---------|---------|
| **空间索引增量更新** | 修改 `hitTestSpatialIndex.js`，支持增量 insert/remove 而非全量 rebuild | 10K items 下移动/添加元素从 15ms → <1ms | 中 |
| **undo/redo 增量化** | 在 `history.js` 中实现字段级 diff（只 clone 变化的字段） | undo 延迟从 ~200ms → <50ms | 中 |
| **import 异步化** | 把 `import/` 的 parser 拆成 Web Worker | 导入大文件时不再冻结 UI | 低 |
| **渲染脏区优化** | 扩展 `dirtyRegionManager.js`，支持更精细的脏区合并 | 减少不必要的重绘 | 低 |

**其中"空间索引增量更新"是投入产出比最高的优化**。具体做法：

```javascript
// hitTestSpatialIndex.js — 增量更新改造
// 现有代码：每次变更全量 rebuild
// function rebuildIndex(items) { ... }

// 新增：增量接口
export function insertIntoIndex(index, item) {
  const records = buildRecordForItem(item);
  for (const record of records) {
    const key = getCellKey(
      Math.floor(record.bounds.left / index.cellSize),
      Math.floor(record.bounds.top / index.cellSize)
    );
    if (!index.cells.has(key)) {
      index.cells.set(key, []);
    }
    index.cells.get(key).push(record);
    index.cellCount++;
  }
  index.revision++;
}

export function removeFromIndex(index, itemId) {
  for (const [key, cell] of index.cells) {
    const before = cell.length;
    index.cells.set(key, cell.filter(r => r.id !== itemId));
    index.cellCount -= before - index.cells.get(key).length;
  }
  index.revision++;
}
```

### 5.2 Rust 快赢：spatial crate 就是第一个

如果 Phase 1 必须有 Rust 产出，那 spatial crate 是正确的选择。但不是因为它的代码量，而是因为：

1. **它是独立的** — 零 DOM 依赖，零 I/O，可以完全在 Rust 侧测试
2. **性能差异巨大** — R-tree vs Grid 的查询差异是数量级的，截图对比极其直观
3. **rstar crate 已经很成熟** — 不需要自己实现 R-tree

```rust
// canvas-spatial/src/lib.rs
use rstar::{Envelope, Point, RTree, RTreeParameters, SpatialObject};

#[derive(Clone)]
pub struct SpatialEntry {
    pub id: u64,
    pub left: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
}

impl Envelope for SpatialEntryEnvelope {
    type Point = [f32; 2];
    
    fn low(&self) -> Self::Point { [self.left, self.top] }
    fn high(&self) -> Self::Point { [self.right, self.bottom] }
}

// 使用 rstar 的 bulk_load 作为初始构建，后续用 insert/remove 增量更新
pub struct SpatialIndex {
    tree: RTree<SpatialEntry, RTreeParameters>,
    entries: std::collections::HashMap<u64, SpatialEntry>,
}

impl SpatialIndex {
    pub fn new() -> Self {
        Self {
            tree: RTree::new(),
            entries: std::collections::HashMap::new(),
        }
    }
    
    pub fn bulk_load(items: Vec<SpatialEntry>) -> Self {
        Self {
            tree: RTree::bulk_load(items.clone()),
            entries: items.into_iter().map(|e| (e.id, e)).collect(),
        }
    }
    
    pub fn insert(&mut self, entry: SpatialEntry) {
        self.entries.insert(entry.id, entry.clone());
        self.tree.insert(entry);
    }
    
    pub fn remove(&mut self, id: u64) -> bool {
        if let Some(entry) = self.entries.remove(&id) {
            self.tree.remove(&entry);
            true
        } else {
            false
        }
    }
    
    pub fn query_rect(&self, left: f32, top: f32, right: f32, bottom: f32) -> Vec<u64> {
        let envelope = SpatialEntryEnvelope { left, top, right, bottom };
        self.tree
            .locate_in_envelope(&envelope)
            .map(|e| e.id)
            .collect()
    }
}
```

### 5.3 Phase 1 性能提升路线图（用户可感知）

```
Week 1-2:  测试基线建立
           → 产出: 性能基线数据

Week 3-5:  God Object 拆分 + JS 空间索引增量更新
           → 用户感知: 10K items 下添加/删除元素不再卡顿

Week 6-7:  JS undo/redo 增量化
           → 用户感知: 大量操作后 undo 不再有明显延迟

Week 7-8:  Rust spatial crate + JS shim
           → 用户感知: 10K items 下平移/缩放流畅度提升

Week 8:    Import Worker 化
           → 用户感知: 导入大文件时 UI 不再冻结
```

**到 Phase 1 结束时，用户应该能感知到至少两个场景的明显改善**：
1. 大量 items 下的平移/缩放（spatial crate）
2. 大量操作后的 undo 延迟（增量 history）

---

## 6. 构建管线详细设计

草案的构建管线描述过于粗略。以下是可直接执行的构建配置：

### 6.1 Rust 工作空间初始化

```toml
# canvas-core/Cargo.toml
[workspace]
members = [
    "crates/spatial",
    "crates/data",
    "crates/layout",
    "wasm-bindings",
]
resolver = "2"

[workspace.dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }
serde = { version = "1", features = ["derive"] }
rstar = "0.12"
```

### 6.2 WASM 构建脚本

```json
// canvas-core/package.json
{
  "name": "canvas-core",
  "scripts": {
    "build:wasm": "wasm-pack build --target web --release --out-dir ../public/wasm crates/wasm-bindings",
    "build:wasm:dev": "wasm-pack build --target web --dev --out-dir ../public/wasm crates/wasm-bindings",
    "build:wasm:optimized": "wasm-pack build --target web --release --out-dir ../public/wasm crates/wasm-bindings && wasm-opt -Oz ../public/wasm/canvas_core_bg.wasm -o ../public/wasm/canvas_core_bg.wasm",
    "test": "cargo test --workspace",
    "test:wasm": "wasm-pack test --headless --chrome",
    "bench": "cargo bench --workspace"
  },
  "devDependencies": {
    "wasm-pack": "^0.13.0"
  }
}
```

### 6.3 集成到现有构建管线

```bash
# 现有构建流程（esbuild）
# 新增 WASM 构建步骤

# Step 1: 构建 WASM（仅在 Rust 代码变更时）
cd canvas-core && npm run build:wasm

# Step 2: WASM 产物已自动输出到 public/wasm/
# wasm-pack --target web 会生成:
#   public/wasm/canvas_core_bg.wasm   # WASM 二进制
#   public/wasm/canvas_core.js         # JS glue code
#   public/wasm/canvas_core.d.ts       # TypeScript 类型

# Step 3: esbuild 构建时会自动包含 public/wasm/ 下的文件
# 无需额外配置
```

### 6.4 CI 集成

```yaml
# .github/workflows/ci.yml (或等效的 CI 配置)
name: CI
on: [push, pull_request]

jobs:
  test-js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test  # 现有 JS 测试

  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - run: cargo test --workspace --manifest-path canvas-core/Cargo.toml
      - run: cargo bench --workspace --manifest-path canvas-core/Cargo.toml

  build-wasm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: jetli/wasm-pack-action@v4
      - run: cd canvas-core && wasm-pack build --target web --release crates/wasm-bindings
      - run: ls -lh public/wasm/canvas_core_bg.wasm  # 检查体积 <2MB

  regression:
    runs-on: ubuntu-latest
    needs: [test-js, test-rust, build-wasm]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && cd canvas-core && npm run build:wasm
      - run: npx playwright install chromium
      - run: npx playwright test tests/baseline/  # 截图回归
```

---

## 7. 详细的 Phase 1 执行计划

### 7.1 Week 1-2：测试基础设施

**目标**：建立可重复执行的回归测试套件。

**Week 1 任务**：

- [ ] 创建 `tests/` 目录结构
- [ ] 配置 Playwright（项目已有依赖，直接用）
- [ ] 编写 `tests/baseline/board-scenarios.test.ts`：
  - 空画布渲染
  - 1K / 5K / 10K items 渲染
  - 平移、缩放、框选操作
  - undo/redo 操作
- [ ] 拍摄截图基线
- [ ] 采集帧率基线数据

**Week 2 任务**：

- [ ] 编写 `tests/baseline/import-export.test.ts`：
  - Markdown 导入
  - HTML 导入
  - 图片导入
  - PDF 导入
  - 各格式导出
- [ ] 编写 `tests/baseline/interaction.test.ts`：
  - 元素拖拽
  - 双击编辑
  - 右键菜单
  - 快捷键
- [ ] CI 集成：每次 PR 自动跑回归测试
- [ ] 性能数据存档（用于后续对比）

**产出**：
- `tests/baseline/` 目录，包含 ~20 个测试用例
- 截图基线文件（~100 张）
- 性能基线数据 JSON

### 7.2 Week 3-5：God Object 拆分

**目标**：将 `createCanvas2DEngine.js` (24,962行) 拆分为 10+ 个 TypeScript 模块。

**拆分流程**（每个模块重复）：

```
1. 识别功能域的边界（读代码，标记函数属于哪个模块）
2. 创建新的 .ts 文件，移动相关函数
3. 更新 import/export
4. 运行回归测试
5. 确认无回归后 commit
```

**Week 3**：拆分低依赖模块

```
Day 1-2: engine-helpers.js      (~2,500行)
         纯工具函数，零依赖，最容易验证

Day 3:   engine-styling.js      (~800行)
         样式操作，依赖较少

Day 4-5: engine-overlay.js      (~800行)
         overlay 管理
```

**Week 4**：拆分中等依赖模块

```
Day 1-2: engine-file-io.js      (~2,000行)
         文件系统 I/O，相对独立

Day 3-5: engine-clipboard.js    (~2,000行)
         剪贴板操作，依赖 helpers
```

**Week 5**：拆分核心模块

```
Day 1-2: engine-contextmenu.js  (~2,000行)
         右键菜单

Day 3-5: engine-elements.js     (~2,000行)
         元素 CRUD，核心逻辑
```

**验证标准**：
- [ ] 每次拆分后回归测试全部通过
- [ ] 截图对比无差异
- [ ] 帧率无回归
- [ ] TypeScript 编译无错误（`allowJs: true`）

### 7.3 Week 6-8：Rust 工作空间 + spatial crate

**Week 6**：基础设施搭建

```
Day 1:   安装 Rust 工具链 + wasm-pack
         rustup target add wasm32-unknown-unknown
         cargo install wasm-pack

Day 2-3: 创建 canvas-core/ workspace
         初始化 Cargo.toml
         配置 wasm-bindings crate
         验证 wasm-pack build 能产出 .wasm 文件

Day 4-5: 实现最小 WASM binding
         一个简单的 hello world WASM 模块
         在 Electron 中成功加载并调用
         解决任何 Electron + WASM 兼容问题
```

**Week 7**：spatial crate 实现

```
Day 1-2: 使用 rstar 实现 R-tree spatial index
         bulk_load, insert, remove, query_rect
         编写 Rust 单元测试

Day 3:   编写 Rust benchmark
         1K / 10K / 100K items 场景
         对比 JS Grid 的性能

Day 4-5: wasm-bindings 层
         #[wasm_bindgen] 暴露 JS API
         JS shim 层（与现有 API 兼容）
```

**Week 8**：集成 + A/B 切换

```
Day 1-2: A/B 切换机制
         localStorage flag 控制 JS vs WASM
         运行时自动检测 WASM 可用性

Day 3-4: 集成到现有引擎
         替换 hitTestSpatialIndex.js 的调用
         验证所有 spatial 查询行为一致

Day 5:   性能对比测试
         截图对比（确保渲染一致）
         帧率对比（确认性能提升）
```

**Phase 1 验收标准**：
- [ ] God Object 拆分为 10+ TypeScript 模块
- [ ] Rust WASM 模块在 Electron 中成功加载
- [ ] WASM spatial index 在 10K items 场景下性能 >5x JS 版本
- [ ] 所有回归测试通过
- [ ] 截图对比零差异
- [ ] CI 流水线正常运行

---

## 8. 度量与验证框架

### 8.1 性能度量方案

```typescript
// tests/benchmark/perf-metrics.ts
export interface PerfMetrics {
  // 帧率
  fps: {
    empty: number;
    items1k: number;
    items5k: number;
    items10k: number;
  };
  
  // 帧时间分布
  frameTimes: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  
  // 操作延迟
  latency: {
    hitTest10k: number;      // 10K items hit test 延迟
    undoRedo: number;         // undo/redo 延迟
    boardLoad50mb: number;    // 50MB board 加载时间
    spatialInsert: number;    // 空间索引单次 insert
    spatialQuery: number;     // 空间索引视口查询
  };
  
  // 内存
  memory: {
    baseline1k: number;       // 1K items 基线内存
    spatialIndex1k: number;   // 空间索引内存占用
    historyStack80: number;   // 80 步 undo 栈内存
  };
  
  // WASM 特有
  wasm: {
    moduleSize: number;       // .wasm 文件大小 (bytes)
    loadTime: number;         // WASM 加载时间
    instantiationTime: number;// WASM 实例化时间
  };
}
```

### 8.2 每个 Phase 的验收检查清单

**Phase 1 验收**：
```
□ God Object 拆分为 10+ 个 TypeScript 模块
□ 每个模块可独立 import/测试
□ Rust workspace 可编译产出 WASM
□ WASM spatial index API 与 JS 版本行为一致
□ 10K items: spatial query >5x JS 版本
□ 所有截图回归测试通过
□ 帧率无回归
□ WASM 文件体积 <1MB (gzip <300KB)
```

**Phase 2A 验收**：
```
□ Core Worker 可正常启动/销毁
□ WASM 模块在 Worker 中成功加载
□ Comlink RPC 双向通信正常
□ Worker 崩溃可自动恢复
□ SAB Ring Buffer 数据传输正确
□ 渲染管线分离后画面一致
□ 10K items 平移帧率 >55fps
```

**Phase 2B 验收**：
```
□ hit-test crate 性能 >10x JS 版本
□ geometry crate 所有运算结果与 JS 一致
□ codec crate FlatBuffers 编解码正确
□ Board 加载速度 >3x JS 版本
□ 10K items 框选延迟 <100ms
```

**Phase 3 验收**：
```
□ diff crate undo/redo 增量化工作正确
□ undo/redo 延迟 <20ms
□ layout crate 文本度量结果与 Canvas2D measureText 一致
□ 力导向布局性能可接受
□ IO Worker Pool 导入不阻塞主线程
□ React 组件 TSX 迁移完成
□ 所有 JS Engine 代码移除
□ 全功能回归测试通过
□ WASM 文件体积 <2MB (gzip <500KB)
```

---

## 9. 最后的忠告

### 9.1 这件事最难的部分不是 Rust

Rust/WASM 的技术难度是可控的——rstar、wasm-bindgen、SharedArrayBuffer 都是成熟的工具。

**最难的部分是**：
1. **理解 `createCanvas2DEngine.js` 里的隐性业务逻辑** — 24,962 行代码里藏着大量的边界情况和特殊处理，这些知识只存在于代码中，没有文档。拆分过程就是发现这些隐性知识的过程。
2. **保持渲染一致性** — Canvas2D 的像素级渲染有很多微妙之处（亚像素对齐、抗锯齿策略、颜色空间），替换任何模块后都需要截图验证。
3. **管理重构的节奏** — 不要急于写 Rust，先让代码可维护。每次只做一个变更，验证通过后再做下一个。

### 9.2 如果只能做一件事

如果时间有限，只能做一件事，**做 God Object 拆分**。不写一行 Rust，只把 `createCanvas2DEngine.js` 拆成 10 个 TypeScript 模块。

原因：
- 这是最有价值的改动（可维护性 10x 提升）
- 这是最低风险的改动（不改逻辑，只改文件结构）
- 这是后续所有优化的前提（不拆开就无法独立测试/优化任何模块）
- 这可以在 3-5 周内完成，不需要 Rust 知识

### 9.3 不要追求完美

草案画了一张非常漂亮的架构图。但在实际执行中，你会遇到大量草案没有预见的问题：

- WASM 和 JS 之间的数据类型转换可能比预想的复杂
- SharedArrayBuffer 在某些 Electron 配置下可能不可用
- OffscreenCanvas 在 Worker 中的行为可能和主线程有微妙差异
- FlatBuffers 的 schema 设计可能需要多次迭代

**接受这些不确定性，保持每一步都可回滚。** 这就是为什么测试基线是第一步，为什么 A/B 切换是必须的，为什么 JS 降级路径要保留。

---

*本规划书基于代码审计和草案分析，执行时请根据实际情况调整。*
