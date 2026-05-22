"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const gatewayModule = await import("../../public/src/engines/canvas2d-core/import/gateway/dragGateway.js");
  const { INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createDragGateway } = gatewayModule;

  const gateway = createDragGateway({
    createDescriptorId(prefix) {
      return `${prefix}-fixed-id`;
    },
  });

  const fileDescriptor = gateway.fromDataTransfer(
    createDataTransferMock({
      files: [
        {
          name: "demo.png",
          type: "image/png",
          path: "D:\\tmp\\demo.png",
          size: 1024,
        },
      ],
      textMap: {},
    }),
    {
      origin: "canvas-drop",
      boardId: "board-1",
      anchor: { x: 240, y: 100 },
    }
  );
  assert(fileDescriptor.channel === INPUT_CHANNELS.DRAG_DROP, "drag channel mismatch");
  assert(fileDescriptor.sourceKind === INPUT_SOURCE_KINDS.IMAGE_RESOURCE, "drag file sourceKind mismatch");

  const mixedDescriptor = gateway.fromDataTransfer(
    createDataTransferMock({
      files: [],
      textMap: {
        "text/html": "<p>Dragged html</p>",
        "text/plain": "Dragged text"
      },
    }),
    {
      origin: "canvas-drop",
      dropEffect: "copy",
      effectAllowed: "all",
    }
  );
  assert(mixedDescriptor.entries.length === 2, "mixed drag entries mismatch");
  assert(mixedDescriptor.sourceKind === INPUT_SOURCE_KINDS.MIXED, "mixed drag sourceKind mismatch");

  const missingDescriptor = gateway.fromDataTransfer(null, {});
  assert(missingDescriptor.status === "error", "missing dataTransfer should be error");

  console.log("[drag-gateway] ok: 3 scenarios validated");
}

function createDataTransferMock({ files, textMap }) {
  const map = { ...(textMap || {}) };
  return {
    files: Array.isArray(files) ? files : [],
    types: Object.keys(map),
    getData(type) {
      return map[type] || "";
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[drag-gateway] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
