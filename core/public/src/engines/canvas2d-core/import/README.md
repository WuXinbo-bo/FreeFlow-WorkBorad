# Structured Import (Independent New System)

This directory hosts the independent structured-import system described in:

- `docs/release-prep/v1.0.1-rc-结构化导入与复制粘贴架构改造清单.md`

Current scope:

- `protocols/`: stable protocol definitions that do not depend on the old clipboard / drag mainline
  - `canonicalFragmentCopy.js`: independent copy-payload protocol that extracts canonical / compatibility fragments alongside native items
  - `copyDowngradeRules.js`: downgrade rules that convert structured items into stable text/plain + text/html copy outputs
  - `externalCompatibilityOutput.js`: external copy output layer that combines canonical fragments, downgraded outputs and file paths for outside apps
- `gateway/`: independent entry adapters that only normalize input into `Input Descriptor`
  - `pasteGateway.js`: browser paste + system clipboard snapshot adapter
  - `dragGateway.js`: drag/drop `DataTransfer` adapter
  - `contextMenuPasteAdapter.js`: system clipboard readers -> context-menu paste descriptor adapter
  - `sharedEntryBuilders.js`: shared entry/descriptor builders for gateway layer
  - `contentTypeDetector.js`: rule-based text content detector that classifies plain text into code / math / markdown-like / quote / plain text before entry construction
- `rollout/`: rollout and routing helpers for switching between legacy and structured import pipelines
  - `pipelineSwitches.js`: source-kind / channel / environment based switchboard for deciding whether input uses legacy or structured pipeline
  - `killSwitch.js`: emergency rollback layer that can force descriptors back to legacy by global / source-kind / channel / environment rules
- `parsers/`: parser registration and dispatch layer
  - `parserRegistry.js`: parser registration, matching, ranking and dispatch skeleton
  - `customParserHost.js`: staged custom parser host, disabled by default
  - `parserRunner.js`: minimal parse pipeline runner for registry + fallback + diagnostics
  - `plainText/plainTextParser.js`: first builtin parser that maps text input to canonical document
  - `html/htmlParser.js`: generic html parser that maps common block/inline html to canonical document
  - `webContent/webContentParser.js`: web article/main content extractor that narrows html before canonical parsing
  - `markdown/markdownParser.js`: markdown / GFM parser that maps source markdown directly to canonical document
  - `code/codeParser.js`: dedicated code parser that preserves source code as canonical codeBlock nodes
  - `math/latexMathParser.js`: dedicated LaTeX math parser that maps formula input to canonical math nodes
  - `image/imageResourceParser.js`: image resource parser that maps image entries to canonical image nodes
  - `file/fileResourceCompatibilityAdapter.js`: file resource compatibility adapter that maps file entries to legacy fileCard-compatible results
  - `legacy/internalCompatibilityParser.js`: internal payload compatibility parser that maps old native items into legacy adapter results
- `fallbacks/`: centralized fallback decision layer
  - `fallbackStrategyManager.js`: resolve parse failure / no-match into explicit fallback actions
- `diagnostics/`: diagnostics aggregation and scoring layer
  - `diagnosticsModel.js`: build score, warnings, losses and summary from descriptor / parse / fallback results
  - `importLogCollector.js`: structured trace/diff log collector for parser hits, fallback, rollout decisions and loss areas
- `canonical/`: canonical JSON v1 document and node protocol layer
  - `nodeTypes.js`: canonical block/inline node enums and mark enums
  - `canonicalDocument.js`: canonical document factory + validator + empty node / complex attrs / compat normalization
  - `canonicalDocument.schema.json`: canonical JSON v1 schema baseline with source/compat metadata
