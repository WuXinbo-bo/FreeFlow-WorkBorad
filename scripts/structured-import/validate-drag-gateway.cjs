"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const gatewayModule = await import("../../public/src/engines/canvas2d-core/import/gateway/dragGateway.js");
  const { INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createDragGateway } = gatewayModule;
  const dragPayloadModule = await import("../../public/src/engines/canvas2d-core/brokers/internalDragPayload.js");
  const { INTERNAL_DRAG_PAYLOAD_MIME, parseInternalDragPayload, stringifyInternalDragPayload } = dragPayloadModule;

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

  const fileAndTextDescriptor = gateway.fromDataTransfer(
    createDataTransferMock({
      files: [
        {
          name: "notes.md",
          type: "text/markdown",
          path: "D:\\tmp\\notes.md",
          size: 128,
        },
      ],
      textMap: {
        "text/html": "<h2>Dragged heading</h2>",
        "text/plain": "## Dragged heading",
      },
    }),
    { origin: "canvas-drop" }
  );
  assert(fileAndTextDescriptor.entries.length === 3, "file drag discarded text representations");
  assert(fileAndTextDescriptor.sourceKind === INPUT_SOURCE_KINDS.MIXED, "file and text drag should be mixed");

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

  const completePayload = {
    clipboardId: "drag-clipboard",
    copiedAt: 100,
    items: [
      { id: "text-1", type: "text", text: "note" },
      { id: "code-1", type: "codeBlock", code: "const value = 1" },
      { id: "table-1", type: "table", table: { rows: [] } },
      { id: "edge-1", type: "flowEdge", fromId: "text-1", toId: "code-1" },
    ],
  };
  const serializedPayload = stringifyInternalDragPayload({ marker: "marker", payload: completePayload });
  const recoveredPayload = parseInternalDragPayload(serializedPayload);
  assert(recoveredPayload?.payload?.items.length === 4, "drag payload lost non-text selected elements");
  assert(recoveredPayload.payload.items[3].type === "flowEdge", "drag payload lost selection dependencies");
  assert(parseInternalDragPayload("{invalid") === null, "invalid drag payload was accepted");
  assert(INTERNAL_DRAG_PAYLOAD_MIME.startsWith("application/"), "drag payload MIME is not application scoped");

  const missingDescriptor = gateway.fromDataTransfer(null, {});
  assert(missingDescriptor.status === "error", "missing dataTransfer should be error");

  console.log("[drag-gateway] ok: 5 scenarios validated");
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
