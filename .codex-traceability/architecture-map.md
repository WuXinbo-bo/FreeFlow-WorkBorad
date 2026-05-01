# Project Architecture Map

Last initialized: 2026-05-01

## Project Root

- Root path: `d:\FreeFlow-WorkBoard`
- Product: `FreeFlow`
- Runtime type: Electron desktop app plus Express backend plus browser-rendered workbench UI.
- Package entry: `package.json`
- Web server entry: `server.js`
- Backend runtime entry: `src/backend/index.js` -> `src/backend/runtime/serverRuntime.js`
- Desktop entry: `electron/main.js`
- Desktop preload bridge: `electron/preload.js`
- Frontend document entry: `public/index.html`
- Frontend module entry: `public/src/main.js` -> `public/src/pages/workbench/index.js`
- Main workbench runtime: `public/src/runtime/workbenchRuntime.js`
- Build/test entry: `scripts/*.js`, especially `scripts/check-*.js`, `scripts/build-canvas2d-ui.js`, `scripts/prepare-desktop-build.js`

## Top-Level Directory Roles

- `electron/`: Electron main process, preload IPC bridge, Word/DOCX export and preview, external window embedding, desktop shell controls.
- `src/backend/`: Express runtime, API routes/controllers, persistent services, data models, path/runtime config.
- `public/`: Browser UI, workbench shell, Canvas2D engine, vendored browser libraries, built UI assets and global styles.
- `scripts/`: build, release, migration and regression check scripts.
- `data/`: legacy/project data and tutorial board assets. Do not assume this is authoritative user AppData.
- `docs/`: release prep and project documentation.
- `build/`: installer assets and packaged resource metadata.
- `release/`: packaging output.

## Backend Architecture

### Server Runtime

- `server.js`: loads `.env`, imports `src/backend`, starts server when run directly.
- `src/backend/index.js`: delegates to `src/backend/runtime/serverRuntime.js`.
- `src/backend/runtime/serverRuntime.js`: creates Express app, serves `public/`, registers API routes, owns chat/control endpoints and static fallback to `index.html`.
- `src/backend/routes/index.js`: registers application routes under `/api`.
- `src/backend/routes/persistenceRoutes.js`: persistent data API routes.
- `src/backend/controllers/persistenceController.js`: controller layer for settings, permissions, sessions, canvas board and file text extraction.

### Backend Config

- `src/backend/config/paths.js`: single path authority for root paths, user AppData, canvas board directory, cache/runtime directories and persistent JSON files.
- `src/backend/config/runtime.js`: runtime provider and model configuration.
- `src/backend/config/index.js`: config aggregation.

### Backend Persistence Services

- `src/backend/services/uiSettingsService.js`: authoritative UI settings read/write service, including workbench preferences and legacy project settings migration.
- `src/backend/services/themeSettingsService.js`: theme settings facade backed by the UI settings store.
- `src/backend/services/canvasBoardService.js`: canvas board file path resolution and board read/write.
- `src/backend/services/sessionService.js`: chat/session persistence.
- `src/backend/services/permissionsService.js`: local permission store and allowed roots.
- `src/backend/services/modelProfilesService.js`: model profile persistence.
- `src/backend/services/modelProviderSettingsService.js`: model provider settings persistence.
- `src/backend/services/clipboardStoreService.js`: clipboard queue persistence.
- `src/backend/services/fileTextService.js`: server-side text extraction service.
- `src/backend/services/appStartupService.js`: startup directory creation, migrations, initial board resolution, tutorial-board launch logic, workbench preference startup context.

### Backend Models and Utilities

- `src/backend/models/uiSettingsModel.js`: UI settings schema, default values, normalization, workbench preference projection.
- `src/backend/models/themeSettingsModel.js`: theme defaults and theme normalization.
- `src/backend/models/canvasBoardModel.js`: canvas board schema and normalization.
- `src/backend/models/canvasBoardFileFormat.js`: backend `.freeflow` board envelope format constants, parser/wrapper and legacy JSON compatibility helpers.
- `src/backend/models/*Model.js`: other persistent store schemas.
- `src/backend/utils/jsonStore.js`: JSON write utility.
- `src/backend/utils/versionedStore.js`: versioned JSON read/upgrade utility.
- `src/backend/utils/envLoader.js`: `.env` loading utility.
- `src/backend/utils/fileTextExtractors.js`: file text extraction helpers.

## Electron Architecture

