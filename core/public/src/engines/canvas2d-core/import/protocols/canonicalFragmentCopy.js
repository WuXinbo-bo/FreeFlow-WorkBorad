import { clone } from "../../utils.js";

export const CANONICAL_FRAGMENT_COPY_KIND = "structured-canonical-copy";
export const CANONICAL_FRAGMENT_COPY_VERSION = "1.0.0";

export function buildCanonicalFragmentCopyPayloadFromItems(items = [], options = {}) {
  const cleanItems = Array.isArray(items) ? items : [];
  const fragments = collectCanonicalCopyFragments(cleanItems);
  return {
    kind: CANONICAL_FRAGMENT_COPY_KIND,
    version: CANONICAL_FRAGMENT_COPY_VERSION,
    source: String(options.source || "canvas"),
    createdAt: Number(options.createdAt) || Date.now(),
    nativeItems: clone(cleanItems),
    fragments,
    stats: buildFragmentStats(cleanItems, fragments),
    summary: {
      itemTypes: countItemTypes(cleanItems),
      fragmentKinds: countFragmentKinds(fragments),
    },
  };
}

export function collectCanonicalCopyFragments(items = []) {
  const cleanItems = Array.isArray(items) ? items : [];
  return cleanItems.flatMap((item, index) => collectItemFragments(item, index));
}

export function hasCanonicalFragmentCopyData(items = []) {
  return collectCanonicalCopyFragments(items).length > 0;
}

function collectItemFragments(item = {}, index = 0) {
  const fragments = [];
  const itemId = String(item?.id || `item-${index}`);
  const itemType = String(item?.type || "unknown");

  const structuredImport = item?.structuredImport;
  if (structuredImport && typeof structuredImport === "object") {
    if (structuredImport.canonicalFragment && typeof structuredImport.canonicalFragment === "object") {
      fragments.push({
        fragmentId: `${itemId}:canonical`,
        itemId,
        itemType,
        fragmentKind: "canonical",
        sourceNodeType: String(structuredImport.sourceNodeType || itemType),
        sourceMeta:
          structuredImport.sourceMeta && typeof structuredImport.sourceMeta === "object"
            ? { ...structuredImport.sourceMeta }
            : {},
        data: clone(structuredImport.canonicalFragment),
      });
    }

    if (structuredImport.compatibilityFragment && typeof structuredImport.compatibilityFragment === "object") {
      fragments.push({
        fragmentId: `${itemId}:compatibility`,
        itemId,
        itemType,
        fragmentKind: "compatibility",
        sourceNodeType: String(structuredImport.sourceNodeType || itemType),
        sourceMeta:
          structuredImport.sourceMeta && typeof structuredImport.sourceMeta === "object"
            ? { ...structuredImport.sourceMeta }
            : {},
        data: clone(structuredImport.compatibilityFragment),
      });
    }
  }

  const legacyCompatibility = item?.legacyCompatibility;
  if (legacyCompatibility && typeof legacyCompatibility === "object") {
    fragments.push({
      fragmentId: `${itemId}:legacy-compatibility`,
      itemId,
      itemType,
      fragmentKind: "legacy-compatibility",
      sourceNodeType: String(legacyCompatibility.legacyType || itemType),
      sourceMeta:
        legacyCompatibility.sourceMeta && typeof legacyCompatibility.sourceMeta === "object"
          ? { ...legacyCompatibility.sourceMeta }
          : {},
      data: clone(legacyCompatibility),
    });
  }

  return fragments;
}

function buildFragmentStats(items = [], fragments = []) {
  return {
    itemCount: Array.isArray(items) ? items.length : 0,
    fragmentCount: fragments.length,
    canonicalFragmentCount: fragments.filter((fragment) => fragment.fragmentKind === "canonical").length,
    compatibilityFragmentCount: fragments.filter((fragment) => fragment.fragmentKind === "compatibility").length,
    legacyCompatibilityCount: fragments.filter((fragment) => fragment.fragmentKind === "legacy-compatibility").length,
  };
}

function countItemTypes(items = []) {
  return (Array.isArray(items) ? items : []).reduce((counts, item) => {
    const itemType = String(item?.type || "unknown");
    counts[itemType] = (counts[itemType] || 0) + 1;
    return counts;
  }, {});
}

function countFragmentKinds(fragments = []) {
  return (Array.isArray(fragments) ? fragments : []).reduce((counts, fragment) => {
    const kind = String(fragment?.fragmentKind || "unknown");
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
}
