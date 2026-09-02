import { createPasteGateway } from "../gateway/pasteGateway.js";
import { createDragGateway } from "../gateway/dragGateway.js";
import { createContextMenuPasteAdapter } from "../gateway/contextMenuPasteAdapter.js";
import { createParserRegistry } from "../parsers/parserRegistry.js";
import { INPUT_ENTRY_KINDS } from "../protocols/inputDescriptor.js";
import {
  buildInputRepresentationPlan,
  INPUT_REPRESENTATION_STATUS,
} from "../protocols/inputRepresentationPlan.js";
import { createFallbackStrategyManager } from "../fallbacks/fallbackStrategyManager.js";
import { createDiagnosticsModel } from "../diagnostics/diagnosticsModel.js";
import { createImportPipelineSwitchboard, IMPORT_PIPELINES } from "../rollout/pipelineSwitches.js";
import { createImportKillSwitch } from "../rollout/killSwitch.js";
import { createImportLogCollector } from "../diagnostics/importLogCollector.js";
import { createRendererPipeline } from "../renderers/rendererPipeline.js";
import { createLegacyElementAdapterRegistry } from "../renderers/legacyElementAdapterRegistry.js";
import { createRenderPlanCommitLayer } from "../host/renderPlanCommitLayer.js";
import {
  getImportedBatchLayoutIssues,
  stabilizeImportedBatchLayout,
} from "../host/renderLayoutWriteback.js";
import { runHostRolloutExperiment } from "../host/hostRolloutExperiment.js";
import { getElementBounds, moveElement } from "../../elements/index.js";
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
import { createUriListParser, URI_LIST_PARSER_ID } from "../parsers/uriList/uriListParser.js";
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
  [URI_LIST_PARSER_ID]: [INPUT_ENTRY_KINDS.URI],
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
  [URI_LIST_PARSER_ID]: 85,
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
    readClipboardSnapshot: options.readClipboardSnapshot,
    getInternalPayload: options.getInternalPayload,
  });

  async function runDescriptor({ descriptor, board, anchorPoint, context = {} } = {}) {
    const representationPlan = buildInputRepresentationPlan(descriptor);
    const groupRuns = [];
    for (const group of representationPlan.groups) {
      throwIfAborted(context?.signal);
      const result = await runHostRolloutExperiment({
        descriptor: group.descriptor,
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
      groupRuns.push({ group, result });
    }
    const settledPlan = settleRepresentationPlan(representationPlan, groupRuns);
    const successfulRuns = groupRuns.filter(({ result }) =>
      result?.pipeline === "structured" && result?.commitResult?.ok && result.commitResult.items?.length
    );
    const result = successfulRuns.length > 1
      ? combineRepresentationGroupRuns(successfulRuns, {
          board,
          batchId: context?.importBatchId,
        })
      : successfulRuns[0]?.result || groupRuns[0]?.result || createEmptyRepresentationResult();
    result.representationPlan = settledPlan;
    result.representationGroupResults = groupRuns.map(({ group, result: groupResult }) => ({
      groupId: group.groupId,
      kind: group.kind,
      entryIds: group.entryIds.slice(),
      ok: Boolean(groupResult?.commitResult?.ok && groupResult?.commitResult?.items?.length),
      parserId: String(groupResult?.pipelineOutput?.parseResult?.parserId || ""),
      errorCode: String(groupResult?.pipelineOutput?.parseResult?.error?.code || ""),
    }));
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

function settleRepresentationPlan(plan, groupRuns) {
  const outcomeByEntryId = new Map();
  groupRuns.forEach(({ group, result }) => {
    const consumed = Boolean(
      result?.pipeline === "structured" && result?.commitResult?.ok && result.commitResult.items?.length
    );
    const status = consumed ? INPUT_REPRESENTATION_STATUS.CONSUMED : INPUT_REPRESENTATION_STATUS.FAILED;
    const reason = consumed
      ? `consumed-by-${String(result?.pipelineOutput?.parseResult?.parserId || "parser")}`
      : String(result?.pipelineOutput?.parseResult?.error?.code || result?.reason || "representation-group-failed");
    group.entryIds.forEach((entryId) => outcomeByEntryId.set(String(entryId || ""), { status, reason }));
  });
  return {
    ...plan,
    manifest: plan.manifest.map((entry) => {
      if (entry.status !== INPUT_REPRESENTATION_STATUS.PLANNED) {
        return { ...entry };
      }
      const outcome = outcomeByEntryId.get(String(entry.entryId || ""));
      return outcome ? { ...entry, ...outcome } : { ...entry, status: INPUT_REPRESENTATION_STATUS.SKIPPED, reason: "group-not-run" };
    }),
  };
}

function combineRepresentationGroupRuns(groupRuns, { board, batchId } = {}) {
  const resolvedBatchId = String(
    batchId || groupRuns[0]?.result?.commitResult?.batchId || `import-batch-${Date.now()}`
  );
  const combinedItems = [];
  const combinedCommits = [];
  let nextTop = null;

  groupRuns.forEach(({ group, result }) => {
    const sourceItems = Array.isArray(result?.commitResult?.items) ? result.commitResult.items : [];
    if (!sourceItems.length) {
      return;
    }
    const sourceBounds = getGroupBounds(sourceItems);
    const targetTop = nextTop == null ? sourceBounds.top : nextTop;
    const deltaY = targetTop - sourceBounds.top;
    const movedItems = sourceItems.map((item) => deltaY ? moveElement(item, 0, deltaY) : item);
    movedItems.forEach((item) => {
      const bounds = getElementBounds(item);
      combinedItems.push({
        ...item,
        importBatch: {
          ...(item?.importBatch && typeof item.importBatch === "object" ? item.importBatch : {}),
          kind: "structured-import-batch-v1",
          id: resolvedBatchId,
          index: combinedItems.length,
          representationGroupId: group.groupId,
          representationGroupIndex: group.index,
          sourceEntryIds: group.entryIds.slice(),
          insertedX: bounds.left,
          insertedY: bounds.top,
          measuredWidth: bounds.width,
          measuredHeight: bounds.height,
        },
      });
    });
    const movedBounds = getGroupBounds(movedItems);
    nextTop = movedBounds.bottom + 24;
    combinedCommits.push(...(Array.isArray(result?.commitResult?.commits) ? result.commitResult.commits : []));
  });

  const stabilizedItems = stabilizeImportedBatchLayout(combinedItems, { remeasure: true });
  const itemById = new Map(stabilizedItems.map((item) => [String(item?.id || ""), item]));
  const layoutIssues = getImportedBatchLayoutIssues(stabilizedItems);
  const first = groupRuns[0]?.result || {};
  const diagnostics = combineCommitDiagnostics(groupRuns);
  const existingItems = Array.isArray(board?.items) ? board.items : [];
  return {
    ...first,
    ok: stabilizedItems.length > 0 && layoutIssues.length === 0,
    pipeline: "structured",
    pipelineOutputs: groupRuns.map(({ result }) => result?.pipelineOutput || null),
    commitResult: {
      ok: stabilizedItems.length > 0 && layoutIssues.length === 0,
      kind: "commit-result",
      planId: groupRuns.map(({ result }) => String(result?.commitResult?.planId || "")).filter(Boolean).join("+"),
      batchId: resolvedBatchId,
      board: {
        ...(board && typeof board === "object" ? board : {}),
        items: existingItems.concat(stabilizedItems),
        selectedIds: stabilizedItems.map((item) => item.id),
      },
      items: stabilizedItems,
      commits: combinedCommits.map((commit) => {
        const item = itemById.get(String(commit?.item?.id || "")) || commit?.item;
        return { ...commit, item, bounds: item ? getElementBounds(item) : commit?.bounds };
      }),
      diagnostics,
      layoutIssues,
      stats: {
        committedCount: stabilizedItems.length,
        selectedCount: stabilizedItems.length,
        structuredWarningCount: diagnostics.warnings.length,
        layoutIssueCount: layoutIssues.length,
        representationGroupCount: groupRuns.length,
      },
    },
  };
}

function combineCommitDiagnostics(groupRuns) {
  const warnings = [];
  let operationCount = 0;
  groupRuns.forEach(({ group, result }) => {
    const diagnostics = result?.commitResult?.diagnostics || {};
    operationCount += Number(diagnostics.operationCount) || 0;
    (Array.isArray(diagnostics.warnings) ? diagnostics.warnings : []).forEach((warning) => {
      warnings.push({ ...warning, representationGroupId: group.groupId });
    });
  });
  return { operationCount, warnings };
}

function getGroupBounds(items) {
  const bounds = (Array.isArray(items) ? items : []).map((item) => getElementBounds(item));
  if (!bounds.length) {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  const left = Math.min(...bounds.map((entry) => entry.left));
  const top = Math.min(...bounds.map((entry) => entry.top));
  const right = Math.max(...bounds.map((entry) => entry.right));
  const bottom = Math.max(...bounds.map((entry) => entry.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function createEmptyRepresentationResult() {
  return {
    ok: false,
    pipeline: "structured",
    reason: "no-runnable-representation-group",
    commitResult: null,
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("Structured import was cancelled");
  error.name = "AbortError";
  throw error;
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
    createUriListParser(),
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
