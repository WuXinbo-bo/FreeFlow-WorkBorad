"use strict";

async function main() {
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );

  const {
    createRendererPipeline,
    normalizeRenderInput,
    RENDER_PAYLOAD_KINDS,
  } = rendererModule;

  const pipeline = createRendererPipeline();

  pipeline.registerRenderer({
    id: "canonical-document-renderer",
    priority: 100,
    payloadKinds: [RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT],
    supports({ renderInput }) {
      const blocks = Array.isArray(renderInput?.payload?.content) ? renderInput.payload.content : [];
      return {
        matched: blocks.length > 0,
        score: 12,
        reason: "document-content-available",
      };
    },
    async render({ renderInput }) {
      return {
        planId: "plan-canonical-1",
        kind: "element-render-plan",
        payloadKind: renderInput.kind,
        operations: [
          {
            type: "render-canonical-document",
            blockCount: renderInput.payload.content.length,
          },
        ],
        stats: {
          blockCount: renderInput.payload.content.length,
        },
      };
    },
  });

  pipeline.registerRenderer({
    id: "legacy-file-card-renderer",
    priority: 90,
    payloadKinds: [RENDER_PAYLOAD_KINDS.LEGACY_COMPATIBILITY],
    adapterTypes: ["fileCard"],
    supports({ renderInput }) {
      return {
        matched: Array.isArray(renderInput?.payload?.items) && renderInput.payload.items.length > 0,
        score: 10,
        reason: "file-card-items-available",
      };
    },
    async render({ renderInput }) {
      return {
        planId: "plan-legacy-file-1",
        kind: "element-render-plan",
        payloadKind: renderInput.kind,
        operations: renderInput.payload.items.map((item) => ({
          type: "bridge-legacy-file-card",
          entryId: item.entryId,
          legacyType: item.legacyType,
        })),
        stats: {
          itemCount: renderInput.payload.items.length,
        },
      };
    },
  });

  const canonicalOutput = {
    descriptor: {
      descriptorId: "descriptor-render-1",
    },
    parseResult: {
      parserId: "markdown-parser",
      result: {
        document: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [] },
            { type: "paragraph", content: [] },
          ],
        },
        stats: {
          blockCount: 2,
        },
      },
    },
  };

  const canonicalInput = normalizeRenderInput(canonicalOutput);
  assert(canonicalInput.kind === RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT, "canonical input kind mismatch");

  const canonicalMatches = pipeline.matchRenderers(canonicalOutput);
  assert(canonicalMatches.length === 1, "canonical renderer match count mismatch");

  const canonicalResult = await pipeline.render(canonicalOutput);
  assert(canonicalResult.ok === true, "canonical render should succeed");
  assert(canonicalResult.rendererId === "canonical-document-renderer", "canonical renderer id mismatch");
  assert(canonicalResult.result.operations[0].type === "render-canonical-document", "canonical operation mismatch");

  const compatibilityOutput = {
    descriptor: {
      descriptorId: "descriptor-render-2",
    },
    parseResult: {
      parserId: "file-resource-compatibility-adapter",
      result: {
        compatibility: {
          kind: "legacy-element-adapter",
          adapterType: "fileCard",
          items: [
            {
              entryId: "entry-file-1",
              legacyType: "fileCard",
            },
          ],
        },
      },
    },
  };

  const compatibilityInput = normalizeRenderInput(compatibilityOutput);
  assert(
    compatibilityInput.kind === RENDER_PAYLOAD_KINDS.LEGACY_COMPATIBILITY,
    "compatibility input kind mismatch"
  );

  const compatibilityResult = await pipeline.render(compatibilityOutput);
  assert(compatibilityResult.ok === true, "compatibility render should succeed");
  assert(compatibilityResult.rendererId === "legacy-file-card-renderer", "compatibility renderer id mismatch");
  assert(
    compatibilityResult.result.operations[0].type === "bridge-legacy-file-card",
    "compatibility operation mismatch"
  );

  console.log("[renderer-pipeline] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[renderer-pipeline] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
