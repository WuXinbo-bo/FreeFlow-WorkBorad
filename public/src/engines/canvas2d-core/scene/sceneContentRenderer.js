import { getMemoLayout } from "../memoLayout.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function resolveImageCssFilter(brightnessValue = 0, contrastValue = 0) {
  const brightness = clamp(brightnessValue, -100, 100);
  const contrast = clamp(contrastValue, -100, 100);
  if (brightness === 0 && contrast === 0) return "";
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`;
}

function setStyle(node, property, value) {
  if (node.style[property] !== value) {
    node.style[property] = value;
  }
}

function syncWorldBox(node, item) {
  setStyle(node, "left", `${Number(item.x || 0)}px`);
  setStyle(node, "top", `${Number(item.y || 0)}px`);
  setStyle(node, "width", `${Math.max(1, Number(item.width || 1))}px`);
  setStyle(node, "height", `${Math.max(1, Number(item.height || 1))}px`);
}

function createSvgElement(tagName, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
}

function appendArrowHead(svg, entry, width, height) {
  const x1 = Number(entry?.x1 || 0) * width;
  const y1 = Number(entry?.y1 || 0) * height;
  const x2 = Number(entry?.x2 || 0) * width;
  const y2 = Number(entry?.y2 || 0) * height;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 8;
  const points = [
    [x2, y2],
    [x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)],
    [x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)],
  ].map((point) => point.join(",")).join(" ");
  svg.appendChild(createSvgElement("polygon", {
    points,
    fill: entry?.color || "rgba(15, 23, 42, 0.9)",
  }));
}

function syncImageAnnotations(svg, item) {
  const annotations = item?.annotations || {};
  const signature = JSON.stringify(annotations);
  if (svg.dataset.signature === signature) {
    return;
  }
  svg.replaceChildren();
  const width = Math.max(1, Number(item.width || 1));
  const height = Math.max(1, Number(item.height || 1));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  (Array.isArray(annotations.lines) ? annotations.lines : []).forEach((entry) => {
    svg.appendChild(createSvgElement("line", {
      x1: Number(entry?.x1 || 0) * width,
      y1: Number(entry?.y1 || 0) * height,
      x2: Number(entry?.x2 || 0) * width,
      y2: Number(entry?.y2 || 0) * height,
      stroke: entry?.color || "rgba(239, 68, 68, 0.92)",
      "stroke-width": 2,
      "stroke-linecap": "round",
    }));
  });
  (Array.isArray(annotations.rects) ? annotations.rects : []).forEach((entry) => {
    svg.appendChild(createSvgElement("rect", {
      x: Number(entry?.x || 0) * width,
      y: Number(entry?.y || 0) * height,
      width: Number(entry?.w || 0) * width,
      height: Number(entry?.h || 0) * height,
      rx: Math.max(0, Number(entry?.radius || 0)) * Math.min(width, height),
      fill: "none",
      stroke: entry?.color || "rgba(15, 23, 42, 0.9)",
      "stroke-width": 2,
    }));
  });
  (Array.isArray(annotations.arrows) ? annotations.arrows : []).forEach((entry) => {
    svg.appendChild(createSvgElement("line", {
      x1: Number(entry?.x1 || 0) * width,
      y1: Number(entry?.y1 || 0) * height,
      x2: Number(entry?.x2 || 0) * width,
      y2: Number(entry?.y2 || 0) * height,
      stroke: entry?.color || "rgba(15, 23, 42, 0.9)",
      "stroke-width": 2,
      "stroke-linecap": "round",
    }));
    appendArrowHead(svg, entry, width, height);
  });
  (Array.isArray(annotations.texts) ? annotations.texts : []).forEach((entry) => {
    const text = createSvgElement("text", {
      x: Number(entry?.x || 0) * width,
      y: Number(entry?.y || 0) * height,
      fill: entry?.color || "rgba(15, 23, 42, 0.95)",
      "font-size": Math.max(1, Number(entry?.fontSize || 16)),
      "font-weight": 600,
      "dominant-baseline": "hanging",
    });
    text.textContent = String(entry?.text || "");
    svg.appendChild(text);
  });
  svg.dataset.signature = signature;
}

function createImageNode() {
  const node = document.createElement("div");
  node.className = "canvas2d-scene-content-item canvas2d-scene-image-item";
  const memo = document.createElement("div");
  memo.className = "canvas2d-scene-image-memo";
  const frame = document.createElement("div");
  frame.className = "canvas2d-scene-image-frame";
  const transform = document.createElement("div");
  transform.className = "canvas2d-scene-image-transform";
  const viewport = document.createElement("div");
  viewport.className = "canvas2d-scene-image-viewport";
  const image = document.createElement("img");
  image.className = "canvas2d-scene-image-content";
  image.alt = "";
  image.draggable = false;
  const annotations = createSvgElement("svg");
  annotations.classList.add("canvas2d-scene-image-annotations");
  annotations.setAttribute("aria-hidden", "true");
  viewport.appendChild(image);
  transform.append(viewport, annotations);
  frame.appendChild(transform);
  node.append(memo, frame);
  return node;
}

function syncImageNode(node, item, context) {
  if (context.imageEditingId === item.id) {
    return false;
  }
  const source = context.resolveImageSource(item.dataUrl, item.sourcePath, {
    allowLocalFileAccess: context.allowLocalFileAccess,
  });
  if (!source) {
    return false;
  }
  syncWorldBox(node, item);
  const image = node.querySelector(".canvas2d-scene-image-content");
  const memo = node.querySelector(".canvas2d-scene-image-memo");
  const annotations = node.querySelector(".canvas2d-scene-image-annotations");
  const transform = node.querySelector(".canvas2d-scene-image-transform");
  if (
    !(image instanceof HTMLImageElement) ||
    !(memo instanceof HTMLDivElement) ||
    !(annotations instanceof SVGSVGElement) ||
    !(transform instanceof HTMLDivElement)
  ) {
    return false;
  }
  if (image.dataset.source !== source) {
    image.onload = () => context.onImageNaturalSize?.(item.id, image.naturalWidth, image.naturalHeight);
    image.dataset.source = source;
    image.src = source;
  }
  if (image.complete && image.naturalWidth) {
    context.onImageNaturalSize?.(item.id, image.naturalWidth, image.naturalHeight);
  }
  const crop = item.crop && typeof item.crop === "object"
    ? {
        x: clamp(item.crop.x, 0, 1),
        y: clamp(item.crop.y, 0, 1),
        w: clamp(item.crop.w ?? 1, 0.001, 1),
        h: clamp(item.crop.h ?? 1, 0.001, 1),
      }
    : null;
  if (crop) {
    setStyle(image, "objectFit", "fill");
    setStyle(image, "width", `${100 / crop.w}%`);
    setStyle(image, "height", `${100 / crop.h}%`);
    setStyle(image, "left", `${(-crop.x / crop.w) * 100}%`);
    setStyle(image, "top", `${(-crop.y / crop.h) * 100}%`);
  } else {
    setStyle(image, "objectFit", "contain");
    setStyle(image, "width", "100%");
    setStyle(image, "height", "100%");
    setStyle(image, "left", "0px");
    setStyle(image, "top", "0px");
  }
  const rotation = Number(item.rotation || 0) || 0;
  const scaleX = item.flipX ? -1 : 1;
  const scaleY = item.flipY ? -1 : 1;
  setStyle(transform, "transform", `rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`);
  setStyle(image, "filter", resolveImageCssFilter(item.brightness, item.contrast));
  syncImageAnnotations(annotations, item);
  const showMemo = item.memoVisible && context.imageMemoEditingId !== item.id;
  memo.style.display = showMemo ? "flex" : "none";
  if (showMemo) {
    const layout = getMemoLayout(item, { kind: "image" });
    memo.textContent = String(item.memo || "");
    setStyle(memo, "left", `${layout.left - Number(item.x || 0)}px`);
    setStyle(memo, "top", `${layout.top - Number(item.y || 0)}px`);
    setStyle(memo, "width", `${layout.width}px`);
    setStyle(memo, "height", `${layout.height}px`);
    setStyle(memo, "padding", `${layout.padding}px`);
    setStyle(memo, "borderRadius", `${layout.radius}px`);
    setStyle(memo, "fontSize", `${layout.fontSize}px`);
    setStyle(memo, "lineHeight", `${layout.lineHeight}px`);
  }
  return true;
}

function createTableNode() {
  const node = document.createElement("div");
  node.className = "canvas2d-scene-content-item canvas2d-scene-table-item";
  return node;
}

function syncTableNode(node, item, context) {
  if (context.tableEditingId === item.id) {
    return false;
  }
  syncWorldBox(node, item);
  const signature = JSON.stringify(item.table || {});
  if (node.dataset.contentSignature === signature) {
    return true;
  }
  const table = document.createElement("table");
  table.className = "canvas2d-scene-table";
  const body = document.createElement("tbody");
  const rows = Array.isArray(item.table?.rows) ? item.table.rows : [];
  rows.forEach((row) => {
    const rowNode = document.createElement("tr");
    (Array.isArray(row?.cells) ? row.cells : []).forEach((cell) => {
      const cellNode = document.createElement(cell?.header ? "th" : "td");
      cellNode.colSpan = Math.max(1, Number(cell?.colSpan || 1));
      cellNode.rowSpan = Math.max(1, Number(cell?.rowSpan || 1));
      cellNode.style.textAlign = ["left", "center", "right"].includes(cell?.align) ? cell.align : "left";
      cellNode.innerHTML = context.renderTableCellHtml(cell);
      rowNode.appendChild(cellNode);
    });
    body.appendChild(rowNode);
  });
  table.appendChild(body);
  node.replaceChildren(table);
  node.dataset.contentSignature = signature;
  return true;
}

function createFileCardNode() {
  const node = document.createElement("div");
  node.className = "canvas2d-scene-content-item canvas2d-scene-file-card-item";
  const memo = document.createElement("div");
  memo.className = "canvas2d-scene-file-card-memo";
  const card = document.createElement("div");
  card.className = "canvas2d-scene-file-card-body";
  const tag = document.createElement("div");
  tag.className = "canvas2d-scene-file-card-tag";
  const name = document.createElement("div");
  name.className = "canvas2d-scene-file-card-name";
  const meta = document.createElement("div");
  meta.className = "canvas2d-scene-file-card-meta";
  const mark = document.createElement("div");
  mark.className = "canvas2d-scene-file-card-mark";
  card.append(tag, name, meta, mark);
  node.append(memo, card);
  return node;
}

function syncFileCardNode(node, item, context) {
  if (context.scale <= 0.15) {
    return false;
  }
  syncWorldBox(node, item);
  const memo = node.querySelector(".canvas2d-scene-file-card-memo");
  const tag = node.querySelector(".canvas2d-scene-file-card-tag");
  const name = node.querySelector(".canvas2d-scene-file-card-name");
  const meta = node.querySelector(".canvas2d-scene-file-card-meta");
  const mark = node.querySelector(".canvas2d-scene-file-card-mark");
  if (
    !(memo instanceof HTMLDivElement) ||
    !(tag instanceof HTMLDivElement) ||
    !(name instanceof HTMLDivElement) ||
    !(meta instanceof HTMLDivElement) ||
    !(mark instanceof HTMLDivElement)
  ) {
    return false;
  }
  const extension = String(item.ext || "").toUpperCase() || "FILE";
  tag.textContent = extension;
  name.textContent = String(item.name || item.fileName || "未命名文件");
  meta.textContent = extension;
  tag.style.color = String(item.accentTextColor || "#1d4ed8");
  tag.style.background = String(item.accentSoftColor || "rgba(59, 130, 246, 0.12)");
  tag.style.borderColor = String(item.accentStrokeColor || "rgba(59, 130, 246, 0.18)");
  const logicalHeight = Math.max(1, Number(item.height || 1));
  setStyle(tag, "fontSize", `${Math.min(26, Math.max(10, logicalHeight * 0.12))}px`);
  setStyle(name, "fontSize", `${Math.min(28, Math.max(10, logicalHeight * 0.15))}px`);
  setStyle(meta, "fontSize", `${Math.min(24, Math.max(10, logicalHeight * 0.12))}px`);
  mark.style.display = item.marked ? "block" : "none";
  const showMemo = item.memoVisible && context.fileMemoEditingId !== item.id;
  memo.style.display = showMemo ? "flex" : "none";
  if (showMemo) {
    const layout = getMemoLayout(item, { kind: "fileCard" });
    memo.textContent = String(item.memo || "");
    setStyle(memo, "left", `${layout.left - Number(item.x || 0)}px`);
    setStyle(memo, "top", `${layout.top - Number(item.y || 0)}px`);
    setStyle(memo, "width", `${layout.width}px`);
    setStyle(memo, "height", `${layout.height}px`);
    setStyle(memo, "padding", `${layout.padding}px`);
    setStyle(memo, "borderRadius", `${layout.radius}px`);
    setStyle(memo, "fontSize", `${layout.fontSize}px`);
    setStyle(memo, "lineHeight", `${layout.lineHeight}px`);
  }
  return true;
}

export function createSceneContentRenderer({
  host = null,
  resolveImageSource = () => "",
  renderTableCellHtml = (cell) => String(cell?.plainText || ""),
  onImageNaturalSize = null,
} = {}) {
  const nodes = new Map();
  let ownedIds = new Set();
  const adapters = new Map([
    ["image", { createNode: createImageNode, syncNode: syncImageNode }],
    ["table", { createNode: createTableNode, syncNode: syncTableNode }],
    ["fileCard", { createNode: createFileCardNode, syncNode: syncFileCardNode }],
  ]);

  function setHost(nextHost) {
    host = nextHost;
  }

  function clear() {
    nodes.forEach((node) => node.remove?.());
    nodes.clear();
    ownedIds = new Set();
  }

  function sync({
    items = [],
    frozen = false,
    allowLocalFileAccess = true,
    editingId = "",
    editingType = "",
    view = null,
    canOwnItem = () => true,
  } = {}) {
    if (frozen || !(host instanceof HTMLElement)) {
      return new Set(ownedIds);
    }
    const nextOwnedIds = new Set();
    const activeIds = new Set();
    const context = {
      allowLocalFileAccess,
      imageEditingId: editingType === "image" ? editingId : "",
      imageMemoEditingId: editingType === "image-memo" ? editingId : "",
      tableEditingId: editingType === "table" ? editingId : "",
      fileMemoEditingId: editingType === "file-memo" ? editingId : "",
      scale: Math.max(0.1, Number(view?.scale || 1) || 1),
      resolveImageSource,
      renderTableCellHtml,
      onImageNaturalSize,
    };
    (Array.isArray(items) ? items : []).forEach((item) => {
      const adapter = adapters.get(item?.type);
      const itemId = String(item?.id || "");
      if (!adapter || !itemId) {
        return;
      }
      if (!canOwnItem(item)) {
        return;
      }
      activeIds.add(itemId);
      let node = nodes.get(itemId);
      if (!node) {
        node = adapter.createNode(item);
        node.dataset.id = itemId;
        node.dataset.type = item.type;
        nodes.set(itemId, node);
        host.appendChild(node);
      }
      const owned = adapter.syncNode(node, item, context) === true;
      node.style.display = owned ? "block" : "none";
      if (owned) {
        nextOwnedIds.add(itemId);
      }
    });
    nodes.forEach((node, itemId) => {
      if (!activeIds.has(itemId)) {
        node.remove?.();
        nodes.delete(itemId);
      }
    });
    ownedIds = nextOwnedIds;
    return new Set(ownedIds);
  }

  return {
    setHost,
    sync,
    clear,
    getOwnedIds: () => new Set(ownedIds),
  };
}
