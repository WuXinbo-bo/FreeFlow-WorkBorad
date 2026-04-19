import { createPasteGateway } from "../gateway/pasteGateway.js";
import { createDragGateway } from "../gateway/dragGateway.js";
import { createContextMenuPasteAdapter } from "../gateway/contextMenuPasteAdapter.js";
import { createParserRegistry } from "../parsers/parserRegistry.js";
import { createFallbackStrategyManager } from "../fallbacks/fallbackStrategyManager.js";
import { createDiagnosticsModel } from "../diagnostics/diagnosticsModel.js";
import { createImportPipelineSwitchboard, IMPORT_PIPELINES } from "../rollout/pipelineSwitches.js";
import { createImportKillSwitch } from "../rollout/killSwitch.js";
import { createImportLogCollector } from "../diagnostics/importLogCollector.js";
import { createRendererPipeline } from "../renderers/rendererPipeline.js";
import { createLegacyElementAdapterRegistry } from "../renderers/legacyElementAdapterRegistry.js";
import { createRenderPlanCommitLayer } from "../host/renderPlanCommitLayer.js";
import { runHostRolloutExperiment } from "../host/hostRolloutExperiment.js";
import { buildHostSearchResults } from "../host/hostSearchAdapter.js";
import { buildHostExportSnapshot } from "../host/hostExportAdapter.js";
import {
  serializeHostBoard,
  deserializeHostBoard,
  migrateHostBoardPayload,
} from "../host/hostPersistenceAdapter.js";
import { buildHostFlowbackPayload } from "../host/hostFlowbackAdapter.js";
import { createHostHistoryAdapter } from "../host/hostHistoryAdapter.js";
import { createPlainTextParser } from "../parsers/plainText/plainTextParser.js";
import { createHtmlParser } from "../parsers/html/htmlParser.js";
import { createWebContentParser } from "../parsers/webContent/webContentParser.js";
import { createMarkdownParser } from "../parsers/markdown/markdownParser.js";
import { createCodeParser } from "../parsers/code/codeParser.js";
import { createLatexMathParser } from "../parsers/math/latexMathParser.js";
import { createImageResourceParser } from "../parsers/image/imageResourceParser.js";
import { createFileResourceCompatibilityAdapter } from "../parsers/file/fileResourceCompatibilityAdapter.js";
import { createInternalCompatibilityParser } from "../parsers/legacy/internalCompatibilityParser.js";
import { createGenericTextRenderer } from "../renderers/text/genericTextRenderer.js";
import { createListRenderer } from "../renderers/list/listRenderer.js";
import { createCodeBlockRenderer } from "../renderers/code/codeBlockRenderer.js";
import { createTableRenderer } from "../renderers/table/tableRenderer.js";
import { createMathRenderer } from "../renderers/math/mathRenderer.js";
import { createImageRenderer } from "../renderers/image/imageRenderer.js";
import { createFileCardLegacyAdapter } from "../renderers/file/fileCardLegacyAdapter.js";
import { createNativePassthroughAdapter } from "../renderers/legacy/nativePassthroughAdapter.js";

