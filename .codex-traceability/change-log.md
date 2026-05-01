# Change Trace Log

日志维护规则：

- 最新记录放在最上方。
- 最多保留最近 10 条记录。
- 新增第 11 条时删除最旧记录。

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

## 2026-05-01 File Card Preview Visible State Labeling

Problem:

- User-visible symptom: when live preview was intentionally paused, suppressed, or recovering, the blank area could still be interpreted as a broken white screen.
- Root cause category: invisible non-error states.
- Root cause: placeholder copy existed, but there was no compact explicit state label to distinguish paused/suppressed/recovering/error modes at a glance during repeated use.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/styles.css`

Fix mechanism:

1. Added a dedicated placeholder state pill inside the preview shell.
2. Mapped runtime placeholder states to explicit labels such as `已暂停`, `恢复中`, `渲染失败`, and `加载中`.
3. Added distinct visual treatments for warning-like paused states, loading/recovering states, and failure states.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- If preview suppression is intentional, the UI must surface that state explicitly instead of leaving users to infer from a blank content area.

## 2026-05-01 File Card Word Preview Render-State Refactor

Problem:

- User-visible symptom: the embedded Word preview could still show a completely blank content area even though the preview shell, controls and scrollbars were visible.
- User-visible symptom: when live preview was intentionally suppressed, the UI could look like a bug instead of a deliberate placeholder state.
- Root cause category: false-positive render success / implicit state machine.
- Root cause: the previous mechanism treated “iframe has some DOM” as near-equivalent to “Word pages rendered successfully”, but a preview host shell can exist without actual `section.docx` page nodes. That caused blank surfaces to be reused as if they were successful renders.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/styles.css`

Fix mechanism:

1. Split file-read success from preview-render success by introducing explicit runtime render states for the inline file-card preview.
2. Replaced the weak cached-content check with a real rendered-page check that requires actual DOCX page nodes to exist in the iframe host.
3. Cleared the iframe preview host before each rerender and treated “no rendered page nodes after renderAsync” as a hard render failure.
4. Added explicit user-facing placeholder reasons for paused/suppressed states so blank areas are not mistaken for broken preview logic.
5. Preserved the resource-saving suppression behavior, but now with deterministic state transitions: `loading`, `deferred`, `suppressed`, `rendering`, `ready`, `failed`.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Never treat generic iframe DOM presence as proof that document preview rendering succeeded.
- For embedded previews, explicit render-state machines are required once there are pause/resume/suppress/reuse paths.

## 2026-05-01 File Card Word Preview Stability And Resource Gating

Problem:

- User-visible symptom: the embedded Word preview could disappear after canvas drag or view zoom transitions, then fail to recover reliably.
- User-visible requirement: the attached preview should stay visually proportional with the file card model, but degrade gracefully when motion or tiny viewport scale makes live rendering wasteful.
- Root cause category: aggressive teardown / missing live-preview gating.
- Root cause: the preview path cleared iframe state too eagerly on hide-like transitions, so the next recovery depended on a full rerender. At the same time, all visible scales tried to behave as live-preview states even when the on-screen size was already too small to justify DOCX rendering cost.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Added cached-content detection for the inline preview iframe so already rendered DOCX content can be reused instead of rerendered.
2. Changed normal hide behavior to preserve rendered iframe content; only full clear paths still tear the preview down.
3. Added a small-on-screen threshold that switches the preview to lightweight placeholder mode when the attached panel becomes too small for a meaningful live DOCX preview.
4. Kept motion-phase placeholder gating, but now paired it with content retention so recovery after pan/zoom is much more reliable.
5. Increased deferred hydration slightly to avoid triggering expensive rerender work too aggressively during rapid view changes.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Do not clear expensive embedded preview state on every temporary hide if the next likely action is immediate redisplay.
- For heavy previews, live rendering should depend on meaningful on-screen size and stability, not just raw visibility.

## 2026-05-01 File Card Preview Whole-Surface Transform Scaling

Problem:

- User-visible symptom: different zoom levels still did not show the same preview surface in true 1:1 proportional form; the composition changed rather than only shrinking/enlarging uniformly.
- Root cause category: scaled layout box causing relayout.
- Root cause: the preview used scaled `width` and `height` on the layout box, which forced internal text, controls and content regions to reflow differently at each zoom level instead of preserving a fixed base surface and scaling it as one piece.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Kept one fixed base width and height from `getFileCardPreviewBounds()`.
2. Continued projecting the attachment position from canvas space to screen space.
3. Switched visual scaling from scaled layout dimensions to `transform: scale(scale)` on the whole preview node.
4. Reset transform state when hiding/clearing the preview node to avoid stale scaling artifacts.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- For this preview, whole-surface scaling must be done by transform, not by resizing the layout box.
- Do not reintroduce internal relayout-per-zoom if the requirement is 1:1 proportional restoration across zoom levels.

## 2026-05-01 File Card Preview Text Reflow Stabilization

Problem:

- User-visible symptom: even after restoring unified canvas scaling, the preview header text still looked like it was “changing separately” during viewport zoom.
- Root cause category: text reflow instability.
- Root cause: the title and helper lines were allowed to wrap and reflow inside a scaling container, so viewport zoom changed line breaks and text block shape, which visually looked like a separate scaling bug.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/styles.css`

Fix mechanism:

1. Forced preview eyebrow, title and helper/meta lines into stable single-line rendering with truncation instead of wrap-based reflow.
2. Shortened the helper copy so it fits the attachment header more reliably across zoom states.
3. Kept the unified canvas-scaling model intact; only removed the internal text reflow that made the component appear unstable.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- For this preview shell, do not allow informational header text to wrap dynamically inside a zoom-scaling attachment.
- When readability is limited, shorten copy and truncate; do not reintroduce wrap-based layout shifts.

## 2026-05-01 File Card Preview Unified Canvas Scaling Correction

Problem:

- User-visible symptom: the attached preview still changed in the wrong way during viewport zoom because some parts of the shell did not scale together with the rest of the preview.
- Root cause category: partial inverse-scaling regression.
- Root cause: a later UI adjustment introduced inverse-scale compensation for the preview head, title and toolbar, which broke the intended “entire preview scales as one canvas attachment” model.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/styles.css`

Fix mechanism:

1. Removed the runtime `1 / scale` compensation variable from the preview shell.
2. Removed inverse `transform: scale(...)` rules from the preview head, titlebar and toolbar.
3. Restored one consistent scaling model: the whole preview window, including outer text, controls and embedded content area, now scales together with the canvas attachment.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Do not fix readability in this component by inverse-scaling subregions unless the interaction model is explicitly changed away from a unified canvas attachment.
- For this preview, either everything scales together or the component must be redesigned as a true screen-space panel; mixing both models causes visible regression.

## 2026-05-01 File Card Preview Fixed Outer Typography And Vertical Expand

Problem:

- User-visible requirement: the preview's outer title/description text should keep a fixed readable size instead of shrinking/growing with the viewport.
- User-visible requirement: `全部展示` should expand like a downward pull-out strip, keeping the top anchor stable instead of widening horizontally.
- Root cause category: shell typography and expand geometry coupled to the same canvas-scale box.
- Root cause: the entire attached preview shell scaled uniformly with the canvas, including outer labels, and expanded mode still used a width rule that could broaden the component rather than behaving like a vertical extension.

Files changed:

- `public/src/engines/canvas2d-core/elements/fileCard.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/styles.css`

Fix mechanism:

1. Kept the preview shell attached to canvas scale overall, but applied inverse-scale compensation to the outer head/title/toolbar UI so title and helper text remain visually fixed-size.
2. Removed expanded-mode width broadening and kept one stable preview width baseline across compact and expanded modes.
3. Kept the top gap fixed so expanded mode grows downward by height increase rather than shifting upward or widening sideways.
4. Preserved document area scaling with the canvas while decoupling only the outer descriptive typography and controls.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/engines/canvas2d-core/elements/fileCard.js`

Future constraints:

- If only the outer chrome needs fixed readability, use local inverse-scale compensation instead of converting the whole attachment to screen-space.
- Do not let “expanded” mode change width unless the interaction explicitly calls for a wider preview model.

## 2026-05-01 File Card Preview Canvas-Scale Attachment Correction

Problem:

- User-visible symptom: after the previous positioning adjustment, zooming out the canvas made the file card shrink while the attached preview stayed visually too large, so the relative relationship became obviously wrong.
- Root cause category: attachment model interpreted incorrectly.
- Root cause: the preview had been converted into a fixed-size screen-space panel, but the intended model is a canvas-attached surface that should pan and zoom with the canvas like the file card itself.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Restored preview width and height scaling with `state.board.view.scale`.
2. Restored preview left/top projection from canvas-space bounds instead of fixed screen-space sizing math.
3. Kept the preview attached under the file card in canvas space so zooming out now shrinks both the file card and its preview together.
4. Corrected the preview meta copy so the UI description matches the actual interaction model.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Treat the attached preview as a canvas-space attachment unless the interaction model is explicitly changed.
- Do not switch between screen-space fixed overlays and canvas-space attached overlays without rechecking relative size behavior during zoom-out.

## 2026-05-01 File Card Preview Canvas-Anchored Fixed-Size Positioning

Problem:

- User-visible symptom: the attached preview no longer zoomed with the viewport, but its anchoring still felt wrong, as if it were partly positioned by screen-layer math instead of being cleanly attached under the file card.
- Root cause category: mixed coordinate-space bug.
- Root cause: the previous adjustment removed scale from the preview window size, but the screen-position formula still came from precomputed preview bounds that implicitly mixed canvas-space preview width with viewport scaling behavior.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Kept preview width and height fixed in screen space so zooming the canvas does not resize the panel itself.
2. Recomputed the preview anchor directly from the file card's projected screen rect: card screen left/top plus scaled card width/height.
3. Centered the fixed-size preview under the scaled-on-screen file card and applied the preview gap as a fixed screen-space offset.
4. Preserved canvas-pan following behavior because the anchor still derives from the card's projected position after applying board offsets.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- When an overlay is “attached to a canvas element but not zoom-scaled,” compute its position from the element's projected screen rect and compute its size in screen space.
- Do not reuse a width/height formula across both canvas-space and screen-space attachment models.

## 2026-05-01 File Card Preview View-Scale Decoupling

Problem:

- User-visible symptom: the attached file-card preview grew and shrank with the canvas zoom level, which made it feel unstable and harder to read.
- Root cause category: overlay sizing coupled to board zoom.
- Root cause: `syncInlineFileCardPreviewOverlay()` multiplied both preview position and preview size by `state.board.view.scale`, so the attached preview window itself behaved like a canvas element instead of a screen-space overlay anchored to a canvas element.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Kept preview anchoring tied to the file card's screen position so the window still follows the card.
2. Removed board-scale multiplication from the preview window width and height so the attached preview content stays visually stable while the canvas zoom changes.
3. Removed the zoom-range placeholder fallback for this preview, because the preview is no longer supposed to expand or shrink with the canvas view scale.
4. Kept the unstable-pointer placeholder path so drag/resize phases still degrade to a lightweight state when needed.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Keep attached preview position and attached preview size as separate concerns.
- Do not re-couple preview readability to canvas zoom unless a dedicated screen-space scaling policy is explicitly defined.

## 2026-05-01 File Card Attached Preview Fit-Width Correction

Problem:

- User-visible symptom: the attached Word preview window was still visually too wide relative to the file card, so the lower window did not read as a subordinate attachment.
- User-visible symptom: on the real desktop runtime, the preview shell could appear while the document body looked blank or severely cropped.
- Root cause category: preview geometry and document page scale not coupled.
- Root cause: the attached preview panel had already been narrowed at the outer bounds level, but the iframe-side DOCX renderer still painted pages at a near full-page width baseline, so a narrow attached window could crop the rendered page and make the content appear missing.

Files changed:

- `public/src/engines/canvas2d-core/elements/fileCard.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Fix mechanism:

1. Tightened attached preview geometry so the lower window is more clearly narrower than its parent file card in both compact and expanded modes.
2. Reduced the default compact overlap/gap so the stacked composition reads closer to “card over inserted preview window”.
3. Added fit-width scaling inside the iframe DOCX renderer based on the real attached preview viewport width instead of assuming a near full-page shell.
4. Kept user zoom as a multiplier on top of fit-width scaling, so the preview remains readable in narrow shells without losing the existing `Ctrl + 滚轮` interaction.

Validation:

- `node --check public/src/engines/canvas2d-core/elements/fileCard.js`
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Keep attached preview outer geometry and iframe page scale aligned; do not tune only one side of the system.
- If the attached preview width changes again later, revalidate the iframe page fit logic in the desktop renderer instead of assuming browser-only CSS checks are sufficient.