- `electron/main.js`: BrowserWindow creation, server startup, startup context cache, desktop shell IPC, file pickers, global shortcuts, window shape, fullscreen, click-through, export/preview pipelines.
- `electron/preload.js`: exposes `window.desktopShell` with IPC wrappers for renderer code.
- `electron/wordDocxCompiler.js`: Word DOCX AST/export compiler.
- `electron/doubao-web.js`: Doubao web integration.
- `electron/aiMirrorTargetManager.js`: AI mirror target management.
- `electron/win32/externalWindowEmbed.js`: Win32 external window embedding.
- `electron/web/webContentsViewEmbed.js`: WebContentsView embedding.

## Frontend Workbench Architecture

### Frontend Entry and Routing

- `public/src/main.js`: sets current route and boots workbench page.
- `public/src/routes/index.js`: route registry.
- `public/src/pages/workbench/index.js`: workbench page boot wrapper.
- `public/index.html`: DOM shell for panels, menus, settings, canvas host and dialogs.

### Runtime State and API

- `public/src/state/createInitialState.js`: initial in-memory application state.
- `public/src/api/http.js`: API route constants and JSON response validation.
- `public/src/config/app.config.js`: frontend config keys, localStorage keys and canvas defaults.
- `public/src/runtime/workbenchRuntime.js`: main browser runtime. Owns settings loading, UI settings cache, workbench preference application, panel layout state, settings UI event handlers, sessions, chat, canvas host coordination and startup tutorial state.

### Layout and Shell

- `public/src/runtime/layout/panelLayoutManager.js`: panel layout calculations and persistence helper.
- `public/src/runtime/layout/windowShapeCollector.js`: window shape rectangle collection.
- `public/src/runtime/layout/windowShapeSyncManager.js`: renderer-to-Electron window shape synchronization.
- `public/ui.shell.css`: workbench shell, panel, overlay and global layout styles.
- `public/styles.css`: global visual styling.

### Theme

- `public/src/components/theme/themeSettingsPanel.js`: theme setting UI.
- `public/src/theme/themeSettings.js`: frontend theme defaults and normalization.
- Backend theme persistence is intentionally backed by `uiSettingsService`; avoid creating a separate theme JSON store without changing the registry.

## Canvas2D Architecture

