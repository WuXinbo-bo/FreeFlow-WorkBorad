# Change Trace Log

日志维护规则：

- 最新记录放在最上方。
- 最多保留最近 10 条记录。
- 新增第 11 条时删除最旧记录。

## 2026-05-02 Win32 Native Embed Keyboard Focus Exit Alignment

Problem:

- User-visible symptom: after the AI mirror starts through the Win32 native embedding mode, keyboard input can remain unavailable to the canvas even after clicking back into renderer-owned regions.
- Root cause category: split focus ownership / asymmetric native embed lifecycle.
- Root cause: the Win32 native embed path had explicit focus-enter behavior through `focusEmbeddedWindow()`, but unlike the `WebContentsView` path it had no explicit focus-exit or blur/release path. Renderer focus restoration therefore remained incomplete when leaving the native embedded window.

Files changed:

- `electron/win32/externalWindowEmbed.js`
- `electron/main.js`
- `.codex-traceability/architecture-map.md`
- `.codex-traceability/module-registry.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added explicit native embedded-window blur/release support in `externalWindowEmbed.js`.
2. Exposed that exit behavior through the same main-process renderer-focus restoration path used when the user clicks back into canvas/assistant/screen renderer regions.
3. Made `focusRendererSurface()` release both Win32 native embedded focus and `WebContentsView` embedded focus before restoring BrowserWindow and renderer `webContents` focus.
4. Replaced the weak Win32 blur approach with explicit focus transfer using attached input queues and Win32 foreground/active/focus handoff, because native embedded windows do not reliably relinquish keyboard control through renderer-side intent alone.

Validation:

- `node --check electron/win32/externalWindowEmbed.js`
- `node --check electron/main.js`
- `npm run start:desktop` boot smoke test

Future constraints:

- Win32 native embedded focus behavior must remain symmetric: every focus-enter path needs a matching explicit exit path.
- Do not rely on renderer click handling alone to reclaim keyboard input from native embedded windows.

## 2026-05-02 Canvas Topbar Collision Now Auto-Collapses Info Panel

Problem:

- User-visible requirement: when the top-right canvas interaction controls collide with the left info panel, the left panel should not disappear abruptly. It should transition into its existing compact collapsed state so the motion stays continuous.
- Root cause category: UI state mismatch / non-continuous collision fallback.
- Root cause: the current collision logic in the Canvas2D topbar used an `auto hidden` state that directly hid the left info panel, while the product already had a separate collapsed mini-state with an established transition. This made overlap handling feel discontinuous and visually inconsistent.

Files changed:

- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/styles.css`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Replaced collision-driven `infoPanelAutoHidden` behavior with `infoPanelAutoCollapsed` in the Canvas2D React topbar owner.
2. Reused the existing `is-info-collapsed` and `is-collapsed` visual state so collision handling now goes through the established compact-minimized presentation instead of a separate hide path.
3. Removed the CSS rule that fully hid the left info corner on collision, preserving the current width/padding transition animation instead of abrupt disappearance.
4. Added hysteresis to the collision rule by separating the collapse threshold from the release threshold, so the info panel no longer oscillates when the top-right controls stop near the overlap boundary.
5. Switched collision measurement to a stable expanded-width model and added a short auto-collapse hold window, preventing oscillation caused by reading animated intermediate widths during the collapse transition.
6. Enlarged the collapsed info-panel control so its visual size aligns more closely with the first right-side toolbar control.

Validation:

- `node --check public/src/engines/canvas2d-core/ui/index.jsx`

Future constraints:

- Collision resolution between the top-right control cluster and the left info panel should prefer existing compact states over introducing hide-only fallback states.
- Do not reintroduce a parallel `auto hidden` visual path for the same collision case unless the full topbar interaction model is redesigned together.

## 2026-05-02 Default AI Mirror Render Mode Switched To WebContentsView

Problem:

- User-visible requirement: make `WebContentsView` the default AI mirror embed mode instead of Win32 embedding.
- Root cause category: startup default mismatch risk.
- Root cause: the default AI mirror render mode was still falling back to `win32` in the runtime normalization/load path, while the screen-source state also initialized with `renderMode: "win32"`. Changing only UI text or only one of these points would leave first-run behavior and fallback behavior inconsistent.

Files changed:

