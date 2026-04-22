import { buildTextTitle, createId } from "../../../utils.js";
import { normalizeImageElement } from "../../../elements/media.js";
import { RENDER_PAYLOAD_KINDS } from "../rendererPipeline.js";
import { buildImageElementFromRenderOperation } from "./imageElementBridge.js";
import { deriveNodeSourceOrder } from "../shared/sourceOrder.js";

export const IMAGE_RENDERER_ID = "image-renderer";

export function createImageRenderer(options = {}) {
  const id = options.id || IMAGE_RENDERER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 80;

  return {
    id,
    version: "1.0.0",
    displayName: "Image Renderer / Legacy image Bridge",
    priority,
    payloadKinds: [RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT],
    tags: ["builtin", "image", "legacy-bridge"],
    supports({ renderInput }) {
      const images = collectImageNodes(renderInput?.payload?.content || []);
      if (!images.length) {
        return { matched: false, score: -1, reason: "no-image-nodes" };
      }
      return {
        matched: true,
        score: images.length >= 2 ? 22 : 16,
        reason: images.length >= 2 ? "multiple-image-nodes" : "image-node-available",
      };
    },
    async render({ renderInput }) {
      const images = collectImageNodes(renderInput?.payload?.content || []);
      const operations = images.map((image, index) => buildImageOperation(image, index, renderInput));
      return {
        planId: `${id}:${renderInput?.descriptorId || "image-render-plan"}`,
        kind: "element-render-plan",
        payloadKind: renderInput?.kind || RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT,
        operations,
        stats: {
          imageCount: operations.length,
          embeddedImageCount: operations.filter((operation) => operation.structure.source === "blob").length,
          fileBackedImageCount: operations.filter((operation) => operation.structure.source === "path").length,
          externalImageCount: operations.filter((operation) => operation.structure.source === "external").length,
        },
        meta: {
          rendererId: id,
        },
      };
    },
  };
}

function collectImageNodes(nodes = [], context = { quoteDepth: 0, parentType: "doc" }) {
  const result = [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  safeNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "image") {
      result.push({
        node,
        quoteDepth: context.quoteDepth,
        parentType: context.parentType,
        orderKey: `${context.quoteDepth}:${index}`,
      });
      return;
    }
    if (Array.isArray(node.content) && node.content.length) {
      result.push(
        ...collectImageNodes(node.content, {
          quoteDepth: node.type === "blockquote" ? context.quoteDepth + 1 : context.quoteDepth,
          parentType: node.type,
        })
      );
    }
  });
  return result;
}

function buildImageOperation(image, index, renderInput) {
  const attrs = image?.node?.attrs || {};
  const src = String(attrs.src || "").trim();
  const name = inferImageName(attrs);
  const mime = inferMimeType(src);
  const source = inferImageSource(src);
  const width = normalizePositiveNumber(attrs.width, 320);
  const height = normalizePositiveNumber(attrs.height, 220);

  const legacyImage = normalizeImageElement({
    id: createId("img"),
    type: "image",
    name,
    mime,
    source,
    sourcePath: source === "path" ? src : "",
    dataUrl: source === "blob" ? src : "",
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    fileId: String(attrs.resourceId || ""),
    x: 0,
    y: 0,
    memo: "",
    memoVisible: false,
  });

  const operation = {
    type: "render-image-block",
    sourceNodeType: "image",
    legacyType: "image",
    order: index,
    layout: {
      strategy: "flow-stack",
      stackIndex: index,
      quoteDepth: image.quoteDepth,
      gap: 20,
    },
    element: legacyImage,
    structure: {
      src,
      alt: String(attrs.alt || ""),
      title: String(attrs.title || ""),
      resourceId: String(attrs.resourceId || ""),
      source,
      parentType: image.parentType,
    },
    meta: {
      descriptorId: String(renderInput?.descriptorId || ""),
      parserId: String(renderInput?.parserId || ""),
    },
    sourceOrder: deriveNodeSourceOrder(image?.node, index),
  };
  operation.element = buildImageElementFromRenderOperation(operation);
  return operation;
}

function inferImageName(attrs = {}) {
  const preferred = String(attrs.title || attrs.alt || "").trim();
  if (preferred) {
    return preferred;
  }
  const src = String(attrs.src || "").trim();
  const clean = src.replace(/\\/g, "/").split("/").pop() || "";
  return buildTextTitle(clean || "图片");
}

function inferImageSource(src) {
  if (!src) {
    return "path";
  }
  if (/^data:image\//i.test(src)) {
    return "blob";
  }
  if (/^https?:\/\//i.test(src)) {
    return "external";
  }
  return "path";
}

function inferMimeType(src) {
  if (!src) {
    return "image/*";
  }
  const dataMatch = src.match(/^data:(image\/[^;]+);/i);
  if (dataMatch) {
    return dataMatch[1].toLowerCase();
  }
  const normalized = src.split("?")[0].toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  return "image/*";
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
