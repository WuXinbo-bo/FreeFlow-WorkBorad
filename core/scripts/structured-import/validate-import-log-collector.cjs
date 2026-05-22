const assert = require("node:assert/strict");

async function main() {
  const { createDiagnosticsModel } = await import(
    "../../public/src/engines/canvas2d-core/import/diagnostics/diagnosticsModel.js"
  );
  const { createImportPipelineSwitchboard, IMPORT_PIPELINES } = await import(
    "../../public/src/engines/canvas2d-core/import/rollout/pipelineSwitches.js"
  );
  const { createImportKillSwitch } = await import(
    "../../public/src/engines/canvas2d-core/import/rollout/killSwitch.js"
  );
  const { createImportLogCollector } = await import(
    "../../public/src/engines/canvas2d-core/import/diagnostics/importLogCollector.js"
  );

  const diagnosticsModel = createDiagnosticsModel();
  const collector = createImportLogCollector({ maxEntries: 10 });
  const switchboard = createImportPipelineSwitchboard({
    config: {
      defaultPipeline: IMPORT_PIPELINES.LEGACY,
      sourceKindOverrides: {
        markdown: IMPORT_PIPELINES.STRUCTURED,
      },
    },
  });
  const killSwitch = createImportKillSwitch({
    config: {
      sourceKindFallbacks: {
        markdown: true,
      },
    },
  });

  const descriptor = {
    descriptorId: "desc-log-1",
    channel: "paste",
    sourceKind: "markdown",
    status: "ready",
    entries: [{ kind: "markdown", status: "ready" }],
  };
  const parseResult = {
    status: "parsed",
    parserId: "markdown-gfm",
    matches: [{ parserId: "markdown-gfm" }],
    attempts: [{ parserId: "markdown-gfm", status: "parsed" }],
    document: {
      type: "doc",
      version: "1.0.0",
      content: [],
    },
  };
  const fallbackResult = {
    ok: true,
    action: "use-markdown-as-text",
  };

  const diagnostics = diagnosticsModel.buildImportDiagnostics({
    descriptor,
    parseResult,
    fallbackResult,
  });
  const switchDecision = switchboard.resolve(descriptor, { environment: "desktop" });
  const finalDecision = killSwitch.apply(switchDecision, descriptor, { environment: "desktop" });

  const trace = collector.pushTrace({
    descriptor,
    parseResult,
    fallbackResult,
    diagnostics,
    switchDecision,
    finalDecision,
    timestamp: "2026-04-16T16:00:00.000Z",
  });
  assert.equal(trace.kind, "import-trace");
  assert.equal(trace.descriptor.descriptorId, "desc-log-1");
  assert.equal(trace.parse.parserId, "markdown-gfm");
  assert.equal(trace.decision.finalPipeline, "legacy");
  assert.equal(trace.decision.killSwitchActive, true);

  const diff = collector.pushDiff({
    descriptor,
    diagnostics,
    switchDecision,
    finalDecision,
    timestamp: "2026-04-16T16:00:01.000Z",
  });
  assert.equal(diff.kind, "import-diff");
  assert.equal(Array.isArray(diff.diffAreas), true);
  assert.equal(diff.diffAreas.some((item) => item.type === "kill-switch"), true);
  assert.equal(diff.diffAreas.some((item) => item.area === "structure"), true);

  const entries = collector.getEntries();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, "import-trace");
  assert.equal(entries[1].kind, "import-diff");

  console.log("[import-log-collector] ok: 2 scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