- `public/src/runtime/workbenchRuntime.js`
- `public/src/state/createInitialState.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added a single runtime default constant for AI mirror render mode in `workbenchRuntime.js` and switched it to `webcontentsview`.
2. Updated `normalizeScreenSourceRenderMode()` and `loadScreenSourceRenderMode()` so first-run users and invalid cached values both fall back to `webcontentsview`.
3. Updated initial in-memory screen-source state in `createInitialState.js` to match the same default, avoiding startup/state drift before localStorage hydration finishes.

Validation:

- `node --check public/src/runtime/workbenchRuntime.js`
- `node --check public/src/state/createInitialState.js`

Future constraints:

- Keep AI mirror render-mode defaults centralized; do not reintroduce conflicting fallback literals in other modules.
- Existing users with an explicit localStorage render mode should continue to keep their saved preference unless a migration is intentionally added.

## 2026-05-02 AI Mirror Keyboard Focus Ownership Stabilization

Problem:

- User-visible symptom: when left or right AI mirror embedding is enabled, keyboard input may be misdetected, causing canvas shortcuts or renderer-side keyboard interception to compete with typing inside the embedded AI mirror surface.
- Root cause category: IPC/bridge mismatch / split focus ownership.
- Root cause: keyboard ownership was inferred inside the renderer from `event.target`, hover state, and local clipboard-zone heuristics, but the AI mirror runs in an Electron `WebContentsView` outside the renderer DOM tree. This made renderer-side keyboard handlers incapable of reliably knowing when the real OS/webcontents focus had moved into the embedded mirror.

Files changed:

- `electron/main.js`
- `electron/preload.js`
- `electron/web/webContentsViewEmbed.js`
- `public/src/state/createInitialState.js`
- `public/src/runtime/workbenchRuntime.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `.codex-traceability/architecture-map.md`
- `.codex-traceability/module-registry.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added an explicit desktop-shell keyboard focus owner in `electron/main.js` and exposed it through the existing desktop shell state broadcast instead of relying on renderer-only heuristics.
2. Wired `electron/web/webContentsViewEmbed.js` focus and blur callbacks into main-process keyboard ownership so AI mirror focus becomes authoritative when the embedded `WebContentsView` is active.
3. Added preload IPC `desktop-shell:set-keyboard-focus-owner` so the renderer can explicitly publish `canvas`, `assistant`, and `screen` focus ownership when local UI regions receive focus/pointer intent.
4. Updated `workbenchRuntime.js` to synchronize that ownership, mirror it into a read-only renderer-global marker, and hard-stop its legacy document-level keyboard handler when the owner is `ai-mirror`.
5. Updated `createCanvas2DEngine.js` to bail out from canvas keyboard shortcuts whenever the desktop keyboard owner is `ai-mirror`, preventing canvas hotkeys from stealing input from the embedded AI surface.
6. Refined the model from `owner sync only` to `owner sync + native renderer focus restore`, because switching away from a `WebContentsView` also requires giving BrowserWindow/renderer `webContents` real focus back before canvas editing can reliably resume.
7. Removed system-level auto-refocus paths that kept calling `focusEmbeddedScreenSourceWindow()` during embed mount, layout sync, and right-panel view transitions, because those callbacks could immediately steal focus back from the canvas after the user clicked out of the AI mirror.

Validation:

- `node --check electron/main.js`
- `node --check electron/preload.js`
- `node --check electron/web/webContentsViewEmbed.js`
- `node --check public/src/state/createInitialState.js`
- `node --check public/src/runtime/workbenchRuntime.js`
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`

Future constraints:

- Do not attempt to fix embedded-AI keyboard bugs with more renderer DOM hover/target heuristics; the keyboard owner must remain explicit.
- Keep `electron/main.js` as the single authoritative owner for desktop keyboard focus state, with renderer and `WebContentsView` acting only as reporters.
- Any future keyboard shortcut layer added in renderer or canvas modules must guard against `keyboardFocusOwner === "ai-mirror"` before intercepting input.

## 2026-05-02 Canvas Image Management Domain Upgrade

Problem:

- User-visible requirement: fix the unstable image-related experience around image import, image insertion, and screenshot-generated images on the canvas, and upgrade the old `画布图片位置` utility into a complete `画布图片管理` capability with its own UI surface.
- Root cause category: fragmented image workflow / incomplete asset-domain ownership.
- Root cause: image path selection existed as scattered setting actions, while actual image persistence, screenshot-to-image insertion, clipboard image intake, and managed-file visibility were split across unrelated flows. Users had no unified place to inspect managed image assets, and maintainers had no single domain entry for debugging image-path/persistence issues.