## 2026-05-01 File Card Attached Word Preview Instead Of Detached Dialog

Problem:

- User-visible symptom: file-card Word preview still opened as a global detached dialog, which broke the file-card-native interaction model and did not move with the card.
- User-visible symptom: memo/tag and preview could compete for the same vertical attachment space under the file card.
- User-visible requirement: the preview must render as a receipt-like strip attached under the file card, move with the card, temporarily yield to a lightweight placeholder during unstable drag/zoom states, and restore the memo after closing.
- Root cause category: preview surface attached to the wrong UI layer / missing canvas-local degradation policy.
- Root cause: the first DOCX preview implementation was mounted from the React UI root as a modal-like overlay, while file-card geometry, drag state and memo behavior all belong to the Canvas2D engine surface layer.

Files changed:

- `public/src/engines/canvas2d-core/elements/fileCard.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/styles.css`

Fix mechanism:

1. Added a file-card preview bounds helper in the file-card element module so attached preview geometry stays derived from the same source as the card itself.
2. Moved file-card preview rendering out of the React dialog path and into a dedicated Canvas2D surface overlay host managed directly by `createCanvas2DEngine.js`.
3. Reused the existing `docx-preview` + iframe-local `JSZip` rendering path, but now mounted inside a file-card-attached receipt-style panel instead of a detached dialog.
4. Added runtime degradation rules: while the file card is moving/resizing or the canvas scale is outside the supported preview range, the panel switches to a lightweight placeholder and skips expensive DOCX rendering.
5. Made preview and memo mutually exclusive on the same file card: opening preview hides the memo attachment temporarily, and closing preview restores the previous memo-visible state.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/engines/canvas2d-core/elements/fileCard.js`
- `node --check public/src/engines/canvas2d-core/reactBridge.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Keep file-card preview attached to the Canvas2D surface layer; do not reintroduce a second React-root modal path for the same feature.
- Keep preview degradation driven by existing canvas runtime state such as pointer mode and view scale instead of adding a second busy-state system.
- If more file-card attachment surfaces are added later, arbitrate them through the file-card geometry/state owner instead of letting each surface manage overlap independently.

Update:

- The first attached-preview visual pass still missed the requested composition and read more like a standalone widget than a “top card floating over a larger inserted window”.
- The follow-up correction changed the visual target to a stacked composition: larger lower preview window, higher overlap under the file card, flatter shell, and quieter controls.
- That correction was validated against a browser-rendered UI mock on the real page before finalizing the CSS, to avoid continuing blind visual edits.

## 2026-05-01 File Card Preview Entry And Visual Blur Reduction

Problem:

- User-visible symptom: file cards felt visually too soft even before the zoomed-out placeholder state, which made them read as blurred.
- User-visible requirement: add a right-click preview action for file cards, starting with Word documents, and keep the preview inside the canvas workbench instead of opening a detached system window.
- Root cause category: over-soft card elevation / missing file-card-native preview surface.
- Root cause: file cards had a relatively heavy shadow treatment in the main renderer, and existing Word preview capability was only wired to export-preview flow, not to file-card runtime interaction.

Files changed:

- `public/src/engines/canvas2d-core/fileCardModule.js`
- `public/src/engines/canvas2d-core/store.js`
- `public/src/engines/canvas2d-core/ui/FileCardWordPreviewDialog.jsx`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/src/engines/canvas2d-core/reactBridge.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/rendererFileCard.js`
- `public/styles.css`

Fix mechanism:

1. Added a file-card context-menu `预览` action and limited the first implementation to `DOCX`.
2. Reused the existing renderer-preload-main desktop bridge path by reading the file-card source file as base64 and rendering it with the existing `docx-preview` frontend stack.
3. Added a dedicated in-canvas embedded file-card Word preview dialog with `Ctrl + 滚轮缩放`, normal wheel scrolling, and a `全部展开` toggle for full-length page rendering.
4. Kept file-card preview state runtime-only in the Canvas2D store; no new persistence or startup state source was introduced.
5. Reduced the file-card card shadow so the default card surface no longer reads as blurred/softened before LOD fallback kicks in.

Validation:

- `node --check public/src/engines/canvas2d-core/fileCardModule.js`
- `node --check public/src/engines/canvas2d-core/store.js`
- `node --check public/src/engines/canvas2d-core/reactBridge.js`
- `node --check public/src/engines/canvas2d-core/rendererFileCard.js`
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Do not add a second Word preview renderer for file cards; continue reusing the existing `docx-preview` capability chain.
- Keep file-card preview state runtime-only unless a real persisted reopen requirement is defined.
- Do not broaden preview support to non-Word file types by MIME sniffing hacks; add each type through an explicit preview pipeline.

Update:

- The first file-card DOCX preview implementation failed with `Can't read the data of 'the loaded zip file'` because `docx-preview` was loaded in the parent window while rendering into an iframe document, so JS runtime type checks for zip input crossed window contexts and rejected the buffer.
- The preview renderer was corrected to match the existing stable Word export preview pattern: load `JSZip` and `docx-preview` inside the iframe runtime, then render with iframe-local typed arrays and buffers.