- `renderers/`: renderer registration and render-plan dispatch layer
  - `rendererPipeline.js`: renderer registration, matching, ranking and render-plan dispatch skeleton
  - `legacyElementAdapterRegistry.js`: legacy element adapter registration, matching and bridge-plan dispatch layer
  - `text/genericTextRenderer.js`: generic text renderer that maps heading / paragraph / blockquote blocks to text render plans
  - `text/textElementBridge.js`: text protocol bridge that maps text render operations into normalized legacy text elements with canonical fragment metadata
  - `list/listRenderer.js`: list renderer that maps bullet / ordered / task list blocks to list render plans
  - `list/taskListInteraction.js`: task-list interaction helpers that toggle checked state while keeping text/html/structured fragment in sync
  - `code/codeBlockRenderer.js`: code block renderer that maps canonical codeBlock nodes to code render plans
  - `code/codeBlockElementBridge.js`: code block bridge that maps code render operations into normalized codeBlock elements with canonical fragment metadata
  - `table/tableRenderer.js`: table renderer that maps canonical table nodes to table render plans
  - `table/tableElementBridge.js`: table bridge that maps table render operations into normalized table elements with canonical fragment metadata
  - `math/mathRenderer.js`: math renderer that maps canonical mathBlock / mathInline nodes to math render plans
  - `math/mathElementBridge.js`: math bridge that maps math render operations into normalized math elements with canonical fragment metadata
  - `image/imageRenderer.js`: image renderer that bridges canonical image nodes into legacy image element plans
  - `image/imageElementBridge.js`: image bridge upgrade that injects canonical fragment metadata into normalized legacy image elements
  - `file/fileCardLegacyAdapter.js`: legacy adapter that bridges file compatibility items into legacy fileCard element plans
  - `file/fileCardElementBridge.js`: fileCard bridge upgrade that injects compatibility fragment metadata into normalized legacy fileCard elements
  - `legacy/nativePassthroughAdapter.js`: passthrough adapter that preserves old native items as legacy bridge plans
  - `legacy/nativeCompatibilityPassthrough.js`: passthrough upgrade that attaches compatibility metadata to normalized old native elements
- `host/`: host-side adapters that prepare structured import output for eventual canvas mainline takeover
  - `renderPlanCommitLayer.js`: commit layer that converts render/bridge plans into normalized board items
  - `renderLayoutWriteback.js`: layout/writeback helper that places render operations onto the board scene
  - `hostInteractionAdapter.js`: hit-selection-drag adapter for table/code/math/task-list host behavior
  - `hostEditProtocol.js`: host edit protocol for text/task-list/code/table/math editing sessions
  - `hostSearchAdapter.js`: host-side search/index adapter that includes code/table/math/image/fileCard content
  - `hostExportAdapter.js`: host-side export/snapshot adapter for new structured items
  - `hostHistoryAdapter.js`: host transaction helper for import/edit history boundaries
  - `hostPersistenceAdapter.js`: host-side serialize/deserialize/migrate wrapper for structured board payloads
  - `hostFlowbackAdapter.js`: host copy/paste/drag flowback adapter built on external compatibility output
  - `hostRolloutExperiment.js`: small-scope structured mainline takeover experiment runner under switchboard/kill-switch protection
- `runtime/`: default assembly/runtime entry for live engine takeover
  - `createStructuredImportRuntime.js`: default runtime that wires gateways, registries, renderers, adapters, rollout, logging and host helpers together

Live engine wiring:

- `public/src/engines/canvas2d-core/createCanvas2DEngine.js`: actual paste / drag / context-menu paste takeover entry, structured board persistence wiring and structured import runtime API exposure
- `public/src/engines/canvas2d-core/rendererStructured.js`: minimal canvas renderer for `codeBlock / table / math` after items enter the live board

Rules:

- Do not modify old import behavior from this directory directly
- New gateways, parsers, schema, diagnostics and renderers should be added here first
- Reuse old capabilities only through adapters when necessary

Validation helpers:

- `scripts/structured-import/run-parser-unit-tests.cjs`: aggregate parser unit-test runner
- `scripts/structured-import/run-renderer-element-integration.cjs`: aggregate renderer / element integration runner
- `scripts/structured-import/run-entry-regression.cjs`: aggregate paste / drag / context-menu / rollout regression runner
- `scripts/structured-import/run-performance-thresholds.cjs`: benchmark runner for large HTML / Markdown / code / text and table render thresholds