Files changed:

- `electron/main.js`
- `electron/preload.js`
- `public/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js`
- `public/src/engines/canvas2d-core/store.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/reactBridge.js`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/src/engines/canvas2d-core/ui/CanvasImageManagerDialog.jsx`
- `public/styles.css`
- `.codex-traceability/architecture-map.md`
- `.codex-traceability/module-registry.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Kept `uiSettingsService` as the only persisted authority for `canvasImageSavePath`, and kept `createCanvas2DEngine.js` as the only runtime owner for image-manager state.
2. Added desktop IPC for image-directory listing and clipboard-image reading, instead of introducing ad hoc renderer-only filesystem logic.
3. Extended `createCanvasImageStorageManager.js` so the existing image persistence module also resolves the managed-image folder and lists managed images, preserving a single image-storage policy.
4. Added an engine-owned `canvasImageManager` read model that derives current managed images plus missing canvas image references, and refreshes after import, screenshot insertion, clipboard image insertion, and image-path updates.
5. Replaced the old `画布图片位置` menu subtree with a dedicated `画布图片管理` dialog that unifies folder actions, local image import, clipboard image import, system screenshot import, and managed-image listing in one product surface.

Validation:

- `node --check electron/main.js`
- `node --check electron/preload.js`
- `node --check public/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js`
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Do not create a second image-path or image-manager persistence owner outside `uiSettingsService` and Canvas2D engine orchestration.
- Keep screenshot, clipboard image intake, and local-image import converging back into the same engine/image-storage flow so bug fixes remain traceable in one place.
- If relink/replace/missing-file repair is added later, extend `CanvasImageManagerDialog.jsx` and the existing engine image-manager APIs instead of adding another image-fixing panel elsewhere.

## 2026-05-02 Full Product Architecture Refactor Pass

Problem:

- User-visible requirement: perform a one-pass product-level refactor across the project, keeping functionality unchanged while simplifying code, splitting oversized files, and fixing latent structural bugs.
- Root cause category: oversized-entry accumulation / duplicated-runtime responsibilities.
- Root cause: core runtime owners had grown into large mixed-responsibility files. `createCanvas2DEngine.js` still bundled workspace orchestration, export-history state, imported-image persistence, preview state, and rendering concerns. `workbenchRuntime.js` likewise mixed startup context bridging, UI settings cache rules, canvas storage restore logic, and workbench UI orchestration. This made future changes error-prone and already produced duplicate declarations and half-finished extractions.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/workspace/createCanvasWorkspaceManager.js`
- `public/src/engines/canvas2d-core/export/createCanvasExportHistoryManager.js`
- `public/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js`
- `public/src/runtime/workbenchRuntime.js`
- `public/src/runtime/settings/createUiSettingsRuntimeBridge.js`
- `public/src/runtime/canvas/createCanvasStorageBridge.js`
- `docs/product-architecture-refactor-overview.md`
- `.codex-traceability/architecture-map.md`
- `.codex-traceability/module-registry.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Kept `createCanvas2DEngine.js` as the single Canvas2D orchestration owner, but extracted coherent sub-responsibilities into injected modules for workspace management, export history, and imported-image persistence.
2. Kept `workbenchRuntime.js` as the single workbench state owner, but extracted startup/UI-settings bridging and canvas storage/path bridging into dedicated runtime helpers.
3. Preserved all existing ownership rules: backend `uiSettingsService` remains the only settings authority, startup context remains a bridge layer, and Canvas2D state/history ownership stays in the engine.
4. Removed duplicate/legacy in-place implementations that conflicted with the new bridge/module pattern, including repeated image-storage helpers and a duplicated `loadUiSettings` declaration in `workbenchRuntime.js`.
5. Added a maintainer-facing architecture overview document so the new split is explicit and future refactors can continue from the same module boundaries instead of re-growing the entry files.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/engines/canvas2d-core/export/createCanvasExportHistoryManager.js`
- `node --check public/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js`
- `node --check public/src/runtime/workbenchRuntime.js`
- `node --check public/src/runtime/settings/createUiSettingsRuntimeBridge.js`
- `node --check public/src/runtime/canvas/createCanvasStorageBridge.js`
- `npm run build:canvas2d-ui`

Future constraints:

- `createCanvas2DEngine.js` and `workbenchRuntime.js` remain the only state/orchestration owners for their domains; new modules must stay injected and stateless with respect to ownership.
- Do not move UI settings truth, recent-board truth, or startup truth into browser-only helper modules.
- Continue future splitting by coherent responsibility clusters only; avoid cross-cutting “mega refactors” that mix startup, persistence, preview, and rendering policy in the same patch.

## 2026-05-02 Canvas Workspace Manager Extraction Stabilization

Problem:

- User-visible requirement: start a system-level refactor without changing functionality, especially by splitting the oversized Canvas2D engine file into more maintainable modules.
- Root cause category: oversized-module coupling / partial-refactor inconsistency.
- Root cause: `createCanvas2DEngine.js` had already begun a workspace/file-management extraction, but the repo was left in an invalid intermediate state where the new `workspace` module and the original engine block both coexisted. The extracted code also drifted from the real state owner by reading `state.useLocalFileSystem` and `state.suppressDirtyTracking`, while the authoritative values still lived as engine-local variables/functions.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/workspace/createCanvasWorkspaceManager.js`
- `.codex-traceability/architecture-map.md`
- `.codex-traceability/module-registry.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Finished the workspace/file-management extraction by turning `createCanvasWorkspaceManager.js` into an injected submodule instead of a shadow implementation.
2. Passed the real single-source dependencies from the engine into the manager, including `useLocalFileSystem`, board/file helpers, edit cancelers, board-switch/save operations, and a setter for the engine-local `suppressDirtyTracking`.
3. Removed the duplicated workspace/file-management function block from `createCanvas2DEngine.js` and redirected the public engine API to the manager methods, preserving the external call surface.
4. Kept persistence ownership, startup flow, desktop-shell IPC usage, and `BoardWorkspaceDialog.jsx` ownership unchanged so the refactor remains structural only.
5. Recorded the new module boundary in traceability docs so future refactors continue from the injected-submodule model instead of re-growing the engine file.

Validation:

- `node --check public/src/engines/canvas2d-core/workspace/createCanvasWorkspaceManager.js`
- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`

