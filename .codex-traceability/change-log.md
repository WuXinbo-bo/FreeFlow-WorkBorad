# Change Trace Log

日志维护规则：

- 最新记录放在最上方。
- 最多保留最近 10 条记录。
- 新增第 11 条时删除最旧记录。

## 2026-05-01 Canvas Board FreeFlow Format Upgrade

Problem:

- User-visible requirement: project boards should move from generic `.json` files to a private FreeFlow board suffix, while old users' JSON boards remain safely openable and upgradeable.
- Root cause category: persistence format maturation / migration gap prevention.
- Root cause: canvas board content was saved as bare JSON through both backend `/api/canvas-board` and Canvas2D desktop-shell paths. File pickers, workspace listing, startup fallback and UI copy all assumed `.json`, so changing only one layer would create read/write/startup mismatch.

Files changed:

- `public/src/engines/canvas2d-core/boardFileFormat.js`
- `src/backend/models/canvasBoardFileFormat.js`
- `src/backend/services/canvasBoardService.js`
- `src/backend/services/appStartupService.js`
- `src/backend/config/paths.js`
- `electron/main.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/ui/BoardWorkspaceDialog.jsx`
- `public/src/runtime/workbenchRuntime.js`
- `public/index.html`
- `scripts/check-recent-canvas-startup.js`
- `scripts/check-desktop-upgrade.js`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/architecture-map.md`
- `.codex-traceability/module-registry.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added a versioned `.freeflow` board envelope with `kind`, `formatVersion`, source metadata and the existing structured host board payload inside.
2. Changed new default board paths from `canvas-board.json` to `canvas-board.freeflow`.
3. Kept old `.json` files readable, but made migration non-destructive: opening/reading a legacy JSON board creates a `.freeflow` copy and updates the recent-board path.
4. Updated Electron save/open dialogs and workspace listing to prefer `.freeflow` while still allowing legacy `.json`.
5. Updated Canvas2D direct desktop-shell save/load, backend `/api/canvas-board`, startup resolution and workspace UI text to share the same format rule.
6. Added regression coverage for recent-board startup and legacy JSON upgrade behavior.

Validation:

- `node --check src/backend/models/canvasBoardFileFormat.js`
- `node --check src/backend/services/canvasBoardService.js`
- `node --check src/backend/services/appStartupService.js`
- `node --check electron/main.js`
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/runtime/workbenchRuntime.js`
- `npm run build:canvas2d-ui`
- `node scripts/check-recent-canvas-startup.js`
- `node scripts/check-desktop-upgrade.js`

Future constraints:

- Do not save new primary canvas boards as bare `.json`; use the `.freeflow` envelope.
- Do not overwrite legacy `.json` files during migration; create a `.freeflow` copy and persist that as recent.
- Keep backend and renderer board format helpers in sync until they can share one build-safe module.

## 2026-05-01 File Card Attached PDF Preview Using PDF.js

Problem:

- User-visible requirement: PDF file cards should support the same attached preview experience as the existing Word file-card preview, instead of stopping at DOCX only.
- Root cause category: preview kernel limited to one document type.
- Root cause: the attached file-card preview pipeline, request model, context-menu gating and React preview surface were hardcoded around DOCX-specific fields and the `docx-preview` renderer, with no parallel PDF render kernel or vendored browser asset path.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/src/engines/canvas2d-core/fileCardModule.js`
- `public/src/engines/canvas2d-core/vendor/loadVendorEsmModule.js`
- `public/src/api/http.js`
- `src/backend/routes/persistenceRoutes.js`
- `src/backend/controllers/persistenceController.js`
- `scripts/build-canvas2d-ui.js`
- `public/styles.css`
- `public/assets/vendor/pdfjs-dist/*`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`
- `.codex-traceability/module-registry.md`

Fix mechanism:

1. Expanded file-card preview eligibility from `DOCX only` to `DOCX / PDF`.
2. Generalized the file-card preview request model from DOCX-only payload fields to shared file-preview fields plus `previewKind / previewMime / previewBadgeLabel`.
3. Added a backend fallback route `/api/file-preview/pdf-base64` with the same allowed-roots enforcement as the existing DOCX preview route.
4. Added vendored `pdfjs-dist` browser assets through the Canvas2D UI build script and exposed them through the shared vendor ESM loader.
5. Reworked the React attached preview surface into one shared UI shell with two render kernels:
   - DOCX via `docx-preview`
   - PDF via `pdfjs-dist`
6. Kept zoom, expand, multi-instance open behavior and placeholder states unified across both document types.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check src/backend/controllers/persistenceController.js`
- `node --check scripts/build-canvas2d-ui.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Do not fork PDF attached preview into a second detached UI or separate state collection; keep Word/PDF under the same file-card preview request pipeline.
- New previewable document types must extend the shared request/render contract instead of reintroducing format-specific one-off shells.

## 2026-05-01 File Card Preview Multi-Instance Support

Problem:

- User-visible symptom: after opening preview on one DOCX file card, opening preview on another file card would automatically replace the first one.
- Root cause category: single-instance UI state model.
- Root cause: file-card preview state was modeled as one global `fileCardPreviewRequest` object, so open/close/hydrate/zoom/expand operations all targeted a single shared slot instead of independent preview instances.

Files changed:

- `public/src/engines/canvas2d-core/store.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Replaced the single `fileCardPreviewRequest` store field with a `fileCardPreviewRequests` collection.
2. Reworked preview open, close, hydration, zoom and expand paths to target one preview by `requestId`.
3. Kept per-preview memo restore ownership on close so multiple open previews do not fight over unrelated file cards.
4. Changed the React preview mount path from one component instance to list rendering over all active file-card previews.
5. Preserved same-file reopen behavior by updating the existing item preview slot instead of duplicating the same file card repeatedly.

