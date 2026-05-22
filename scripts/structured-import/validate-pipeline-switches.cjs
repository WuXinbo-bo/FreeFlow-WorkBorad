"use strict";

async function main() {
  const switchModule = await import(
    "../../public/src/engines/canvas2d-core/import/rollout/pipelineSwitches.js"
  );
  const descriptorModule = await import(
    "../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js"
  );

  const {
    createImportPipelineSwitchboard,
    IMPORT_PIPELINES,
    PIPELINE_SWITCH_DECISION_SOURCES,
  } = switchModule;
  const {
    INPUT_CHANNELS,
    INPUT_SOURCE_KINDS,
    INPUT_ENTRY_KINDS,
    createInputDescriptor,
  } = descriptorModule;

  const switchboard = createImportPipelineSwitchboard({
    config: {
      defaultPipeline: IMPORT_PIPELINES.LEGACY,
      channelOverrides: {
        [INPUT_CHANNELS.DRAG_DROP]: IMPORT_PIPELINES.STRUCTURED,
      },
      sourceKindOverrides: {
        [INPUT_SOURCE_KINDS.CODE]: IMPORT_PIPELINES.STRUCTURED,
      },
      environmentOverrides: {
        desktop: IMPORT_PIPELINES.LEGACY,
      },
      rules: [
        {
          id: "markdown-desktop-rule",
          priority: 100,
          pipeline: IMPORT_PIPELINES.STRUCTURED,
          sourceKinds: [INPUT_SOURCE_KINDS.MARKDOWN],
          environments: ["desktop"],
          reason: "markdown-desktop",
        },
        {
          id: "context-menu-file-legacy",
          priority: 80,
          pipeline: IMPORT_PIPELINES.LEGACY,
          channels: [INPUT_CHANNELS.PASTE_CONTEXT_MENU],
          entryKinds: [INPUT_ENTRY_KINDS.FILE],
          reason: "context-menu-file-legacy",
        },
      ],
    },
  });

  const markdownDescriptor = createInputDescriptor({
    descriptorId: "descriptor-switch-1",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MARKDOWN,
    entries: [
      {
        entryId: "entry-1",
        kind: INPUT_ENTRY_KINDS.MARKDOWN,
        raw: { markdown: "# Title" },
      },
    ],
  });
  const markdownDecision = switchboard.resolve(markdownDescriptor, { environment: "desktop" });
  assert(markdownDecision.pipeline === IMPORT_PIPELINES.STRUCTURED, "markdown rule decision mismatch");
  assert(markdownDecision.source === PIPELINE_SWITCH_DECISION_SOURCES.RULE, "markdown rule source mismatch");

  const codeDescriptor = createInputDescriptor({
    descriptorId: "descriptor-switch-2",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.CODE,
    entries: [
      {
        entryId: "entry-2",
        kind: INPUT_ENTRY_KINDS.CODE,
        raw: { code: "console.log(1);" },
      },
    ],
  });
  const codeDecision = switchboard.resolve(codeDescriptor, { environment: "web" });
  assert(codeDecision.pipeline === IMPORT_PIPELINES.STRUCTURED, "code source kind decision mismatch");
  assert(codeDecision.source === PIPELINE_SWITCH_DECISION_SOURCES.SOURCE_KIND, "code source decision source mismatch");

  const fileDescriptor = createInputDescriptor({
    descriptorId: "descriptor-switch-3",
    channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    sourceKind: INPUT_SOURCE_KINDS.FILE_RESOURCE,
    entries: [
      {
        entryId: "entry-3",
        kind: INPUT_ENTRY_KINDS.FILE,
        raw: { filePath: "D:\\docs\\report.pdf" },
      },
    ],
  });
  const fileDecision = switchboard.resolve(fileDescriptor, { environment: "desktop" });
  assert(fileDecision.pipeline === IMPORT_PIPELINES.LEGACY, "context menu file decision mismatch");
  assert(fileDecision.source === PIPELINE_SWITCH_DECISION_SOURCES.RULE, "context menu file decision source mismatch");

  const dragDescriptor = createInputDescriptor({
    descriptorId: "descriptor-switch-4",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.UNKNOWN,
    entries: [
      {
        entryId: "entry-4",
        kind: INPUT_ENTRY_KINDS.TEXT,
        raw: { text: "drag text" },
      },
    ],
  });
  const dragDecision = switchboard.resolve(dragDescriptor, { environment: "web" });
  assert(dragDecision.pipeline === IMPORT_PIPELINES.STRUCTURED, "drag channel decision mismatch");
  assert(dragDecision.source === PIPELINE_SWITCH_DECISION_SOURCES.CHANNEL, "drag channel source mismatch");

  console.log("[pipeline-switches] ok: 4 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[pipeline-switches] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
