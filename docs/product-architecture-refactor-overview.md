# FreeFlow 产品整体架构升级说明

更新日期：2026-05-02

## 目标

本轮重构的目标不是改功能，也不是改产品表现，而是：

- 保持用户可见功能与现有交互逻辑不变
- 拆解超大文件，降低维护成本
- 强化单一事实源，减少重复实现和潜在状态漂移
- 修复重构过程中暴露出的潜在结构性问题

## 本轮完成的核心拆分

### 1. Canvas2D Engine

主文件：

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

新增子模块：

- `public/src/engines/canvas2d-core/workspace/createCanvasWorkspaceManager.js`
- `public/src/engines/canvas2d-core/export/createCanvasExportHistoryManager.js`
- `public/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js`

当前职责分层：

- `createCanvas2DEngine.js`
  - 仍然是唯一编排层
  - 仍然持有主状态、历史、渲染调度、编辑状态、导入导出编排
- `createCanvasWorkspaceManager.js`
  - 负责工作区/文件管理动作
  - 包括重命名、删除、揭示路径、切换工作区、列出/新建画布
- `createCanvasExportHistoryManager.js`
  - 负责当前画布导出历史读写与去重
- `createCanvasImageStorageManager.js`
  - 负责导入图片落盘、裁剪结果回写、`importImage` 目录维护

关键约束：

- 子模块只接收注入依赖，不持有第二套状态
- `createCanvas2DEngine.js` 仍然是 Canvas2D 行为总入口
- 不允许在子模块里重新定义持久化路径、UI settings 写入规则、dirty tracking 规则

### 2. Workbench Runtime

主文件：

- `public/src/runtime/workbenchRuntime.js`

新增子模块：

- `public/src/runtime/settings/createUiSettingsRuntimeBridge.js`
- `public/src/runtime/canvas/createCanvasStorageBridge.js`

当前职责分层：

- `workbenchRuntime.js`
  - 保留运行时主状态 owner 角色
  - 保留 DOM 绑定、布局应用、会话/权限/模型/画布编排
- `createUiSettingsRuntimeBridge.js`
  - 负责 startup context 读取
  - 负责 UI settings cache 读写
  - 负责启动教程提示 gating
  - 负责 UI settings 初始加载链路
- `createCanvasStorageBridge.js`
  - 负责画布路径/图片路径归一化
  - 负责画布路径按钮状态同步
  - 负责 startup 初始画布文件读取与 fallback
  - 负责 canvas project file 持久化桥接

关键约束：

- `workbenchRuntime.js` 仍然是工作台状态单一 owner
- startup context 优先级不能改变
- UI settings 权威来源仍然只能是后端 `uiSettingsService`
- localStorage 只能继续作为 fallback/cache

## 本轮修复的潜在问题

### 1. 未完成重构导致的双实现

此前 `createCanvas2DEngine.js` 中工作区逻辑已经尝试抽离，但主文件仍保留原实现，形成双实现风险。

现已修复：

- 保留一个注入式 `workspace manager`
- 主文件重复实现已移除

### 2. 错误的状态源漂移

此前拆分代码中出现了对以下伪状态源的错误使用：

- `state.useLocalFileSystem`
- `state.suppressDirtyTracking`

实际权威来源分别是：

- engine 局部 `useLocalFileSystem`
- engine 局部 `suppressDirtyTracking`

现已修复为显式依赖注入。

### 3. 历史重复死代码

`createCanvas2DEngine.js` 中有一组图片落盘辅助函数出现过重复拷贝。

现已修复：

- 删除重复实现
- 统一由 `createCanvasImageStorageManager.js` 持有

## 单一事实源说明

### 设置与偏好

- 权威来源：`src/backend/services/uiSettingsService.js`
- 前端 cache：`localStorage[CONFIG.uiSettingsCacheKey]`
- startup 只读镜像：`globalThis.__FREEFLOW_STARTUP_CONTEXT`

### 最近画布与画布路径

- 权威字段：
  - `canvasBoardSavePath`
  - `canvasLastOpenedBoardPath`
  - `canvasImageSavePath`
- 写入仍通过：
  - `/api/ui-settings`
  - Electron startup context bridge 同步镜像

### Canvas2D 工作区

- UI owner：
  - `public/src/engines/canvas2d-core/ui/BoardWorkspaceDialog.jsx`
- 行为 owner：
  - `createCanvas2DEngine.js`
- 子职责实现：
  - `workspace/createCanvasWorkspaceManager.js`

### Canvas2D 导出历史

- 状态 owner：
  - `createCanvas2DEngine.js`
- 子职责实现：
  - `export/createCanvasExportHistoryManager.js`

### Canvas2D 图片落盘

- 状态与历史 owner：
  - `createCanvas2DEngine.js`
- 子职责实现：
  - `storage/createCanvasImageStorageManager.js`

## 本轮重构后的维护原则

1. 不要再向 `createCanvas2DEngine.js` 直接回填一整组新职责
2. 新子模块必须是注入式，不允许偷偷读取推测状态字段
3. `workbenchRuntime.js` 继续拆分时，优先拆“启动/设置桥接类职责”，不要拆散主状态 owner
4. 不要创建第二套 recent-board、workspace、theme、preview、settings 路径
5. 所有后续架构改动必须继续同步：
   - `.codex-traceability/architecture-map.md`
   - `.codex-traceability/module-registry.md`
   - `.codex-traceability/change-log.md`

## 建议的后续拆分方向

如果继续做下一轮，优先级建议如下：

1. `createCanvas2DEngine.js`
   - file-card preview request / word preview request
   - overlay hydration / preview surface orchestration
2. `workbenchRuntime.js`
   - clipboard store bridge
   - screen source persistence bridge
   - session bootstrap chain
3. `public/styles.css`
   - 在不改加载行为的前提下，按工作区/搜索/导出/画布编辑器分段治理

## 本轮验证

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/engines/canvas2d-core/export/createCanvasExportHistoryManager.js`
- `node --check public/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js`
- `node --check public/src/runtime/workbenchRuntime.js`
- `node --check public/src/runtime/settings/createUiSettingsRuntimeBridge.js`
- `node --check public/src/runtime/canvas/createCanvasStorageBridge.js`
- `npm run build:canvas2d-ui`