Validation:

- `node --check public/src/engines/canvas2d-core/store.js`
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`

Future constraints:

- File-card preview state is now a collection; do not reintroduce single-slot writes in async hydration or UI control handlers.
- Any new file-card preview action must target a concrete preview request by `requestId`, not assume there is only one open preview.

## 2026-05-01 File Card Preview Header Simplification

Problem:

- User-visible symptom: the file-card Word preview header carried extra attachment wording and redundant metadata rows that made the surface noisier than needed.
- Root cause category: preview chrome over-description.
- Root cause: the React preview shell still rendered an older attached-preview title row plus a page-count diagnostic that was useful for debugging but not part of the desired steady-state UI.

Files changed:

- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Renamed the preview kicker from `附着式文档预览` to `文档预览`.
2. Removed the separate file-name/title row from the preview header area.
3. Removed the `页面数` diagnostic chip from the visible diagnostics line.
4. Compressed the preview container grid so the header cleanup does not leave an empty layout row.

Validation:

- `npm run build:canvas2d-ui`
- Static JSX/CSS verification of the preview header and diagnostics structure.

Future constraints:

- Keep the attached preview shell header concise; do not re-add file metadata rows unless they serve an active interaction need.
- If diagnostics are expanded again later, separate user-facing steady-state chrome from developer-only troubleshooting fields.

## 2026-05-01 File Card Word Preview Fit And Wheel Interaction Fix

Problem:

- User-visible symptom: the attached Word preview only showed a corner of the DOCX page instead of fitting and centering within the preview window.
- User-visible symptom: mouse wheel inside the preview did not scroll the document, and Ctrl + wheel did not reliably zoom the preview content.
- Root cause category: CSS transform layout mismatch / wheel event ownership bug.
- Root cause: the DOCX page stayed in a fixed 794px layout box while only the visual layer was transformed, so centering was computed from the unscaled box. The preview shell also used `overflow: hidden` without a dedicated scroll viewport, letting wheel input fall through to the canvas instead of being owned by the preview.

Files changed:

- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added a dedicated `.canvas2d-file-preview-react-scroll` viewport that owns normal wheel scrolling and contains overscroll behavior.
2. Added a centered `.canvas2d-file-preview-react-docx-frame` whose layout width/height match the scaled DOCX surface.
3. Kept the real DOCX page at the 794px baseline and applied transform scaling only inside the frame.
4. Computed an automatic fit scale from the actual preview viewport width, then multiplied it by the user zoom.
5. Moved Ctrl/Meta + wheel handling onto the scroll viewport and stopped propagation so the canvas does not consume preview wheel input.

Validation:

- `npm run build:canvas2d-ui`
- Chromium check with `C:\Users\lenovo\Desktop\freeflow-selection-word4.docx`: render state `ready`, page count `1`, document center delta vs scroll viewport center `0`.
- Chromium scroll check: preview scrollTop can move from `0` to `220`.
- Chromium Ctrl+wheel check: request zoom changes from `0.82` to `0.92`, with the document remaining centered.

Future constraints:

- Do not center transformed DOCX content from the unscaled 794px layout box; keep the scaled frame as the layout participant.
- Wheel events inside the attached preview belong to the preview scroll viewport, not the canvas pan/zoom handler.

## 2026-05-01 File Card Word Preview React Renderer Rebuild

Problem:

- User-visible symptom: after repeated fixes, clicking DOCX file-card preview could still show nothing: no Word body and no diagnostic text.
- Root cause category: split preview ownership / stale hidden failure path.
- Root cause: file-card preview rendering had two competing systems. The engine still owned an imperative inline/Shadow DOM renderer while the Canvas2D React bundle also contained a React preview component. When the old imperative block was partially removed, `openFileCardPreview()` still depended on its local `buildFileCardPreviewDiagnostics()` helper, so preview opening could throw before `fileCardPreviewRequest` reached React. That made the UI appear completely blank instead of showing failure diagnostics.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/src/engines/canvas2d-core/reactBridge.js`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Rebuilt file-card DOCX preview around a single React-owned renderer, marked by `data-preview-kernel="react-docx-v2"`.
2. Kept the engine responsible only for preview request creation, file hydration and memo restoration.
3. Moved diagnostic creation to an engine-level helper so opening preview cannot fail before React receives a request.
4. Added an anchor snapshot to preview requests so React can still show a diagnostic shell even if the source file-card item is temporarily unavailable.
5. Removed old inline preview CSS and stopped the old imperative preview host from participating in rendering.
6. Rendered DOCX through the standard `docx-preview` `renderAsync(document, bodyContainer, styleContainer, options)` path in the React surface.
7. Kept the canvas-attached whole-surface scaling contract and added lightweight suppression when the on-screen preview is too small.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/engines/canvas2d-core/reactBridge.js`
- `npm run build:canvas2d-ui`
- Restarted stale Electron/server processes and verified HTTP serves the new Canvas2D UI bundle with `react-docx-v2`.
- Chromium failure-state check: missing DOCX path now renders the attached preview shell with `加载失败 / 渲染失败` diagnostics.
- Chromium success-state check: `C:\Users\lenovo\Desktop\freeflow-selection-word4.docx` renders through `docx-preview` with `页面数 1`, `正文节点数 814`, and `当前状态 已恢复`.

Future constraints:

- File-card Word preview UI must stay React-owned; do not reintroduce a second imperative iframe/Shadow DOM preview renderer in `createCanvas2DEngine.js`.
- Opening preview must always produce a `fileCardPreviewRequest` first, then let React show loading/failure/ready states.
- Diagnostic text is part of the contract; no preview path may return a blank shell without `加载文档 / 解析成功 / 页面数 / 正文节点数 / 当前状态`.

## 2026-05-01 File Card Word Preview Shadow DOM Renderer Unification

Problem:

- User-visible symptom: the file-card Word preview shell could open with normal controls and sizing, but the actual document area still rendered as an empty white panel.
- User-visible symptom: repeated point fixes around loading status and iframe timing did not eliminate the blank-body failure mode.
- Root cause category: embedded preview architecture fragility.
- Root cause: the inline file-card preview used a separate imperative iframe-based rendering path instead of sharing the already-proven Word preview rendering model. That iframe subdocument path introduced extra lifecycle, sandbox, module-loading and double-scaling failure points, so the shell could look ready while the real document body was still absent or stale.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/styles.css`