## 2026-05-01 File Card Stable Import Size And Type Color Coding

Problem:

- User-visible symptom: newly imported file cards did not land with a stable first-frame width and height, so the opening visual rhythm felt inconsistent from file to file.
- User-visible symptom: different file types were visually too similar, which reduced scan efficiency on the canvas.
- Root cause category: element-model defaults too generic / missing semantic file-type styling.
- Root cause: file-card creation still used a generic size baseline and the renderer hardcoded a single blue extension badge style, so import source differences were not normalized into one stable card model.

Files changed:

- `public/src/engines/canvas2d-core/elements/fileCard.js`
- `public/src/engines/canvas2d-core/rendererFileCard.js`

Fix mechanism:

1. Moved file-card default sizing to the element model and fixed the initial import size to a stable `336 x 128`.
2. Raised file-card normalization minimums to the same baseline so old or partial payloads cannot shrink below the intended first-frame card size.
3. Added centralized file-type classification by extension and MIME inside `elements/fileCard.js`.
4. Added semantic accent fields on file-card elements so Word, PDF, Excel, PPT, text, code, archive and image cards can render with distinct, restrained colors.
5. Updated the renderer to consume semantic accent fields instead of hardcoded badge colors.

Validation:

- `node --check public/src/engines/canvas2d-core/elements/fileCard.js`
- `node --check public/src/engines/canvas2d-core/rendererFileCard.js`
- Static path audit confirmed file-card creation still flows through `createFileCardElement()` / `normalizeFileCardElement()` and no second sizing/color system was introduced elsewhere in Canvas2D.

Future constraints:

- Keep file-card size defaults, type classification and accent tokens centralized in `public/src/engines/canvas2d-core/elements/fileCard.js`.
- Do not reintroduce per-renderer or per-importer file-type guessing.
- If stronger file-type differentiation is added later, extend the existing semantic accent fields instead of hardcoding more renderer colors.

## 2026-05-01 Screen Source Menu Close-Timing Fix

Problem:

- User-visible symptom: in 映射控制, refreshing targets or choosing a different target would immediately close the secondary menu, forcing the user to reopen it for each step.
- Root cause category: interaction state-machine bug.
- Root cause: `refresh` actions unconditionally closed the header/overflow menus in `finally`, and target-option clicks immediately closed the target picker instead of keeping it open until the user explicitly starts embedding.

Files changed:

- `public/src/runtime/workbenchRuntime.js`

Fix mechanism:

1. Removed unconditional menu-close behavior from the `刷新目标` action.
2. Removed auto-close behavior from target-option selection inside the target picker.
3. Kept menu closing on the explicit `开始嵌入 / 关闭嵌入` action path so commitment still ends the browsing flow cleanly.

Validation:

- `node --check public/src/runtime/workbenchRuntime.js`
- Static runtime-path verification around `screenSourceActionButtonEls.refresh`, `screenSourceActionButtonEls.embedToggle`, and `screenSourceSelectPanelEl` event handlers.

Future constraints:

- Do not close a chooser menu during browsing/selection actions when the next expected user action is still inside that same menu.
- Keep “selection state update” and “commit action close” as separate phases in menu state machines.

## 2026-05-01 Canvas Split Button And Non-Destructive Merge Adjustment

Problem:

- The previous rich-text change removed the standalone `分割线` button from the single-text toolbar and placed structure actions behind a submenu, which did not match the intended interaction.
- The previous `合并文本` implementation was destructive: it replaced the original selected text boxes instead of generating a new merged text box.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Restored the standalone `分割线` button in the rich-text toolbar.
2. Added a separate `拆分文本` button immediately after it, using a divider-with-cross visual `—✕—`.
3. Changed `拆分文本` to execute immediately in edit mode by inserting the split marker and committing the split in the same action.
4. Changed `合并文本` to preserve the original selected text boxes and generate one new merged text box below the source selection.
5. Removed artificial blank separators between merged segments so the new merged content is concatenated without extra whitespace padding.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Do not hide primary rich-text structural actions behind a submenu when the interaction is meant to be one-click.
- Keep destructive merge and non-destructive “generate merged copy” semantics explicitly separated.

## 2026-05-01 Canvas Rich Text Split And Merge Actions

Problem:

- User-visible requirement: add `拆分文本` and `合并文本` into the existing Canvas2D rich-text secondary menu system.
- `拆分文本` must turn one rich-text box into multiple text boxes without introducing a second edit pipeline.
- `合并文本` must merge only pure rich-text boxes in document order and reject tables, code blocks, math blocks and mixed selections.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/editors/richTextAdapter.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added a `文本结构` rich-text secondary submenu and moved structural actions into it.
2. Added an editor-side split-marker command instead of fragile DOM-offset splitting.
3. Extended the existing commit-text pipeline so the split marker is consumed at commit time and replaced by multiple real text items through the current split/history path.
4. Added a multi-selection `合并文本` action inside the existing context-menu submenu system.
5. Restricted merge targets to `text` items only and sorted them by top-to-bottom then left-to-right bounds before rebuilding one normalized rich-text item.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/engines/canvas2d-core/editors/richTextAdapter.js`
- Static search confirmed the new actions are wired through submenu UI, editor command dispatch, commit-time split handling and multi-selection context-menu actions.

Future constraints:

- Do not implement text split by direct DOM range surgery unless the rich-text selection model is upgraded first.
- Do not broaden `合并文本` to mixed element types without defining a real cross-type document merge model first.

## 2026-05-01 Removed Canvas Drag Resize Loading Overlay

Problem:

- User-visible symptom: the canvas drag/resize transition overlay felt unnecessary and visually weaker than the original direct canvas behavior.
- Root cause category: over-designed transient masking.
- Root cause: a dedicated loading overlay, extra DOM and a canvas-only busy state class had been introduced for left-canvas drag/resize transitions.

Files changed:

- `public/index.html`
- `public/ui.shell.css`
- `public/src/runtime/workbenchRuntime.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Removed the canvas resize loader DOM from `#canvas-engine-stage`.
2. Removed the overlay styles and canvas surface fade rules from the shell stylesheet.
3. Removed the custom `is-canvas-stage-busy` runtime class toggling from panel move/resize handlers.
4. Restored the previous direct-render transition path while preserving all unrelated canvas and layout changes.

Validation:

- Static search confirmed no remaining `canvas-resize-loader` or `is-canvas-stage-busy` references in the reverted runtime/shell files.

Future constraints:

- If drag/resize transitions are revisited later, do not reintroduce them as a broad masking layer without validating the actual user benefit first.

Update:

- The remaining gray flash during drag was traced to the underlying dark canvas shell backgrounds becoming briefly visible during repaint. Those base layers were shifted to a light whiteboard surface to remove the dark-gray flash without reintroducing any loading mask.

## 2026-05-01 Canvas Resize Loading Placeholder Instead Of Black Frame

Problem:

- User-visible symptom: while the canvas work area was being stretched or panel-resized, the stage could flash black or show laggy intermediate frames.
- Root cause category: resize-time rendering exposure.
- Root cause: the shell kept the real canvas surface visible during `is-resizing` / `is-stage-dragging` / `is-pane-y-resizing`, so transient repaint gaps were exposed directly to the user.

Files changed:

- `public/index.html`
- `public/ui.shell.css`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added a dedicated canvas-local resize loading overlay inside `#canvas-engine-stage`.
2. Reused the existing FreeFlow shimmer logo treatment instead of introducing a second loading visual system.
3. Scoped the overlay to the existing global resize state classes so no new runtime state source was added.
4. Temporarily fade out the real canvas surface only while resizing, then restore it immediately after the resize state clears.

