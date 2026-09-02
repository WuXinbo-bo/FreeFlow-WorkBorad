"use strict";

const assert = require("node:assert/strict");

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const planModule = await import("../../public/src/engines/canvas2d-core/import/protocols/inputRepresentationPlan.js");
  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { buildInputRepresentationPlan } = planModule;

  const alternatives = buildInputRepresentationPlan(createInputDescriptor({
    descriptorId: "alternatives",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      entry("html", "html", "text/html", { html: "<h2>Title</h2>", text: "Title" }),
      entry("markdown", "markdown", "text/markdown", { markdown: "## Title", text: "## Title" }),
      entry("plain", "text", "text/plain", { text: "Title" }),
    ],
  }));
  assert.equal(alternatives.groups.length, 1);
  assert.equal(alternatives.groups[0].kind, "body");
  assert.equal(alternatives.groups[0].entryIds[0], "html");
  assert.equal(statusOf(alternatives, "markdown"), "deduplicated");
  assert.equal(statusOf(alternatives, "plain"), "deduplicated");

  const internal = buildInputRepresentationPlan(createInputDescriptor({
    descriptorId: "internal",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      entry("internal", "internal-payload", "application/x-freeflow-canvas", { internalPayload: { items: [{ type: "text" }] } }),
      entry("fallback-html", "html", "text/html", { html: "<p>Fallback</p>", text: "Fallback" }),
    ],
  }));
  assert.equal(internal.groups.length, 1);
  assert.equal(internal.groups[0].kind, "internal");
  assert.equal(statusOf(internal, "fallback-html"), "deduplicated");

  const composed = buildInputRepresentationPlan(createInputDescriptor({
    descriptorId: "composed",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      entry("body", "html", "text/html", { html: "<p>Body</p>", text: "Body" }),
      entry("image", "image", "image/png", { imageDataUrl: "data:image/png;base64,AA==" }),
      entry("file", "file", "application/pdf", { filePath: "D:\\tmp\\paper.pdf" }, { name: "paper.pdf" }),
      entry("uri", "uri", "text/uri-list", { uri: "https://example.com/reference" }),
    ],
  }));
  assert.deepEqual(composed.groups.map((group) => group.kind), ["body", "image", "file", "uri"]);
  assert.equal(composed.manifest.every((item) => item.status === "planned"), true);

  const duplicateUri = buildInputRepresentationPlan(createInputDescriptor({
    descriptorId: "duplicate-uri",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      entry("body", "text", "text/plain", { text: "https://example.com/same" }),
      entry("uri", "uri", "text/uri-list", { uri: "https://example.com/same" }),
    ],
  }));
  assert.equal(duplicateUri.groups.length, 1);
  assert.equal(statusOf(duplicateUri, "uri"), "deduplicated");

  console.log("[representation-plan] ok: 4 scenarios validated");
}

function entry(entryId, kind, mimeType, raw, extra = {}) {
  return {
    entryId,
    kind,
    mimeType,
    status: "ready",
    errorCode: "none",
    raw,
    ...extra,
  };
}

function statusOf(plan, entryId) {
  return plan.manifest.find((item) => item.entryId === entryId)?.status || "";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
