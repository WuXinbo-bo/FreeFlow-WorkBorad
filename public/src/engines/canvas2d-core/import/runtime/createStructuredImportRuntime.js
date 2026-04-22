import { createPasteGateway } from "../gateway/pasteGateway.js";
import { createDragGateway } from "../gateway/dragGateway.js";
import { createContextMenuPasteAdapter } from "../gateway/contextMenuPasteAdapter.js";
import { createParserRegistry } from "../parsers/parserRegistry.js";
import { INPUT_ENTRY_KINDS } from "../protocols/inputDescriptor.js";
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
import {
  createPlainTextParser,
  PLAIN_TEXT_PARSER_ID,
} from "../parsers/plainText/plainTextParser.js";
import { createHtmlParser, HTML_PARSER_ID } from "../parsers/html/htmlParser.js";
import {
  createWebContentParser,
  WEB_CONTENT_PARSER_ID,
} from "../parsers/webContent/webContentParser.js";
import {
  createMarkdownParser,
  MARKDOWN_PARSER_ID,
} from "../parsers/markdown/markdownParser.js";
import { createCodeParser, CODE_PARSER_ID } from "../parsers/code/codeParser.js";
import {
  createLatexMathParser,
  LATEX_MATH_PARSER_ID,
} from "../parsers/math/latexMathParser.js";
import {
  createImageResourceParser,
  IMAGE_RESOURCE_PARSER_ID,
} from "../parsers/image/imageResourceParser.js";
import {
  createFileResourceCompatibilityAdapter,
  FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID,
} from "../parsers/file/fileResourceCompatibilityAdapter.js";
import {
  createInternalCompatibilityParser,
  INTERNAL_COMPATIBILITY_PARSER_ID,
} from "../parsers/legacy/internalCompatibilityParser.js";
import { createGenericTextRenderer } from "../renderers/text/genericTextRenderer.js";
import { createListRenderer } from "../renderers/list/listRenderer.js";
import { createCodeBlockRenderer } from "../renderers/code/codeBlockRenderer.js";
import { createTableRenderer } from "../renderers/table/tableRenderer.js";
import { createMathRenderer } from "../renderers/math/mathRenderer.js";
import { createImageRenderer } from "../renderers/image/imageRenderer.js";
import { createFileCardLegacyAdapter } from "../renderers/file/fileCardLegacyAdapter.js";
import { createNativePassthroughAdapter } from "../renderers/legacy/nativePassthroughAdapter.js";

const DEFAULT_PARSER_ENTRY_KIND_GATES = Object.freeze({
  [INTERNAL_COMPATIBILITY_PARSER_ID]: [INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD],
  [FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID]: [INPUT_ENTRY_KINDS.FILE],
  [IMAGE_RESOURCE_PARSER_ID]: [INPUT_ENTRY_KINDS.IMAGE],
  [LATEX_MATH_PARSER_ID]: [INPUT_ENTRY_KINDS.MATH, INPUT_ENTRY_KINDS.TEXT],
  [CODE_PARSER_ID]: [INPUT_ENTRY_KINDS.CODE, INPUT_ENTRY_KINDS.TEXT],
  [MARKDOWN_PARSER_ID]: [INPUT_ENTRY_KINDS.MARKDOWN],
  [WEB_CONTENT_PARSER_ID]: [INPUT_ENTRY_KINDS.HTML],
  [HTML_PARSER_ID]: [INPUT_ENTRY_KINDS.HTML],
  [PLAIN_TEXT_PARSER_ID]: [
    INPUT_ENTRY_KINDS.TEXT,
    INPUT_ENTRY_KINDS.CODE,
    INPUT_ENTRY_KINDS.MATH,
    INPUT_ENTRY_KINDS.UNKNOWN,
  ],
});

const DEFAULT_PARSER_TIE_BREAK_RANKS = Object.freeze({
  [INTERNAL_COMPATIBILITY_PARSER_ID]: 100,
  [FILE_RESOURCE_COMPATIBILITY_ADAPTER_ID]: 95,
  [IMAGE_RESOURCE_PARSER_ID]: 90,
  [LATEX_MATH_PARSER_ID]: 80,
  [CODE_PARSER_ID]: 70,
  [MARKDOWN_PARSER_ID]: 60,
  [WEB_CONTENT_PARSER_ID]: 50,
  [HTML_PARSER_ID]: 45,
  [PLAIN_TEXT_PARSER_ID]: 10,
});

export function createStructuredImportRuntime(options = {}) {
  const parserEntryKindGates = mergeParserEntryKindGates(options.parserEntryKindGates);
  const parserTieBreakRanks = mergeParserTieBreakRanks(options.parserTieBreakRanks);
  const parserRegistry = createParserRegistry({
    resolveEntryKindGate({ parser }) {
      // Stage-1 gating: narrow parser candidates by descriptor entry kinds before supports() scoring.
      return parserEntryKindGates[parser.id] || [];
    },
    resolveTieBreakRank({ parser }) {
      return parserTieBreakRanks[parser.id];
    },
  });
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

function mergeParserEntryKindGates(overrides) {
  const merged = { ...DEFAULT_PARSER_ENTRY_KIND_GATES };
  if (!overrides || typeof overrides !== "object") {
    return merged;
  }
  Object.keys(overrides).forEach((parserId) => {
    const list = Array.isArray(overrides[parserId]) ? overrides[parserId] : null;
    if (!list) {
      return;
    }
    merged[parserId] = list
      .map((kind) => String(kind || "").trim())
      .filter(Boolean);
  });
  return merged;
}

function mergeParserTieBreakRanks(overrides) {
  const merged = { ...DEFAULT_PARSER_TIE_BREAK_RANKS };
  if (!overrides || typeof overrides !== "object") {
    return merged;
  }
  Object.keys(overrides).forEach((parserId) => {
    const rank = Number(overrides[parserId]);
    if (!Number.isFinite(rank)) {
      return;
    }
    merged[parserId] = rank;
  });
  return merged;
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