Future constraints:

- Keep `public/src/engines/canvas2d-core/createCanvas2DEngine.js` as the orchestration owner; extracted submodules may coordinate behavior but must not create a second persistence or startup source.
- Any future workspace/file-management split must inject `useLocalFileSystem`, dirty-tracking control, and board path helpers from the engine instead of reading guessed fields from `state`.
- Continue splitting the 20k-line engine by coherent responsibility clusters only; do not attempt cross-cutting rewrites that mix startup, persistence, preview, and interaction state in one pass.

## 2026-05-02 Search And Export-History Trigger Unification

## 2026-05-02 Canvas Workspace Tone And Delete-Confirm Refinement

Problem:

- User-visible requirement: keep the workspace dialog aligned with the existing blue-based product tone instead of drifting toward black-heavy accents, add explicit interaction feedback for open/save actions, and add a delete-board entry with destructive confirmation.
- Root cause category: product-tone drift / missing action feedback / missing destructive guardrail.
- Root cause: the previous workspace refactor tightened hierarchy but pushed the primary accents too dark, and the file actions still relied too much on silent state changes. The workspace also lacked a controlled delete path for non-active board files.

Files changed:

- `electron/preload.js`
- `electron/main.js`
- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/reactBridge.js`
- `public/src/engines/canvas2d-core/ui/BoardWorkspaceDialog.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Shifted workspace primary accents back to the existing blue/cyan product family for file icons, selected states, primary buttons, and active indicators.
2. Added point-of-action feedback inside the workspace side panel for folder switching, open, save, save-as, rename, create, and delete completion.
3. Added a single delete-file path through the existing desktop-shell bridge and Canvas2D engine, without introducing a parallel file-management owner.
4. Restricted deletion of the currently opened board file to avoid breaking the active in-memory board flow; users must switch away first.
5. Added a confirmation dialog before deletion so destructive action now requires explicit second confirmation.

Validation:

- `npm run build:canvas2d-ui`

Future constraints:

- Keep workspace destructive actions inside `BoardWorkspaceDialog.jsx` as the single workspace/file-management UI owner.
- Do not allow direct deletion of the currently opened board without a broader active-board lifecycle design.
- Keep workspace accents in the current light blue product family unless the whole canvas utility language changes together.

