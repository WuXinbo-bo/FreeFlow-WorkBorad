import { clone } from "../../utils.js";
import { buildCanonicalFragmentCopyPayloadFromItems } from "./canonicalFragmentCopy.js";
import { buildDowngradedCopyPayloadFromItems } from "./copyDowngradeRules.js";

export const EXTERNAL_COMPATIBILITY_OUTPUT_KIND = "structured-external-copy";
export const EXTERNAL_COMPATIBILITY_OUTPUT_VERSION = "1.0.0";

export function buildExternalCompatibilityOutputFromItems(items = [], options = {}) {
  const cleanItems = Array.isArray(items) ? items : [];
  const canonicalCopy = buildCanonicalFragmentCopyPayloadFromItems(cleanItems, options);
  const downgradedCopy = buildDowngradedCopyPayloadFromItems(cleanItems, options);
  const filePaths = extractExternalFilePaths(cleanItems);
  return {
    kind: EXTERNAL_COMPATIBILITY_OUTPUT_KIND,
    version: EXTERNAL_COMPATIBILITY_OUTPUT_VERSION,
    source: String(options.source || "canvas"),
    createdAt: Number(options.createdAt) || Date.now(),
    text: String(downgradedCopy.text || ""),
    html: String(downgradedCopy.html || ""),
    filePaths,
    canonicalCopy,
    downgradedCopy,
    stats: {
      itemCount: cleanItems.length,
      fragmentCount: Number(canonicalCopy?.stats?.fragmentCount || 0),
      downgradedEntryCount: Number(downgradedCopy?.stats?.entryCount || 0),
      filePathCount: filePaths.length,
    },
    summary: {
      itemTypes: canonicalCopy?.summary?.itemTypes ? clone(canonicalCopy.summary.itemTypes) : {},
      fragmentKinds: canonicalCopy?.summary?.fragmentKinds ? clone(canonicalCopy.summary.fragmentKinds) : {},
    },
  };
}

export function extractExternalFilePaths(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (item?.type === "image") {
        return String(
          item?.structuredImport?.canonicalFragment?.attrs?.src ||
          item?.sourcePath ||
          ""
        ).trim();
      }
      if (item?.type === "fileCard") {
        return String(
          item?.structuredImport?.compatibilityFragment?.sourcePath ||
          item?.sourcePath ||
          ""
        ).trim();
      }
      return "";
    })
    .filter((value) => /^[A-Za-z]:\\/.test(value) || /^\\\\/.test(value));
}