export function createStructuredImportRuntime(options = {}) {
  const parserRegistry = createParserRegistry();
  registerBuiltinParsers(parserRegistry);

  const fallbackManager = createFallbackStrategyManager();
  const diagnosticsModel = createDiagnosticsModel();
  const switchboard = createImportPipelineSwitchboard({
    config: {
      defaultPipeline: IMPORT_PIPELINES.STRUCTURED,
      ...(options.switchConfig || {}),
    },
  });
  const killSwitch = createImportKillSwitch({
    config: options.killSwitchConfig || {},
  });
  const rendererPipeline = createRendererPipeline();
  registerBuiltinRenderers(rendererPipeline);
  const legacyAdapterRegistry = createLegacyElementAdapterRegistry();
  registerBuiltinLegacyAdapters(legacyAdapterRegistry);
  const commitLayer = createRenderPlanCommitLayer();
  const logCollector = createImportLogCollector({
    maxEntries: Number.isFinite(options.maxLogEntries) ? options.maxLogEntries : 300,
  });
  const historyAdapter = createHostHistoryAdapter();

  const pasteGateway = createPasteGateway({
    internalClipboardMime: options.internalClipboardMime,
  });
  const dragGateway = createDragGateway({
    internalClipboardMime: options.internalClipboardMime,
  });
  const contextMenuPasteAdapter = createContextMenuPasteAdapter({
    pasteGateway,
    readClipboardText: options.readClipboardText,
    readClipboardFiles: options.readClipboardFiles,
    readClipboardHtml: options.readClipboardHtml,
    readClipboardMarkdown: options.readClipboardMarkdown,
    readClipboardUriList: options.readClipboardUriList,
    getInternalPayload: options.getInternalPayload,
  });

  async function runDescriptor({ descriptor, board, anchorPoint, context = {} } = {}) {
    const result = await runHostRolloutExperiment({
      descriptor,
      board,
      anchorPoint,
      registry: parserRegistry,
      fallbackManager,
      diagnosticsModel,
      switchboard,
      killSwitch,
      rendererPipeline,
      legacyAdapterRegistry,
      commitLayer,
      context,
    });
    logCollector.pushTrace({
      descriptor,
      parseResult: result?.pipelineOutput?.parseResult || null,
      fallbackResult: result?.pipelineOutput?.fallbackResult || null,
      diagnostics: result?.pipelineOutput?.diagnostics || null,
      switchDecision: result?.switchDecision || null,
      finalDecision: result?.finalDecision || null,
    });
    logCollector.pushDiff({
      descriptor,
      diagnostics: result?.pipelineOutput?.diagnostics || null,
      switchDecision: result?.switchDecision || null,
      finalDecision: result?.finalDecision || null,
    });
    return result;
  }

  async function runPasteEvent(event, { board, anchorPoint, context = {} } = {}) {
    const descriptor = pasteGateway.fromClipboardEvent(event, context);
    return runDescriptor({ descriptor, board, anchorPoint, context });
  }

  async function runDropEvent(event, { board, anchorPoint, context = {} } = {}) {
    const descriptor = dragGateway.fromDropEvent(event, context);
    return runDescriptor({ descriptor, board, anchorPoint, context });
  }

  async function runContextMenuPaste({ board, anchorPoint, context = {} } = {}) {
    const descriptor = await contextMenuPasteAdapter.createDescriptor(context);
    return runDescriptor({ descriptor, board, anchorPoint, context });
  }

  return {
    pasteGateway,
    dragGateway,
    contextMenuPasteAdapter,
    parserRegistry,
    fallbackManager,
    diagnosticsModel,
    switchboard,
    killSwitch,
    rendererPipeline,
    legacyAdapterRegistry,
    commitLayer,
    historyAdapter,
    runDescriptor,
    runPasteEvent,
    runDropEvent,
    runContextMenuPaste,
    buildSearchResults: buildHostSearchResults,
    buildExportSnapshot: buildHostExportSnapshot,
    serializeBoard: serializeHostBoard,
    deserializeBoard: deserializeHostBoard,
    migrateBoardPayload: migrateHostBoardPayload,
    buildFlowbackPayload: buildHostFlowbackPayload,
    getLogs: logCollector.getEntries,
    clearLogs: logCollector.clear,
  };
}

function registerBuiltinParsers(registry) {
  [
    createInternalCompatibilityParser(),
    createFileResourceCompatibilityAdapter(),
    createImageResourceParser(),
    createLatexMathParser(),
    createCodeParser(),
    createMarkdownParser(),
    createWebContentParser(),
    createHtmlParser(),
    createPlainTextParser(),
  ].forEach((parser) => registry.registerParser(parser));
}

function registerBuiltinRenderers(pipeline) {
  [
    createGenericTextRenderer(),
    createListRenderer(),
    createCodeBlockRenderer(),
    createTableRenderer(),
    createMathRenderer(),
    createImageRenderer(),
  ].forEach((renderer) => pipeline.registerRenderer(renderer));
}

function registerBuiltinLegacyAdapters(registry) {
  [
    createFileCardLegacyAdapter(),
    createNativePassthroughAdapter(),
  ].forEach((adapter) => registry.registerAdapter(adapter));
}
