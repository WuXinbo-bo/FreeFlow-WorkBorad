import { buildExternalCompatibilityOutputFromItems } from "../protocols/externalCompatibilityOutput.js";
import { createInputDescriptor, INPUT_CHANNELS, INPUT_ENTRY_KINDS, INPUT_SOURCE_KINDS } from "../protocols/inputDescriptor.js";

export function buildHostFlowbackPayload(items = [], options = {}) {
  const output = buildExternalCompatibilityOutputFromItems(items, {
    source: options.source || "canvas",
  });
  return {
    externalOutput: output,
    pasteDescriptor: buildHostPasteBackDescriptor(output, options),
    dragDescriptor: buildHostDragBackDescriptor(output, options),
  };
}

export function buildHostPasteBackDescriptor(output, options = {}) {
  return createInputDescriptor({
    descriptorId: String(options.descriptorId || "flowback-paste"),
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: inferOutputSourceKind(output),
    status: "ready",
    tags: ["host-flowback", "paste"],
    entries: buildEntriesFromOutput(output),
  });
}

export function buildHostDragBackDescriptor(output, options = {}) {
  return createInputDescriptor({
    descriptorId: String(options.descriptorId || "flowback-drag"),
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: inferOutputSourceKind(output),
    status: "ready",
    tags: ["host-flowback", "drag"],
    entries: buildEntriesFromOutput(output),
  });
}

function buildEntriesFromOutput(output = {}) {
  const entries = [];
  if (output.text) {
    entries.push({
      entryId: "flowback-text",
      kind: INPUT_ENTRY_KINDS.TEXT,
      status: "ready",
      raw: { text: String(output.text || "") },
    });
  }
  if (output.html) {
    entries.push({
      entryId: "flowback-html",
      kind: INPUT_ENTRY_KINDS.HTML,
      status: "ready",
      raw: { html: String(output.html || "") },
    });
  }
  for (const [index, filePath] of (Array.isArray(output.filePaths) ? output.filePaths : []).entries()) {
    entries.push({
      entryId: `flowback-file-${index}`,
      kind: INPUT_ENTRY_KINDS.FILE,
      status: "ready",
      raw: { filePath: String(filePath || "") },
    });
  }
  return entries;
}

function inferOutputSourceKind(output = {}) {
  if (Array.isArray(output.filePaths) && output.filePaths.length) {
    return INPUT_SOURCE_KINDS.FILE_RESOURCE;
  }
  if (String(output.html || "").trim()) {
    return INPUT_SOURCE_KINDS.HTML;
  }
  return INPUT_SOURCE_KINDS.PLAIN_TEXT;
}