Validation:

- Static selector validation against the existing resize state classes emitted by `public/src/runtime/workbenchRuntime.js`.
- Verified the overlay is stage-local and does not block normal canvas interaction outside resize states.

Future constraints:

- Do not introduce a second resize-state flag for this feature; continue to bind to the existing body classes.
- Keep resize masking local to the canvas stage so conversation and side panels are not affected.

Update:

- Refined the resize overlay palette so it follows the active theme variables instead of rendering as a fixed near-black mask.
- Removed the inner gray underlay from the resize overlay and dropped the logo shell glow so only the moving shimmer remains.
- Narrowed the trigger logic to a canvas-only busy state so dragging or resizing the chat-side panel no longer shows the canvas loading overlay, and shifted the overlay surface toward a lighter board-like tone.
- Flattened the resize overlay into a static pure-white surface and removed the remaining gradient/glow treatment from the background layer.
- Advanced the topbar occlusion threshold so the top-left info panel fully hides before the right search/export strip visually collides with it, then restores once clear again.
- Fixed the top-left info panel occlusion check to include the whole right topbar stack and toolbar wrap, not just the lower search/export row, so early overlap from the upper toolbar now also hides the info panel.

## 2026-05-01 Chat Transparency And Theme Canvas Opacity Control

Problem:

- User-visible symptom: the chat area still looked too solid, and the canvas background transparency could not be adjusted from theme settings.
- Root cause category: missing theme field / shell transparency rigidity.
- Root cause: theme settings only exposed `panelOpacity` and `backgroundOpacity`; there was no dedicated `canvasOpacity` field wired through normalization, persistence, preview and CSS variables. The final shell override layer also kept the conversation panel on a relatively opaque background mix.

Files changed:

- `public/src/theme/themeSettings.js`
- `src/backend/models/themeSettingsModel.js`
- `public/src/theme/themeCssVariables.js`
- `public/src/components/theme/themeSettingsPanel.js`
- `public/src/runtime/workbenchRuntime.js`
- `public/styles.css`
- `public/ui.shell.css`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added `canvasOpacity` as a first-class theme setting across frontend and backend normalization/persistence.
2. Added a `画布透明度` slider in the custom theme controls below the existing opacity controls.
3. Exposed `--canvas-viewport-alpha` and bound canvas stage background alpha to that CSS variable.
4. Reduced the conversation panel background alpha in the final shell layer so the chat area is semi-transparent by default.

Validation:

- Static end-to-end check of the theme field flow: panel UI -> runtime payload -> `/api/theme-settings` -> backend normalization -> CSS variables.
- Verified the final chat shell and canvas stage selectors use the new transparency values.

Future constraints:

- Do not add a second local-only canvas transparency state; it must remain inside the unified theme settings pipeline.
- Keep chat transparency changes in the final shell override layer so earlier base styles cannot silently override them.

## 2026-05-01 Shell UI Shadow Reduction And Visual Cleanup

Problem:

- User-visible symptom: several frontend surfaces, especially the right conversation panel, buttons, message bubbles and menus, still looked too heavy because large decorative shadows were stacked across the shell override layer.
- Root cause category: inconsistent elevation system / excessive shadow layering.
- Root cause: `public/ui.shell.css` is loaded after the base styles and reintroduced strong shadows for persistent work surfaces and controls, so even when some earlier styles were flatter, the final shell still rendered a heavy UI.

Files changed:

- `public/ui.shell.css`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Reduced the right conversation panel from a heavy lifted card to a flatter shell surface with border-led separation.
2. Removed button/control shadows from restore controls, shell pills, primary/ghost buttons, and small action triggers.
3. Kept overlay menus and drawers on a lighter single floating shadow instead of multi-layer deep shadows.
4. Flattened message bubbles, composer and canvas cards so the UI reads cleaner and more aligned.

Validation:

- Verified stylesheet load order in `public/index.html` so the shell override layer remains the final authority.
- Static selector audit across chat panel, buttons, menus and drawer surfaces.

Future constraints:

- Persistent shell surfaces should stay flat or near-flat; reserve visible elevation for transient overlays only.
- Avoid adding multi-layer decorative shadows back onto pills, icon buttons or message surfaces.