Fix mechanism:

1. Replaced the file-card inline preview body from an iframe subdocument with a Shadow DOM render surface attached directly to the preview shell.
2. Moved the inline preview to a shared parent-window `docx-preview` module load path instead of dynamically bootstrapping a second runtime inside an iframe.
3. Split preview rendering into explicit style/content roots so `docx-preview` can inject both document CSS and page DOM into one stable host.
4. Tightened the success check: the preview now requires both generated DOCX page nodes and actual renderable page content before switching to ready state.
5. Preserved the existing outer shell, zoom controls, placeholder statuses and canvas-attached scaling model while removing the brittle iframe lifecycle from the core path.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Do not maintain a second independent Word preview render kernel for file cards when the project already has a proven document preview path.
- Treat “preview shell exists” and “document body really rendered” as separate conditions; ready state must require both.

## 2026-05-01 File Card Preview First-Open Repaint And Prism Worker Message Conflict Fix

Problem:

- User-visible symptom: after reopening the app, clicking a DOCX file-card preview could leave the embedded preview area blank on first open, with neither rendered content nor a visible failure/loading placeholder until another canvas interaction happened.
- User-visible symptom: Chromium/devtools could also report `prism-highlight-worker.js:1 Uncaught SyntaxError: "[object Object]" is not valid JSON`, which polluted the console and obscured the actual preview issue.
- Root cause category: async preview state/render desynchronization / worker protocol conflict.
- Root cause: the DOCX hydration path updated `fileCardPreviewRequest` to `ready` or `failed` but did not schedule an overlay redraw at that transition, so the inline preview shell could remain visually stale. Separately, the custom Prism worker imported Prism core without disabling Prism's built-in worker message handler, so Prism tried to parse our object payload as JSON text.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/vendor/prismjs/components/prism-highlight-worker.js`

