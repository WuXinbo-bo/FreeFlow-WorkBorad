const assert = require("node:assert/strict");

async function main() {
  const { createImportPipelineSwitchboard, IMPORT_PIPELINES } = await import(
    "../../public/src/engines/canvas2d-core/import/rollout/pipelineSwitches.js"
  );
  const { createImportKillSwitch, IMPORT_KILL_SWITCH_SOURCES } = await import(
    "../../public/src/engines/canvas2d-core/import/rollout/killSwitch.js"
  );

  const switchboard = createImportPipelineSwitchboard({
    config: {
      defaultPipeline: IMPORT_PIPELINES.LEGACY,
      sourceKindOverrides: {
        markdown: IMPORT_PIPELINES.STRUCTURED,
        code: IMPORT_PIPELINES.STRUCTURED,
      },
      channelOverrides: {
        drag: IMPORT_PIPELINES.STRUCTURED,
      },
    },
  });

  {
    const killSwitch = createImportKillSwitch({
      config: {
        forceLegacy: true,
        reason: "emergency-global",
      },
    });
    const descriptor = {
      descriptorId: "d-global",
      channel: "paste",
      sourceKind: "markdown",
      entries: [{ kind: "markdown" }],
    };
    const decision = switchboard.resolve(descriptor, { environment: "desktop" });
    const applied = killSwitch.apply(decision, descriptor, { environment: "desktop" });
    assert.equal(applied.pipeline, IMPORT_PIPELINES.LEGACY);
    assert.equal(applied.overriddenByKillSwitch, true);
    assert.equal(applied.killSwitch.source, IMPORT_KILL_SWITCH_SOURCES.GLOBAL);
  }

  {
    const killSwitch = createImportKillSwitch({
      config: {
        sourceKindFallbacks: {
          code: true,
        },
      },
    });
    const descriptor = {
      descriptorId: "d-source-kind",
      channel: "paste",
      sourceKind: "code",
      entries: [{ kind: "code" }],
    };
    const decision = switchboard.resolve(descriptor, { environment: "desktop" });
    const applied = killSwitch.apply(decision, descriptor, { environment: "desktop" });
    assert.equal(applied.pipeline, IMPORT_PIPELINES.LEGACY);
    assert.equal(applied.killSwitch.source, IMPORT_KILL_SWITCH_SOURCES.SOURCE_KIND);
  }

  {
    const killSwitch = createImportKillSwitch({
      config: {
        channelFallbacks: {
          drag: true,
        },
      },
    });
    const descriptor = {
      descriptorId: "d-channel",
      channel: "drag",
      sourceKind: "plain-text",
      entries: [{ kind: "text" }],
    };
    const decision = switchboard.resolve(descriptor, { environment: "desktop" });
    const applied = killSwitch.apply(decision, descriptor, { environment: "desktop" });
    assert.equal(applied.pipeline, IMPORT_PIPELINES.LEGACY);
    assert.equal(applied.killSwitch.source, IMPORT_KILL_SWITCH_SOURCES.CHANNEL);
  }

  {
    const killSwitch = createImportKillSwitch({
      config: {
        environmentFallbacks: {
          desktop: true,
        },
      },
    });
    const descriptor = {
      descriptorId: "d-env",
      channel: "paste",
      sourceKind: "markdown",
      entries: [{ kind: "markdown" }],
    };
    const decision = switchboard.resolve(descriptor, { environment: "desktop" });
    const applied = killSwitch.apply(decision, descriptor, { environment: "desktop" });
    assert.equal(applied.pipeline, IMPORT_PIPELINES.LEGACY);
    assert.equal(applied.killSwitch.source, IMPORT_KILL_SWITCH_SOURCES.ENVIRONMENT);
  }

  {
    const killSwitch = createImportKillSwitch({});
    const descriptor = {
      descriptorId: "d-pass-through",
      channel: "paste",
      sourceKind: "markdown",
      entries: [{ kind: "markdown" }],
    };
    const decision = switchboard.resolve(descriptor, { environment: "desktop" });
    const applied = killSwitch.apply(decision, descriptor, { environment: "desktop" });
    assert.equal(applied.pipeline, IMPORT_PIPELINES.STRUCTURED);
    assert.equal(applied.overriddenByKillSwitch, undefined);
    assert.equal(applied.killSwitch.active, false);
  }

  console.log("[kill-switch] ok: 5 scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
