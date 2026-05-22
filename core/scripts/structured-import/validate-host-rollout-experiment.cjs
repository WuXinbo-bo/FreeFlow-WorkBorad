const assert = require("node:assert/strict");

async function main() {
  const { createParserRegistry } = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js"
  );
  const { createFallbackStrategyManager } = await import(
    "../../public/src/engines/canvas2d-core/import/fallbacks/fallbackStrategyManager.js"
  );
  const { createDiagnosticsModel } = await import(
    "../../public/src/engines/canvas2d-core/import/diagnostics/diagnosticsModel.js"
  );
  const { createImportPipelineSwitchboard, IMPORT_PIPELINES } = await import(
    "../../public/src/engines/canvas2d-core/import/rollout/pipelineSwitches.js"
  );
  const { createImportKillSwitch } = await import(
    "../../public/src/engines/canvas2d-core/import/rollout/killSwitch.js"
  );
  const { createRendererPipeline } = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const { createLegacyElementAdapterRegistry } = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/legacyElementAdapterRegistry.js"
  );
  const { createRenderPlanCommitLayer } = await import(
    "../../public/src/engines/canvas2d-core/import/host/renderPlanCommitLayer.js"
  );
  const { createPlainTextParser } = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/plainText/plainTextParser.js"
  );
  const { createGenericTextRenderer } = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/text/genericTextRenderer.js"
  );
  const { runHostRolloutExperiment } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostRolloutExperiment.js"
  );

  const registry = createParserRegistry();
  registry.registerParser(createPlainTextParser());
  const fallbackManager = createFallbackStrategyManager();
  const diagnosticsModel = createDiagnosticsModel();
  const switchboard = createImportPipelineSwitchboard({
    config: {
      defaultPipeline: IMPORT_PIPELINES.LEGACY,
      sourceKindOverrides: {
        "plain-text": IMPORT_PIPELINES.STRUCTURED,
      },
    },
  });
  const killSwitch = createImportKillSwitch();
  const rendererPipeline = createRendererPipeline();
  rendererPipeline.registerRenderer(createGenericTextRenderer());
  const legacyAdapterRegistry = createLegacyElementAdapterRegistry();
  const commitLayer = createRenderPlanCommitLayer();

  const result = await runHostRolloutExperiment({
    descriptor: {
      descriptorId: "exp-1",
      channel: "programmatic",
      sourceKind: "plain-text",
      status: "ready",
      entries: [{ entryId: "e1", kind: "text", status: "ready", raw: { text: "hello world" }, meta: {} }],
    },
    board: { items: [], selectedIds: [], view: {}, preferences: {} },
    anchorPoint: { x: 100, y: 120 },
    registry,
    fallbackManager,
    diagnosticsModel,
    switchboard,
    killSwitch,
    rendererPipeline,
    legacyAdapterRegistry,
    commitLayer,
    context: { environment: "desktop" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.pipeline, "structured");
  assert.equal(result.commitResult.items.length, 1);

  console.log("[host-rollout-experiment] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