Fix mechanism:

1. Added explicit `scheduleRender({ overlayDirty: true })` after DOCX preview hydration resolves successfully.
2. Added the same forced overlay redraw on DOCX hydration failure so the local placeholder/failure state appears immediately on first open.
3. Disabled Prism's built-in worker message handler before loading Prism core inside the custom highlight worker.
4. Kept the project's custom object-based worker protocol as the only active message path inside that worker.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- Verified `POST /api/file-preview/docx-base64` returns valid base64 for `C:\\Users\\lenovo\\Desktop\\小挑答辩稿改详细版（灰色重点）.docx`
- Verified `http://127.0.0.1:3000/vendor/prismjs/components/prism-highlight-worker.js` serves the patched JavaScript worker asset

Future constraints:

- Any async file-card preview state transition that affects overlay output must schedule an overlay redraw in the same code path; `store.emit()` alone is not sufficient.
- If Prism runs inside a custom worker, disable Prism's default worker message handler unless the payload format exactly matches Prism's native JSON-string contract.

## 2026-05-01 First-Open Preview Visibility Race Fix

Problem:

- User-visible symptom: after reopening the desktop app, the first click on a file-card preview could produce neither rendered content nor any visible loading/error hint.
- Root cause category: first-frame visibility race / silent failure path.
- Root cause: the preview overlay could be judged “not visible” before the canvas viewport metrics settled on the first open path, so the shell was hidden before the loading placeholder had a chance to present. In parallel, file-read failures only updated local preview state and did not always surface an explicit global status hint.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Added a first-open visibility retry path so loading-state previews are not immediately hidden just because the first viewport geometry is not stable yet.
2. Added a short deferred retry that re-runs overlay sync until the preview can either display normally or fail explicitly.
3. Added global status feedback for file preview load failures and unsupported-preview outcomes.
4. Added an immediate global loading status when preview opening starts, so the first click always produces visible feedback.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Do not hide first-open overlays purely on the earliest geometry sample when the UI is still settling after startup.
- Preview failures must surface both local placeholder state and global user-visible status text.

## 2026-05-01 Chromium Preview Capability Gating

Problem:

- User-visible symptom: in Chromium testing, the file-card Word preview could still open a preview shell that looked broken or blank.
- Root cause category: unsupported environment exposed as broken preview UI.
- Root cause: browser/Chromium mode does not expose `desktopShell.readFileBase64()`, so local DOCX bytes cannot be loaded there at all. The previous UI still allowed the preview shell to open, which made a capability gap look like a rendering bug.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Added an explicit desktop-file-bridge capability check before starting file-card Word preview hydration.
2. In Chromium/browser mode, the preview now opens in an explicit `unavailable` state with a clear message instead of pretending a live local DOCX preview can work.
3. Prevented unnecessary hydration attempts in environments that do not expose the desktop file bridge.

Validation:

- Chromium check on `http://127.0.0.1:3000` confirmed `globalThis.desktopShell === false`.
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Do not present local file preview shells as if they are functional when the renderer lacks the desktop file bridge.
- Separate “environment does not support this capability” from “preview rendering failed” in both UI and debugging.
