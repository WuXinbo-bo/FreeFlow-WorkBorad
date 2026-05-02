# Change Trace Log

日志维护规则：

- 最新记录放在最上方。
- 最多保留最近 10 条记录。
- 新增第 11 条时删除最旧记录。

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
