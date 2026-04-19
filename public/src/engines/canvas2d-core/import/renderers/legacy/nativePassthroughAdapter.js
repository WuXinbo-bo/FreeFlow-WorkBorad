import { buildNativeElementFromPassthroughOperation } from "./nativeCompatibilityPassthrough.js";

export const NATIVE_PASSTHROUGH_ADAPTER_ID = "native-passthrough-adapter";

const PASSTHROUGH_LEGACY_TYPES = Object.freeze([
  "flowNode",
  "flowEdge",
  "mindNode",
  "shape",
  "text",
  "image",
  "fileCard",
]);

export function createNativePassthroughAdapter(options = {}) {
  const id = options.id || NATIVE_PASSTHROUGH_ADAPTER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 82;

  return {
    id,
    version: "1.0.0",
    displayName: "Native Passthrough Adapter",
    priority,
    adapterTypes: ["native-items"],
    legacyTypes: PASSTHROUGH_LEGACY_TYPES.slice(),
    tags: ["builtin", "legacy-native", "passthrough"],
    supports({ compatibility }) {
      const items = collectPassthroughItems(compatibility);
      if (!items.length) {
        return { matched: false, score: -1, reason: "no-native-passthrough-items" };
      }
      return {
        matched: true,
        score: items.length >= 3 ? 16 : 10,
        reason: items.length >= 3 ? "multiple-native-items" : "native-item-available",
      };
    },
    async adapt({ compatibility }) {
      const items = collectPassthroughItems(compatibility);
      const operations = items.map((item, index) => buildPassthroughOperation(item, index, compatibility));
      return {
        planId: `${id}:${compatibility?.descriptorId || "native-passthrough-plan"}`,
        kind: "legacy-bridge-plan",
        adapterType: "native-items",
        operations,
        stats: {
          itemCount: operations.length,
          typeCounts: buildTypeCounts(operations),
        },
        meta: {
          adapterId: id,
          parserId: String(compatibility?.parserId || ""),
        },
      };
    },
  };
}

function collectPassthroughItems(compatibility) {
  const items = Array.isArray(compatibility?.items) ? compatibility.items : [];
  return items.filter((item) => {
    const legacyType = String(item?.legacyType || "");
    return PASSTHROUGH_LEGACY_TYPES.includes(legacyType) && item?.item && typeof item.item === "object";
  });
}

function buildPassthroughOperation(item, index, compatibility) {
  const operation = {
    type: "bridge-native-item",
    legacyType: String(item?.legacyType || ""),
    order: index,
    element: { ...item.item },
    structure: {
      entryId: String(item?.entryId || ""),
      originId: String(item?.originId || ""),
      legacyType: String(item?.legacyType || ""),
    },
    meta: {
      descriptorId: String(compatibility?.descriptorId || ""),
      parserId: String(compatibility?.parserId || ""),
    },
  };
  operation.element = buildNativeElementFromPassthroughOperation(operation);
  return operation;
}

function buildTypeCounts(operations) {
  return operations.reduce((counts, operation) => {
    const legacyType = String(operation?.legacyType || "");
    if (!legacyType) {
      return counts;
    }
    counts[legacyType] = (counts[legacyType] || 0) + 1;
    return counts;
  }, {});
}