Problem:

- User-visible requirement: unify the top-right `搜索画布` trigger and `最近导出` trigger as the same interaction family, further simplify search UI density, and rebuild the recent-export popup into a more minimal product surface.
- Root cause category: sibling-utility inconsistency / information-density drift.
- Root cause: after the search redesign, the search trigger and export-history trigger no longer belonged to the same visual/interaction family. In parallel, the search popup still kept avoidable label/background weight, while recent export still used a heavier descriptive list structure than necessary for a utility history surface.

Files changed:

- `public/src/engines/canvas2d-core/search/canvasSearchOverlay.jsx`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Removed the extra `Ctrl/Cmd + K` pill background treatment so the search panel header reads cleaner and lighter.
2. Reduced search result chrome by dropping extra visible match/type labeling and keeping the list focused on title, short matched text, and the active keyboard affordance.
3. Rebuilt the recent-export trigger into the same orb-style utility button family as search, including matching size, depth, hover response, and popup anchoring.
4. Reconstructed the recent-export popup into a lighter history surface: simpler heading/meta, more compact export cards, reduced copy, and tighter action signals.
5. Kept both controls inside the same existing topbar/search state architecture so the visual unification does not create new ownership or layout systems.

Validation:

- `npm run build:canvas2d-ui`

Future constraints:

- Keep `搜索画布` and `最近导出` in the same top-right utility-button family unless the full topbar language changes together.
- Do not reintroduce verbose labels, decorative hotkey pills, or multi-line explanation-heavy history rows into these two utility popups.

## 2026-05-02 Canvas Search UI Full Redesign

Problem:

- User-visible requirement: fully redesign the `搜索画布` interaction surface, including both the collapsed trigger state and the expanded search panel, while keeping the current FreeFlow style family.
- Root cause category: utility-overlay hierarchy / product-expression weakness.
- Root cause: the previous search popup already improved trigger size, but it still read like a light patch instead of a mature product search surface. The trigger lacked identity, the expanded state lacked stronger hierarchy and motion, and the result cards did not express type, match context, and keyboard affordance clearly enough.

Files changed:

- `public/src/engines/canvas2d-core/search/canvasSearchOverlay.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Kept the existing search state owner, result builder, keyboard flow, and topbar mount path unchanged so the redesign stays inside the current architecture boundary.
2. Rebuilt the collapsed trigger into a more productized orb with restrained depth, hover lift, and a subtle focus glow instead of a plain utility dot.
3. Reconstructed the expanded panel into a stronger anchored search surface with a denser input header, compact keyboard/status strip, horizontal scope chips, and calmer text density.
4. Upgraded result rows into typed action cards with per-type glyphs, stronger title/meta separation, clearer match labels, and active-result affordance that reads closer to command/search palettes used in mature desktop tools.
5. Added restrained open motion and responsive wrapping rules so the search surface keeps the same interaction identity on narrower widths without reverting to a wide always-visible search bar.

Validation:

- `npm run build:canvas2d-ui`
- Active-window screenshot review of the running UI confirmed the compact trigger and redesigned search popup render in the top-right canvas utility area.
- `node --check public/src/engines/canvas2d-core/search/canvasSearchOverlay.jsx` is not applicable in this environment because Node does not syntax-check `.jsx` directly and returns `ERR_UNKNOWN_FILE_EXTENSION`.

Future constraints:

- Keep search state in `public/src/engines/canvas2d-core/ui/index.jsx`; do not introduce a second search owner or persistence path.
- Keep the idle state icon-first and the detailed state popup-first; do not regress to a permanently expanded topbar search bar unless the topbar architecture itself changes.
- Future search UI iteration should preserve the current keyboard contract: `Ctrl/Cmd + K`, `↑ / ↓`, `Enter`, `Esc`.

## 2026-05-02 Create-UI Skill Critical-Evolution Upgrade

Problem:

- User-visible requirement: the local `create-ui` skill should have stronger design judgment, meaning it can push the current design forward instead of being trapped by it, while still remaining unified with the existing style.
- Root cause category: evolution-governance gap.
- Root cause: the skill strongly emphasized compatibility and system continuity, but it did not explicitly require critical thinking about when the current UI should be preserved versus thoughtfully evolved.

Files changed:

- `.project-skills/create-ui/SKILL.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added explicit language that the skill must show design judgment and evolve weak/generic/dated expression when needed.
2. Added `Critical evolution` as a formal design rule.
3. Added a dedicated `Design Thinking Standard` section that distinguishes preservation, strengthening, and stylistically coherent evolution.
4. Extended delivery requirements so substantial UI work must explain what was preserved, what was evolved, and why the result remains unified.
5. Added red lines against both stagnation (`blindly freezing the current UI`) and disconnected novelty (`breaking the existing product family`).

