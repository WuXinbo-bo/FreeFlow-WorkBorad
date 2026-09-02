"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const adapterModule = await import(
    "../../public/src/engines/canvas2d-core/import/gateway/contextMenuPasteAdapter.js"
  );
  const { INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createContextMenuPasteAdapter } = adapterModule;

  const adapter = createContextMenuPasteAdapter({
    async readClipboardText() {
      return "Context menu text";
    },
    async readClipboardFiles() {
      return ["D:\\tmp\\card.pdf"];
    },
    async readClipboardHtml() {
      return "";
    },
    async readClipboardMarkdown() {
      return "";
    },
    async readClipboardUriList() {
      return "";
    },
    async getInternalPayload() {
      return { type: "canvas2d", itemCount: 1 };
    },
    createDescriptorId(prefix) {
      return `${prefix}-fixed-id`;
    },
  });

  const snapshot = await adapter.readSnapshot({
    sourceApp: "DesktopShell",
    sourceFilePath: "D:\\tmp\\card.pdf",
  });
  assert(snapshot.text === "Context menu text", "snapshot text mismatch");
  assert(snapshot.filePaths.length === 1, "snapshot files mismatch");
  assert(snapshot.internalPayload?.itemCount === 1, "snapshot internal payload mismatch");

  const descriptor = await adapter.createDescriptor({
    origin: "context-menu",
    boardId: "board-1",
  });
  assert(descriptor.channel === INPUT_CHANNELS.PASTE_CONTEXT_MENU, "context-menu channel mismatch");
  assert(descriptor.sourceKind === INPUT_SOURCE_KINDS.MIXED, "context-menu sourceKind mismatch");
  assert(descriptor.entries.length === 3, "context-menu entries mismatch");

  let snapshotReads = 0;
  const snapshotAdapter = createContextMenuPasteAdapter({
    async readClipboardSnapshot() {
      snapshotReads += 1;
      return {
        text: "Fallback text",
        html: "<p>Rich text</p>",
        markdown: "**Rich text**",
        uriList: "https://example.com/",
        filePaths: ["D:\\tmp\\rich.docx"],
      };
    },
  });
  const richSnapshot = await snapshotAdapter.readSnapshot({ sourceApp: "Browser" });
  assert(snapshotReads === 1, "clipboard snapshot should be read once");
  assert(richSnapshot.html === "<p>Rich text</p>", "snapshot HTML mismatch");
  assert(richSnapshot.markdown === "**Rich text**", "snapshot Markdown mismatch");
  assert(richSnapshot.uriList === "https://example.com/", "snapshot URI mismatch");
  assert(richSnapshot.filePaths.length === 1, "snapshot file path mismatch");

  const emptyAdapter = createContextMenuPasteAdapter({});
  const emptyDescriptor = await emptyAdapter.createDescriptor({});
  assert(
    emptyDescriptor.channel === INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    "empty descriptor channel mismatch"
  );
  assert(
    emptyDescriptor.status === "unsupported",
    "empty context-menu descriptor should be unsupported"
  );

  console.log("[context-menu-paste-adapter] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[context-menu-paste-adapter] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