### Main Engine

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`: Canvas2D engine factory, board loading/saving coordination, canvas interactions, export history, UI settings cache access, recent board path resolution, import/export orchestration.
- `public/src/engines/canvas2d-core/boardFileFormat.js`: renderer `.freeflow` board envelope format constants, parser/wrapper and legacy JSON compatibility helpers.
- `public/src/engines/canvas2d-core/ui/index.jsx`: React UI entry for Canvas2D-specific dialogs/panels.
- `public/src/engines/canvas2d-core/reactBridge.js`: bridge between imperative engine and React UI.
- `public/src/engines/canvas2d-core/ui/BoardWorkspaceDialog.jsx`: canvas workspace/file management dialog.
- `public/assets/canvas2d-ui/current/canvas2d-ui.js`: built Canvas2D UI bundle; source changes require rebuild.

### Structured Import Pipeline

- `public/src/engines/canvas2d-core/import/gateway/*`: drag, paste, context-menu and content-type entry points.
- `public/src/engines/canvas2d-core/import/parsers/*`: parser registry and type-specific parsers for markdown, HTML, math, code, image, file and plain text.
- `public/src/engines/canvas2d-core/import/canonical/*`: canonical document schema and node types.
- `public/src/engines/canvas2d-core/import/renderers/*`: canonical-to-canvas renderers and element bridges.
- `public/src/engines/canvas2d-core/import/host/*`: host adapters for persistence, export, history, search, flowback and interaction.
- `public/src/engines/canvas2d-core/import/runtime/createStructuredImportRuntime.js`: structured import runtime assembly.
- `public/src/engines/canvas2d-core/import/rollout/*`: pipeline switches and kill-switches.

## Critical Flows

### 1. App Startup

1. `server.js` loads `.env` and starts `src/backend/runtime/serverRuntime.js`.
2. Electron uses `electron/main.js` as desktop entry.
3. `electron/main.js` calls `ensureDesktopStartupContext()` -> `src/backend/services/appStartupService.js`.
4. `appStartupService` ensures directories, runs UI settings migration, reads `uiSettingsService`, resolves initial board and workbench preferences.
5. Electron creates `BrowserWindow` using startup fullscreen preferences when available.
6. Renderer loads `APP_URL`, then `public/src/main.js` boots workbench.
7. `public/src/runtime/workbenchRuntime.js` loads desktop startup context through `window.desktopShell.getStartupContext()`, reads `/api/ui-settings`, normalizes settings, writes non-authoritative browser cache, and applies workbench preferences to panels.

### 2. UI Settings and Habit Settings Save

1. Settings UI lives in `public/index.html` and is wired in `public/src/runtime/workbenchRuntime.js`.
2. Frontend save calls `fetch(API_ROUTES.uiSettings)` or `fetch(API_ROUTES.workbenchPreferences)`.
3. Routes are defined in `public/src/api/http.js`.
4. Backend route `/api/ui-settings*` is handled by `src/backend/routes/persistenceRoutes.js` and `src/backend/controllers/persistenceController.js`.
5. Backend persistence goes through `src/backend/services/uiSettingsService.js`.
6. Stored file path is defined only by `src/backend/config/paths.js`.
7. Frontend updates `state.uiSettings`, `state.workbenchPreferences`, startup context cache and browser localStorage cache after successful save.

### 3. Refresh/Reopen Restore

1. Refresh or app restart must use backend/Electron startup context first.
2. Browser `localStorage` UI settings cache is a fallback and display acceleration layer only.
3. Panel layout must be rebuilt from normalized workbench preferences, then applied through `applyWorkbenchPreferencesToPanelLayout()` and `applyPanelLayoutState()` in `workbenchRuntime.js`.
4. Desktop fullscreen preference is handled first in Electron startup window options and later reconciled in renderer if needed.

### 4. Open Recent Canvas

1. Authoritative recent board path is `canvasLastOpenedBoardPath` in UI settings.
2. Startup resolution is done in `src/backend/services/appStartupService.js`.
3. Renderer startup board read is coordinated from `public/src/runtime/workbenchRuntime.js`.
4. Canvas2D engine path resolution is in `public/src/engines/canvas2d-core/createCanvas2DEngine.js`.
5. Cache priority must keep startup context and remote UI settings above localStorage cache.

### 5. Canvas Board Save/Open

1. Canvas board storage path derives from `uiSettings.canvasBoardSavePath` and `uiSettings.canvasLastOpenedBoardPath`.
2. New primary board files use the `.freeflow` extension with a versioned FreeFlow envelope around the structured host board payload.
3. Legacy `.json` boards are compatibility inputs only; opening or backend-reading one creates a `.freeflow` copy and updates the recent-board path without overwriting the old JSON file.
4. Backend board read/write uses `src/backend/services/canvasBoardService.js` and `src/backend/models/canvasBoardFileFormat.js`.
5. Desktop file/folder picking and workspace listing use `window.desktopShell` from `electron/preload.js`, handled by `electron/main.js`; selectors list `.freeflow` first and `.json` as legacy.
6. Canvas workspace dialog is `public/src/engines/canvas2d-core/ui/BoardWorkspaceDialog.jsx`.

### 6. Word Export and Preview

1. Renderer export action originates in Canvas2D engine/UI.
2. Desktop export IPC methods are exposed in `electron/preload.js`.
3. IPC handlers live in `electron/main.js`: `desktop-shell:export-word-docx`, `desktop-shell:preview-word-docx`, `desktop-shell:export-rich-text-docx`.
4. DOCX compilation uses `electron/wordDocxCompiler.js` and related renderer-side AST/selection preparation.
5. Browser preview uses vendored assets under `public/assets/vendor/` where applicable.

### 7. Structured Import / Paste / Drag

1. User input enters gateway adapters under `public/src/engines/canvas2d-core/import/gateway/`.
2. Parser selection runs through parser registry/runner.
3. Parsed content is normalized to canonical document nodes.
4. Renderers convert canonical nodes into Canvas2D elements.
5. Host adapters commit elements, update history, persistence and search integration.

## Known Risk Areas

- UI settings can regress if a new file/store is introduced outside `uiSettingsService`.
- `data/ui-settings.json` is a legacy/project file and must not be treated as the authoritative user settings file after AppData migration.
- Browser localStorage is heavily used; any startup or settings change must define cache priority explicitly.
- Canvas board persistence must not regress to bare JSON for new saves; `.json` support is for legacy import/migration and tutorial template compatibility only.
- `workbenchRuntime.js` owns many unrelated concerns; edits must search for delayed/async code that can overwrite state after an earlier save.
- Electron main/preload/renderer IPC names must stay synchronized.
- Built bundles under `public/assets/*/current/*.js` can drift from source; source changes may require corresponding build scripts.
- CSS stacking, overlay z-index, pointer-events and Electron window shape can interact; dialog/menu fixes must verify both browser layer and desktop click shape.
- Tutorial startup state has version and first-run logic; version changes and persistence state must be checked together.
- Canvas import pipeline is modular; do not bypass canonical/parsers/renderers when adding new input types unless explicitly adding a host-level compatibility path.