Validation:

- Static review of `.project-skills/create-ui/SKILL.md` after patching to confirm the new evolution rules remain compatible with the existing research-first and compatibility-first workflow.

Future constraints:

- Future `$create-ui` work should treat compatibility as a boundary, not as an excuse for weak repetition.
- Innovation should continue to be judged by the standard `same system, stronger expression`.

## 2026-05-02 Create-UI Skill Motion And Text-Economy Upgrade

Problem:

- User-visible requirement: extend the local `create-ui` skill so it explicitly designs UI motion/effects and pushes the visual result toward high-end minimalism with less meaningless text and stronger use of pattern/icon language.
- Root cause category: design-rule gap.
- Root cause: the skill had already been upgraded for broad research and market fit, but it still did not explicitly treat motion, visual effects, text economy, and pattern language as first-class design constraints.

Files changed:

- `.project-skills/create-ui/SKILL.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Added `Designed motion` as an explicit design rule so animation and effects are treated as intentional product-surface design rather than incidental polish.
2. Added dedicated sections for motion/effects, text economy, and pattern/shape standards.
3. Added rules that prefer iconography, geometry, subtle patterning, and layout rhythm over redundant explanatory text where appropriate.
4. Added explicit red lines against filler copy and visually flashy but semantically useless motion/effects.
5. Extended delivery and checklist requirements so motion, effects, iconography, and text density must be consciously justified.

Validation:

- Static review of `.project-skills/create-ui/SKILL.md` after patching to confirm the new standards align with the existing minimalist and productized direction.

Future constraints:

- Future `$create-ui` work should treat motion, icon/pattern language, and text reduction as part of the design decision, not late polish.
- “High-end minimalism” should continue to mean lower noise with stronger intentionality, not less effort or less hierarchy.

## 2026-05-02 Create-UI Skill Research And Market-Fit Upgrade

Problem:

- User-visible requirement: the local `create-ui` skill was not strict enough about broad web research, minimalist direction, market aesthetics, and productized output quality.
- Root cause category: workflow-spec weakness.
- Root cause: the skill already required research-first UI work, but it did not strongly enough enforce broad multi-site discovery, market-fit validation, or anti-generic minimalist standards as hard constraints.

Files changed:

- `.project-skills/create-ui/SKILL.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Strengthened the skill target from `industrial-grade minimalist compatible UI` to `industrial-grade minimalist, market-aligned, productized UI`.
2. Upgraded research requirements from targeted reference lookup to broad multi-site web research, including shipped products, design systems, component libraries, implementation articles, and high-signal real-product case references.
3. Added explicit research quality rules so the skill does not stop at a few familiar sites or confuse decorative inspiration with market-valid product patterns.
4. Added hard requirements for `minimalist market fit`, `productized polish`, and anti-generic AI-looking output standards.
5. Expanded red lines and checklist items so broad research coverage and market-plausible minimalist output are now part of the delivery gate.

Validation:

- Static review of `.project-skills/create-ui/SKILL.md` after patching to confirm the new workflow, aesthetic rules, red lines, and checklist are internally consistent.

Future constraints:

- Future UI work using `$create-ui` should treat broad external research and market-fit judgment as mandatory, not optional polish.
- “Minimalist” should continue to mean disciplined and commercially credible, not empty, trendy, or generic.

## 2026-05-02 Canvas Search Popover And Word Preview UI Rollback

Problem:

- User-visible requirement: roll back the current Word export preview UI treatment because it felt over-designed, and change canvas search to an icon-first trigger that opens a popup search surface on demand.
- Root cause category: utility-surface density / trigger hierarchy mismatch.
- Root cause: the Word export preview dialog spent too much space on sidecar metadata chrome relative to the core preview task, while the search entry consumed a full-width pill even in the idle state instead of behaving like a compact topbar utility.

Files changed:

- `public/src/engines/canvas2d-core/ui/WordExportPreviewDialog.jsx`
- `public/src/engines/canvas2d-core/search/canvasSearchOverlay.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Simplified the Word export preview dialog back to a single-surface layout: header, compact stats/meta, preview body, optional skip note and bottom actions.
2. Removed the heavy right-side export settings column while keeping the existing preview render path, zoom controls, cancel and confirm flow unchanged.
3. Changed the idle canvas search entry from a wide descriptive pill to a single round search icon.
4. Kept the existing search result engine and keyboard flow, but changed the visible interaction to an anchored popup panel that opens beneath the icon trigger.

Validation:

- `node --check public/src/engines/canvas2d-core/reactBridge.js`
- `npm run build:canvas2d-ui`
- Generated bundle search confirmed the simplified Word preview structure and icon-triggered search popup classes are present.

Future constraints:

- Word export preview should prioritize preview readability and the confirm/cancel path; avoid rebuilding a second explanatory side panel unless the export logic itself changes.
- Search should stay object-light in the idle topbar state and reveal detail only after explicit trigger.

## 2026-05-01 Canvas2D Topbar Product UI Refinement

Problem:

- User-visible requirement: upgrade the Canvas2D topbar/product UI while preserving the current FreeFlow visual system; specifically improve the left info panel collapsed state, add table/code-block interactions to the top-right toolbar, enrich search secondary UI, and rebuild the opened export history panel.
- Root cause category: canvas utility UI hierarchy / progressive disclosure gap.
- Root cause: table and code block creation existed in lower-level canvas/context-menu flows but not in the primary toolbar bridge; search lacked a secondary scope/status layer; export history used a flat list that did not separate type, target, status and recency; the left info collapsed state still consumed too much space.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/reactBridge.js`
- `public/src/engines/canvas2d-core/ui/index.jsx`
- `public/src/engines/canvas2d-core/search/canvasSearchOverlay.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Followed `$create-ui` workflow: reused Canvas2D white floating-card/menu language, existing React UI state owner, existing engine bridge, and generated-bundle build path.
2. Added a compact insert popover in the top-right toolbar for table and code block creation, keeping visible primary tools stable and putting the new structured insert actions behind one focused trigger.
3. Added `addTable()` and `addCodeBlock()` to the engine API and React bridge, creating items at the viewport center and immediately entering their existing edit flows.
4. Added search stats and a secondary scope/status strip for canvas content, text, nodes, files and images, with clearer empty/no-result copy and keyboard hints.
5. Rebuilt the opened export history panel into a structured list with kind badge, title/path, scope/time/openability chips and record index while preserving the existing compact trigger.
6. Refined the left info panel collapsed state into a smaller rail-style card with a clearer expand affordance, without changing the expanded information panel behavior or auto-hide logic.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `node --check public/src/engines/canvas2d-core/reactBridge.js`
- `npm run build:canvas2d-ui`
- Generated bundle search confirmed `addTable`, `addCodeBlock`, insert menu, search subnav and export-history classes are present.

Future constraints:

- Keep Canvas2D utility additions inside the existing `ui/index.jsx` + `reactBridge.js` + engine API chain; do not add a second toolbar state owner.
- Do not expand the top-right toolbar with one button per low-frequency structured insert action; use the insert popover/overflow pattern.
- Search UI should remain a focused popover with incremental scope/status details, not a full modal or persistent side panel.
- Source changes under Canvas2D React UI must be followed by `npm run build:canvas2d-ui`.

## 2026-05-01 Canvas Workspace Dialog Progressive UI Refinement

Problem:

- User-visible requirement: the canvas workspace UI should feel cleaner and less bulky; rename should enter edit mode in place on the selected board name, and new-board creation should appear only after clicking `新建画布`.
- Root cause category: workspace action hierarchy / progressive disclosure mismatch.
- Root cause: the right-side workspace panel kept low-frequency forms visible at all times and rename still targeted the currently opened board instead of the selected workspace file.

Files changed:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `public/src/engines/canvas2d-core/ui/BoardWorkspaceDialog.jsx`
- `public/styles.css`
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`
- `.project-skills/research-first-ui-governor/SKILL.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Used research-backed progressive disclosure and inline-edit patterns before implementation.
2. Changed rename into an object-proximal inline edit state on the selected board title with focus, Enter confirm and Escape cancel.
3. Added `renameBoardAtPath()` and `revealBoardPathInFolder()` bridge methods so selected workspace files, not only the active open board, can be renamed or revealed.
4. Replaced the always-visible new-board form with a bottom `+ 新建画布` trigger that opens a compact naming dock with confirm/cancel and busy copy.
5. Kept `打开 / 保存 / 另存为 / 打开位置` immediately under the selected-board summary and tuned the panel to read as a compact desktop utility.
6. Added a project-local `research-first-ui-governor` skill to require targeted reference lookup before future UI work.

Validation:

- `node --check public/src/engines/canvas2d-core/createCanvas2DEngine.js`
- `npm run build:canvas2d-ui`
- Generated bundle search confirmed the new workspace UI classes and bridge calls are present.

Future constraints:

- Keep board-specific actions grouped near the selected-board summary.
- Do not reintroduce always-visible rename/create forms for low-frequency tasks; use object-proximal inline edit or transient creation UI.
- Future UI work should use `.project-skills/research-first-ui-governor/SKILL.md` when the task changes interaction design.
- Source edits under `public/src/engines/canvas2d-core/ui/` must be followed by `npm run build:canvas2d-ui`.

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

## 2026-05-02 Win32 AI Mirror Keyboard Focus Root-Cause Refactor

Context:

- User reported that after typing inside the Win32 native embedded AI mirror, clicking back into the canvas still left keyboard input routed to the embedded window.
- User explicitly required a root-cause fix, not patch-style edits, and requested testing.

Root cause:

- The Win32 embedded window was treated as a continuously focusable surface.
- Multiple non-user-triggered paths such as attach, bounds sync and visibility restore were auto-calling native focus restoration.
- Renderer-side focus-owner state and native embedded-window interactivity were not modeled symmetrically, so owner changes could say `canvas` while the native child window still remained able to consume keyboard input.

Files changed:

- `electron/win32/externalWindowEmbed.js`
- `electron/main.js`
- `electron/preload.js`
- `public/src/runtime/workbenchRuntime.js`
- `.codex-project-rules/absolute-directives.md`
- `.codex-traceability/architecture-map.md`
- `.codex-traceability/module-registry.md`
- `.codex-traceability/change-log.md`

Fix mechanism:

1. Refactored Win32 native embed management from focus tug-of-war to explicit interaction gating.
2. Added `EnableWindow`-based native interaction control so the embedded child window can remain visible while being non-interactive.
3. Made Win32 embed attach/minimize/visibility/bounds-sync paths stop auto-focusing the native window.
4. Centralized desktop keyboard owner changes in `electron/main.js` so any non-`ai-mirror` owner automatically disables Win32 embedded input.
5. Changed screen-panel pointer activation in `workbenchRuntime.js` to explicitly enter AI mirror mode instead of incorrectly restoring renderer focus on mirror clicks.
6. Preserved the existing renderer-focus restore path so clicking canvas/assistant continues to reclaim native renderer focus.

Validation:

- `node --check electron/win32/externalWindowEmbed.js`
- `node --check electron/main.js`
- `node --check electron/preload.js`
- `node --check public/src/runtime/workbenchRuntime.js`
- `npm run start:desktop`

Residual risk:

- Full automated end-to-end reproduction against the Win32 embedded target was not available in this environment, so final behavior still requires in-app manual verification with a real native embedded AI mirror target.

## 2026-05-02 Win32 Embedded Child-Focus Recovery Follow-up

Context:

- After the activation-overlay refactor, the user could still fail to type inside the Win32 embedded mirror even after explicit activation.

Root cause refinement:

- Restoring focus to the embedded top-level `HWND` was still insufficient for some external targets.
- Real text input can live in the previously focused child control inside the embedded process/window hierarchy.

Files changed:

- `electron/win32/externalWindowEmbed.js`

Fix mechanism:

1. Added Win32 `GetGUIThreadInfo` support to inspect the target GUI thread's current focused child handle.
2. Captured the last focused child handle before leaving embedded-input mode.
3. When re-entering embedded-input mode, preferred restoring focus to the remembered child control instead of only the top-level embedded window.
4. Kept top-level activation plus cross-thread input-queue attachment so focus recovery still works across reparented native window boundaries.

Validation:

- `node --check electron/win32/externalWindowEmbed.js`
- `npm run start:desktop`
