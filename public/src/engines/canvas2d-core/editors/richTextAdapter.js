import { normalizeRichHtml, normalizeRichHtmlInlineFontSizes } from "../utils.js";

function ensureEditableHost(host) {
  if (!host) {
    return null;
  }
  host.setAttribute("contenteditable", "true");
  host.setAttribute("spellcheck", "false");
  host.setAttribute("role", "textbox");
  return host;
}

function exec(command, value) {
  if (typeof document?.execCommand !== "function") {
    return false;
  }
  return document.execCommand(command, false, value);
}

function getNodeText(node) {
  if (!node) {
    return "";
  }
  return String(node.textContent || "").replace(/\u00a0/g, " ");
}

function normalizeRichFontSize(value, fallback = 16) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return Math.max(10, Number(fallback) || 16);
  }
  return Math.max(10, numericValue);
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeMathElementType(type = "") {
  const normalized = String(type || "").trim().toLowerCase();
  return normalized === "block" ? "block" : "inline";
}

function stripMathEditingDelimiters(value = "", type = "inline") {
  const source = String(value || "").replace(/\u00a0/g, " ").trim();
  if (!source) {
    return "";
  }
  if (normalizeMathElementType(type) === "block") {
    const fenced = source.match(/^\$\$\s*[\r\n]?([\s\S]*?)[\r\n]?\s*\$\$$/);
    if (fenced) {
      return String(fenced[1] || "").trim();
    }
    return source.replace(/^\$\$+/, "").replace(/\$\$+$/, "").trim();
  }
  const inlineWrapped = source.match(/^\$(?!\$)([\s\S]*?)(?<!\$)\$$/);
  if (inlineWrapped) {
    return String(inlineWrapped[1] || "").trim();
  }
  return source.replace(/^\$/, "").replace(/\$$/, "").trim();
}

function formatMathForEditing(value = "", type = "inline") {
  const source = stripMathEditingDelimiters(value, type);
  if (!source) {
    return "";
  }
  if (normalizeMathElementType(type) === "block") {
    return `$$\n${source}\n$$`;
  }
  return `$${source}$`;
}

function getMathEditingAffixLengths(value = "", type = "inline") {
  const raw = String(value || "");
  if (normalizeMathElementType(type) === "block") {
    if (raw.startsWith("$$\n") && raw.endsWith("\n$$")) {
      return { prefix: 3, suffix: 3 };
    }
    if (raw.startsWith("$$") && raw.endsWith("$$")) {
      return { prefix: 2, suffix: 2 };
    }
    return { prefix: 0, suffix: 0 };
  }
  if (raw.startsWith("$") && raw.endsWith("$") && raw.length >= 2) {
    return { prefix: 1, suffix: 1 };
  }
  return { prefix: 0, suffix: 0 };
}

function normalizeLinkInput(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^freeflow:\/\/canvas\/item\//i.test(raw)) {
    return raw;
  }
  if (/^file:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch (_fileError) {
      return "";
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(raw)) {
    const normalizedPath = raw.replace(/\\/g, "/");
    return encodeURI(`file:///${normalizedPath}`);
  }
  if (/^\\\\[^\\]+\\[^\\]+/.test(raw)) {
    const normalizedPath = raw.replace(/\\/g, "/");
    return encodeURI(`file:${normalizedPath}`);
  }
  if (/^\/[^/]/.test(raw)) {
    return encodeURI(`file://${raw}`);
  }
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:", "mailto:", "tel:", "file:", "freeflow:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch (_error) {
    if (/^www\./i.test(raw)) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch (_fallbackError) {
        return "";
      }
    }
    if (/^[^\s]+\.[^\s]+/.test(raw) && !raw.includes("://")) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch (_fallbackError) {
        return "";
      }
    }
    return "";
  }
}

function isCanvasInternalLinkHref(value = "") {
  return /^freeflow:\/\/canvas\/item\//i.test(String(value || "").trim());
}

function serializeCodeBlockPlainTextToHtml(text = "") {
  return escapeHtml(String(text || "")).replace(/\n/g, "<br>");
}

export function createRichTextAdapter(
  host,
  {
    onCommit,
    onCancel,
    onInput,
    onBlur,
    onSelectionChange: onSelectionChangeExternal,
    onRequestExternalLink,
  } = {}
) {
  const element = ensureEditableHost(host);
  if (!element) {
    return null;
  }
  exec("defaultParagraphSeparator", "br");
  let lastRange = null;

  function isTransparentColor(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "transparent" || normalized === "rgba(0, 0, 0, 0)" || normalized === "rgba(0,0,0,0)";
  }

  function resolveElement(node) {
    if (!node) {
      return null;
    }
    if (node instanceof Element) {
      return node;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node.parentElement;
    }
    return null;
  }

  function findAncestor(node, predicate) {
    let current = resolveElement(node);
    while (current) {
      if (current === element) {
        return predicate(current) ? current : null;
      }
      if (predicate(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function isHighlightElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.hasAttribute("data-ff-highlight")) {
      return true;
    }
    if (node.tagName === "MARK") {
      return true;
    }
    const inlineBackground = String(node.style?.backgroundColor || "").trim();
    if (inlineBackground && !isTransparentColor(inlineBackground)) {
      return true;
    }
    if (node.tagName !== "SPAN" || typeof window?.getComputedStyle !== "function") {
      return false;
    }
    const computedBackground = String(window.getComputedStyle(node).backgroundColor || "").trim();
    return !isTransparentColor(computedBackground);
  }

  function isCanonicalHighlightElement(node) {
    return node instanceof HTMLElement && node.getAttribute("data-ff-highlight") === "true";
  }

  function getHighlightColor(node) {
    const elementNode = node instanceof HTMLElement ? node : null;
    if (!elementNode) {
      return "";
    }
    const inlineBackground = String(elementNode.style?.backgroundColor || "").trim();
    if (inlineBackground && !isTransparentColor(inlineBackground)) {
      return inlineBackground;
    }
    const attrColor = String(elementNode.getAttribute?.("data-ff-highlight-color") || "").trim();
    if (attrColor) {
      return attrColor;
    }
    if (typeof window?.getComputedStyle === "function") {
      const computedBackground = String(window.getComputedStyle(elementNode).backgroundColor || "").trim();
      if (!isTransparentColor(computedBackground)) {
        return computedBackground;
      }
    }
    return "";
  }

  function getSelectionEndpointRange(range) {
    if (!(range instanceof Range)) {
      return null;
    }
    const start = findAncestor(range.startContainer, () => true);
    const end = findAncestor(range.endContainer, () => true);
    return { start, end };
  }

  function getUniformAncestor(range, predicate) {
    if (!(range instanceof Range)) {
      return null;
    }
    const { start, end } = getSelectionEndpointRange(range);
    const startMatch = start ? findAncestor(start, predicate) : null;
    const endMatch = end ? findAncestor(end, predicate) : null;
    if (startMatch && startMatch === endMatch) {
      return startMatch;
    }
    if (range.collapsed) {
      return startMatch;
    }
    return null;
  }

  function isBoldElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return node.tagName === "STRONG" || node.tagName === "B";
  }

  function isHeadingElement(node) {
    return node instanceof HTMLElement && /^H[1-6]$/.test(node.tagName);
  }

  function isItalicElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return node.tagName === "EM" || node.tagName === "I";
  }

  function isUnderlineElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.tagName === "U") {
      return true;
    }
    const decoration = String(node.style?.textDecoration || node.style?.textDecorationLine || "").toLowerCase();
    return decoration.includes("underline");
  }

  function isStrikeElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.tagName === "S" || node.tagName === "DEL") {
      return true;
    }
    const decoration = String(node.style?.textDecoration || node.style?.textDecorationLine || "").toLowerCase();
    return decoration.includes("line-through");
  }

  function isInlineCodeElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return node.tagName === "CODE" && node.parentElement?.tagName !== "PRE";
  }

  function isLinkElement(node) {
    return node instanceof HTMLAnchorElement && node.tagName === "A";
  }

  function applyAnchorAttrs(anchor, href = "") {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return false;
    }
    const normalizedHref = normalizeLinkInput(href);
    if (!normalizedHref) {
      return false;
    }
    anchor.setAttribute("href", normalizedHref);
    if (isCanvasInternalLinkHref(normalizedHref)) {
      const targetId = decodeURIComponent(String(normalizedHref).replace(/^freeflow:\/\/canvas\/item\//i, ""));
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      anchor.setAttribute("data-link-kind", "canvas-link");
      anchor.setAttribute("data-link-type", "canvas-item");
      if (targetId) {
        anchor.setAttribute("data-link-target-id", targetId);
      } else {
        anchor.removeAttribute("data-link-target-id");
      }
      return true;
    }
    anchor.removeAttribute("data-link-kind");
    anchor.setAttribute("data-link-type", "external");
    anchor.removeAttribute("data-link-target-id");
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
    return true;
  }

  function getLinkNodesWithinRange(range) {
    if (!(range instanceof Range)) {
      return [];
    }
    const links = new Set();
    const startLink = findAncestor(range.startContainer, isLinkElement);
    const endLink = findAncestor(range.endContainer, isLinkElement);
    if (startLink instanceof HTMLAnchorElement) {
      links.add(startLink);
    }
    if (endLink instanceof HTMLAnchorElement) {
      links.add(endLink);
    }
    const textNodes = getSelectedTextNodes(range);
    textNodes.forEach((node) => {
      const linkNode = findAncestor(node, isLinkElement);
      if (linkNode instanceof HTMLAnchorElement) {
        links.add(linkNode);
      }
    });
    return Array.from(links);
  }

  function unlinkSelection() {
    const range = getSelectionRange();
    if (!(range instanceof Range)) {
      return false;
    }
    const links = getLinkNodesWithinRange(range);
    if (!links.length) {
      return false;
    }
    links.sort((left, right) => (left.contains(right) ? -1 : right.contains(left) ? 1 : 0));
    links.forEach((linkNode) => unwrapNode(linkNode));
    const refreshedRange = getSelectionRange({ includeStored: false });
    if (refreshedRange) {
      setSelectionRange(refreshedRange);
    }
    return true;
  }

  function isCodeBlockElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return (
      node.getAttribute("data-ff-code-block") === "true" ||
      node.tagName === "PRE" ||
      (node.tagName === "CODE" && node.parentElement?.tagName === "PRE")
    );
  }

  function isMathElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    const role = String(node.getAttribute("data-role") || "").trim().toLowerCase();
    return role === "math-inline" || role === "math-block";
  }

  function getMathElementType(node) {
    const role = String(node?.getAttribute?.("data-role") || "").trim().toLowerCase();
    if (role === "math-inline") {
      return "inline";
    }
    if (role === "math-block") {
      return "block";
    }
    return "";
  }

  function getMathElementSource(node) {
    if (!(node instanceof HTMLElement)) {
      return "";
    }
    return stripMathEditingDelimiters(getNodeText(node), getMathElementType(node));
  }

  function setMathElementSource(node, value = "") {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    const type = getMathElementType(node);
    const source = stripMathEditingDelimiters(value, type);
    if (!source) {
      return false;
    }
    node.textContent = formatMathForEditing(source, type);
    return true;
  }

  function getMathSelectionOffsets(node, range) {
    if (!(node instanceof HTMLElement) || !(range instanceof Range)) {
      return null;
    }
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    const startRange = nodeRange.cloneRange();
    startRange.setEnd(range.startContainer, range.startOffset);
    const endRange = nodeRange.cloneRange();
    endRange.setEnd(range.endContainer, range.endOffset);
    return {
      start: Math.max(0, startRange.toString().length),
      end: Math.max(0, endRange.toString().length),
    };
  }

  function collapseInsideMathElementAtSourceOffset(node, sourceOffset = 0) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    const textNode = node.firstChild instanceof Text ? node.firstChild : null;
    if (!(textNode instanceof Text)) {
      return collapseInsideMathElement(node);
    }
    const raw = textNode.data || "";
    const affixes = getMathEditingAffixLengths(raw, getMathElementType(node));
    const maxSourceLength = Math.max(0, raw.length - affixes.prefix - affixes.suffix);
    const safeSourceOffset = Math.max(0, Math.min(maxSourceLength, Number(sourceOffset) || 0));
    return setCollapsedSelection(textNode, Math.max(0, Math.min(raw.length, affixes.prefix + safeSourceOffset)));
  }

  function insertIntoCurrentMathElement(value = "") {
    const currentMathElement = getCurrentMathElement();
    const range = getSelectionRange();
    if (!(currentMathElement instanceof HTMLElement) || !(range instanceof Range)) {
      return false;
    }
    const type = getMathElementType(currentMathElement);
    const insertion = stripMathEditingDelimiters(value, type);
    if (!insertion) {
      return false;
    }
    const source = getMathElementSource(currentMathElement);
    const raw = getNodeText(currentMathElement);
    const affixes = getMathEditingAffixLengths(raw, type);
    const rawOffsets = getMathSelectionOffsets(currentMathElement, range);
    if (!rawOffsets) {
      return false;
    }
    const maxSourceLength = Math.max(0, source.length);
    const start = Math.max(0, Math.min(maxSourceLength, rawOffsets.start - affixes.prefix));
    const end = Math.max(start, Math.min(maxSourceLength, rawOffsets.end - affixes.prefix));
    const nextSource = `${source.slice(0, start)}${insertion}${source.slice(end)}`;
    if (!setMathElementSource(currentMathElement, nextSource)) {
      return false;
    }
    collapseInsideMathElementAtSourceOffset(currentMathElement, start + insertion.length);
    return true;
  }

  function isRootCodeBlockMode() {
    return element.getAttribute("data-ff-code-block-root") === "true";
  }

  function setRootCodeBlockMode(text = "") {
    element.setAttribute("data-ff-code-block-root", "true");
    element.textContent = String(text || "");
    if (!element.firstChild) {
      element.appendChild(document.createTextNode(""));
    }
    collapseToEnd(element);
  }

  function clearRootCodeBlockMode(text = "") {
    element.removeAttribute("data-ff-code-block-root");
    const safeText = String(text || "");
    if (!safeText) {
      element.innerHTML = "";
      return;
    }
    element.innerHTML = serializeCodeBlockPlainTextToHtml(safeText);
    collapseToEnd(element);
  }

  function isTaskListElement(node) {
    return (
      node instanceof HTMLElement &&
      (node.tagName === "UL" || node.tagName === "OL") &&
      node.getAttribute("data-ff-task-list") === "true"
    );
  }

  function isTaskListItemElement(node) {
    return node instanceof HTMLElement && node.tagName === "LI" && node.getAttribute("data-ff-task-item") === "true";
  }

  function isBlockquoteElement(node) {
    return node instanceof HTMLElement && node.tagName === "BLOCKQUOTE";
  }

  function isListContainer(node, tagName) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    const parentTag = node.parentElement?.tagName?.toLowerCase() || "";
    return node.tagName.toLowerCase() === "li" && parentTag === tagName;
  }

  function clearTaskListAttributes(list) {
    if (!(list instanceof HTMLElement)) {
      return;
    }
    list.removeAttribute("data-ff-task-list");
    list.querySelectorAll("li[data-ff-task-item]").forEach((item) => {
      if (!(item instanceof HTMLElement)) {
        return;
      }
      item.removeAttribute("data-ff-task-item");
      item.removeAttribute("data-ff-task-state");
    });
  }

  function markListAsTaskList(list) {
    if (!(list instanceof HTMLElement)) {
      return false;
    }
    list.setAttribute("data-ff-task-list", "true");
    list.querySelectorAll("li").forEach((item) => {
      if (!(item instanceof HTMLElement)) {
        return;
      }
      item.setAttribute("data-ff-task-item", "true");
      if (!item.getAttribute("data-ff-task-state")) {
        item.setAttribute("data-ff-task-state", "todo");
      }
    });
    return true;
  }

  function isInlineSelectionWrapper(node) {
    if (!(node instanceof HTMLElement) || node === element) {
      return false;
    }
    const tag = node.tagName.toLowerCase();
    if (["span", "mark", "strong", "b", "em", "i", "u", "s", "del", "a"].includes(tag)) {
      return true;
    }
    return Boolean(node.getAttribute("style") || node.getAttribute("data-ff-font-size") || node.getAttribute("data-ff-highlight"));
  }

  function getSelectionRangeText(range) {
    if (!(range instanceof Range)) {
      return "";
    }
    return String(range.toString?.() || "");
  }

  function isFullySelectedHeadingText(range) {
    if (!(range instanceof Range) || range.collapsed) {
      return false;
    }
    const heading = getUniformAncestor(range, isHeadingElement) || getClosestWithinSelection("h1, h2, h3, h4, h5, h6");
    if (!(heading instanceof HTMLElement)) {
      return false;
    }
    const selectedText = getSelectionRangeText(range).trim();
    const headingText = getNodeText(heading).trim();
    if (!selectedText || !headingText || selectedText !== headingText) {
      return false;
    }
    try {
      const headingRange = document.createRange();
      headingRange.selectNodeContents(heading);
      const startsInside = headingRange.compareBoundaryPoints(Range.START_TO_START, range) <= 0;
      const endsInside = headingRange.compareBoundaryPoints(Range.END_TO_END, range) >= 0;
      return startsInside && endsInside;
    } catch {
      return true;
    }
  }

  function setSelectionRange(range) {
    const selection = document.getSelection?.();
    if (!selection || !(range instanceof Range)) {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    lastRange = range.cloneRange();
    return true;
  }

  function setSelectionAroundNodes(firstNode, lastNode) {
    const selection = document.getSelection?.();
    if (!selection || !(firstNode instanceof Node) || !(lastNode instanceof Node)) {
      return false;
    }
    const range = document.createRange();
    range.setStartBefore(firstNode);
    range.setEndAfter(lastNode);
    return setSelectionRange(range);
  }

  function unwrapNode(node) {
    const parent = node?.parentNode;
    if (!(parent instanceof Node)) {
      return;
    }
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
  }

  function getInlineWrapperChain(node) {
    const chain = [];
    let current = resolveElement(node);
    while (current && current !== element) {
      if (isInlineSelectionWrapper(current)) {
        chain.push(current);
      }
      current = current.parentElement;
    }
    return chain.reverse();
  }

  function getSelectionWrapperChain(range) {
    if (!(range instanceof Range)) {
      return [];
    }
    const startChain = getInlineWrapperChain(range.startContainer);
    const endChain = getInlineWrapperChain(range.endContainer);
    const shared = [];
    const limit = Math.min(startChain.length, endChain.length);
    for (let index = 0; index < limit; index += 1) {
      if (startChain[index] !== endChain[index]) {
        break;
      }
      shared.push(startChain[index]);
    }
    return shared;
  }

  function rangeIntersectsTextNode(range, node) {
    if (!(range instanceof Range) || !(node instanceof Text) || !element.contains(node)) {
      return false;
    }
    if (!String(node.nodeValue || "").trim()) {
      return false;
    }
    try {
      return range.intersectsNode(node);
    } catch {
      return false;
    }
  }

  function getSelectedTextNodes(range) {
    if (!(range instanceof Range) || range.collapsed) {
      return [];
    }
    const root = range.commonAncestorContainer instanceof Node ? range.commonAncestorContainer : element;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof Text && rangeIntersectsTextNode(range, node)) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  function isSelectionFullyMatched(range, predicate) {
    if (!(range instanceof Range) || typeof predicate !== "function") {
      return false;
    }
    if (range.collapsed) {
      return Boolean(getUniformAncestor(range, predicate));
    }
    const textNodes = getSelectedTextNodes(range);
    if (textNodes.length) {
      return textNodes.every((node) => Boolean(findAncestor(node, predicate)));
    }
    const startMatch = findAncestor(range.startContainer, predicate);
    const endMatch = findAncestor(range.endContainer, predicate);
    return Boolean(startMatch && endMatch);
  }

  function getComputedFontSize(node) {
    const elementNode = resolveElement(node);
    if (!(elementNode instanceof HTMLElement) || typeof window?.getComputedStyle !== "function") {
      return 0;
    }
    const parsed = Number.parseFloat(window.getComputedStyle(elementNode).fontSize || "");
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }

  function getRangeFontSize(range) {
    if (!(range instanceof Range)) {
      return 0;
    }
    if (range.collapsed) {
      return getComputedFontSize(range.startContainer);
    }
    const textNodes = getSelectedTextNodes(range);
    if (textNodes.length) {
      let resolvedSize = 0;
      for (const node of textNodes) {
        const nextSize = getComputedFontSize(node);
        if (!nextSize) {
          continue;
        }
        if (!resolvedSize) {
          resolvedSize = nextSize;
          continue;
        }
        if (resolvedSize !== nextSize) {
          return nextSize;
        }
      }
      if (resolvedSize) {
        return resolvedSize;
      }
    }
    return getComputedFontSize(range.startContainer) || getComputedFontSize(range.commonAncestorContainer);
  }

  function normalizeColorForCompare(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function getComputedTextColor(node) {
    const elementNode = resolveElement(node);
    if (!(elementNode instanceof HTMLElement) || typeof window?.getComputedStyle !== "function") {
      return "";
    }
    return String(window.getComputedStyle(elementNode).color || "").trim();
  }

  function getRangeColor(range) {
    const fallbackColor = getComputedTextColor(element);
    if (!(range instanceof Range)) {
      return fallbackColor;
    }
    if (range.collapsed) {
      return getComputedTextColor(range.startContainer) || fallbackColor;
    }
    const textNodes = getSelectedTextNodes(range);
    if (textNodes.length) {
      let resolvedColor = "";
      let resolvedColorKey = "";
      for (const node of textNodes) {
        const nextColor = getComputedTextColor(node) || fallbackColor;
        const nextColorKey = normalizeColorForCompare(nextColor);
        if (!resolvedColorKey) {
          resolvedColor = nextColor;
          resolvedColorKey = nextColorKey;
          continue;
        }
        if (nextColorKey !== resolvedColorKey) {
          return "";
        }
      }
      return resolvedColor || fallbackColor;
    }
    const startColor = getComputedTextColor(range.startContainer) || fallbackColor;
    const endColor = getComputedTextColor(range.endContainer) || fallbackColor;
    if (!normalizeColorForCompare(startColor)) {
      return endColor;
    }
    if (!normalizeColorForCompare(endColor)) {
      return startColor;
    }
    return normalizeColorForCompare(startColor) === normalizeColorForCompare(endColor) ? startColor : "";
  }

  function stripHighlightMarkup(root) {
    if (!(root instanceof Node)) {
      return;
    }
    const candidates = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof HTMLElement && (isCanonicalHighlightElement(node) || node.tagName === "MARK")) {
        candidates.push(node);
      }
    }
    candidates.reverse().forEach((node) => {
      const parent = node.parentNode;
      if (!parent) {
        return;
      }
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    });
  }

  function getHighlightStateFromRange(range) {
    if (!(range instanceof Range)) {
      return { highlight: false, highlightColor: "" };
    }
    if (range.collapsed) {
      const highlightElement =
        findAncestor(range.startContainer, isCanonicalHighlightElement) || findAncestor(range.startContainer, isHighlightElement);
      if (!highlightElement) {
        return { highlight: false, highlightColor: "" };
      }
      return {
        highlight: true,
        highlightColor: getHighlightColor(highlightElement),
      };
    }
    const textNodes = getSelectedTextNodes(range);
    if (!textNodes.length) {
      const fallbackHighlight = getUniformAncestor(range, isCanonicalHighlightElement) || getUniformAncestor(range, isHighlightElement);
      if (!fallbackHighlight) {
        return { highlight: false, highlightColor: "" };
      }
      return {
        highlight: true,
        highlightColor: getHighlightColor(fallbackHighlight),
      };
    }
    let resolvedColor = "";
    for (const node of textNodes) {
      const highlightElement = findAncestor(node, isCanonicalHighlightElement) || findAncestor(node, isHighlightElement);
      if (!highlightElement) {
        return { highlight: false, highlightColor: "" };
      }
      const color = getHighlightColor(highlightElement);
      if (!resolvedColor) {
        resolvedColor = color;
      } else if (color && resolvedColor && color !== resolvedColor) {
        return { highlight: false, highlightColor: "" };
      }
    }
    return {
      highlight: true,
      highlightColor: resolvedColor,
    };
  }

  function selectionInside() {
    const selection = document.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    return (anchorNode && element.contains(anchorNode)) || (focusNode && element.contains(focusNode));
  }

  function storeSelection() {
    const selection = document.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    if (!selectionInside()) {
      return;
    }
    lastRange = selection.getRangeAt(0).cloneRange();
  }

  function selectAll() {
    const selection = document.getSelection?.();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    setSelectionRange(range);
  }

  function ensureSelection({ selectAllWhenCollapsed = true, selectAllWhenMissing = true, restoreStoredRange = true } = {}) {
    const selection = document.getSelection?.();
    let range = null;
    if (selection && selection.rangeCount > 0 && selectionInside()) {
      range = selection.getRangeAt(0);
    } else if (restoreStoredRange && lastRange) {
      range = lastRange.cloneRange();
      setSelectionRange(range.cloneRange());
    }
    if (!(range instanceof Range)) {
      if (selectAllWhenMissing) {
        selectAll();
        return true;
      }
      return false;
    }
    if (range.collapsed && selectAllWhenCollapsed) {
      selectAll();
      return true;
    }
    return true;
  }

  function restoreSelection() {
    const selection = document.getSelection?.();
    if (!selection || !lastRange) {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(lastRange);
  }

  function getSelectionRange({ includeStored = true } = {}) {
    const selection = document.getSelection?.();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (selectionInside()) {
        return range;
      }
    }
    if (includeStored && lastRange) {
      return lastRange.cloneRange();
    }
    return null;
  }

  function getSelectionSnapshot() {
    const range = getSelectionRange();
    if (!range) {
      return {
        inside: false,
        collapsed: true,
        text: "",
        rect: null,
      };
    }
    const rects = Array.from(range.getClientRects?.() || []).filter(
      (rect) => rect && Number.isFinite(rect.width) && Number.isFinite(rect.height) && (rect.width > 0 || rect.height > 0)
    );
    let rect = null;
    if (rects.length) {
      const left = Math.min(...rects.map((entry) => entry.left));
      const top = Math.min(...rects.map((entry) => entry.top));
      const right = Math.max(...rects.map((entry) => entry.right));
      const bottom = Math.max(...rects.map((entry) => entry.bottom));
      rect = {
        left,
        top,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    } else {
      const fallback = range.getBoundingClientRect?.();
      if (fallback && Number.isFinite(fallback.left) && Number.isFinite(fallback.top)) {
        rect = {
          left: fallback.left,
          top: fallback.top,
          right: fallback.right,
          bottom: fallback.bottom,
          width: fallback.width,
          height: fallback.height,
        };
      }
    }
    return {
      inside: true,
      collapsed: Boolean(range.collapsed),
      text: String(range.toString?.() || ""),
      rect,
    };
  }

  function wrapSelection(tagName, attrs) {
    const range = getSelectionRange();
    if (!range || range.collapsed) {
      return false;
    }
    const wrapper = document.createElement(tagName);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        wrapper.setAttribute(key, value);
      });
    }
    const content = range.extractContents();
    wrapper.appendChild(content);
    range.insertNode(wrapper);
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    return setSelectionRange(newRange);
  }

  function getSelectionContainerNode() {
    const range = getSelectionRange();
    if (!range) {
      return null;
    }
    let node = range.commonAncestorContainer;
    if (node?.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }
    return node instanceof Node ? node : null;
  }

  function getClosestWithinSelection(selector) {
    const node = getSelectionContainerNode();
    if (!(node instanceof Element)) {
      return node?.parentElement?.closest?.(selector) || null;
    }
    return node.closest(selector);
  }

  function getCurrentBlock() {
    return getClosestWithinSelection("li, div, p, section, article, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th") || element;
  }

  function getSelectionEdgeBlock({ preferEnd = true } = {}) {
    const range = getSelectionRange();
    if (!(range instanceof Range)) {
      return getCurrentBlock();
    }
    const edgeNode = preferEnd ? range.endContainer : range.startContainer;
    const edgeElement = resolveElement(edgeNode);
    return (
      edgeElement?.closest?.("li, div, p, section, article, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th") ||
      getCurrentBlock()
    );
  }

  function createParagraphBlockFromText(text = "") {
    const block = document.createElement("div");
    block.textContent = text;
    return block;
  }

  function replaceNodeWithBlock(node, nextBlock) {
    if (!(node instanceof Node) || !(nextBlock instanceof HTMLElement)) {
      return false;
    }
    node.replaceWith(nextBlock);
    collapseToEnd(nextBlock.tagName === "PRE" ? nextBlock.querySelector("code") || nextBlock : nextBlock);
    return true;
  }

  function replaceCurrentBlockWithTag(tagName = "div") {
    const currentBlock = getCurrentBlock();
    if (!(currentBlock instanceof HTMLElement)) {
      return false;
    }
    if (currentBlock === element) {
      return applyFormatBlock(tagName);
    }
    if (currentBlock.tagName.toLowerCase() === String(tagName || "div").toLowerCase()) {
      return true;
    }
    const nextBlock = document.createElement(tagName);
    nextBlock.innerHTML = currentBlock.innerHTML || "<br>";
    return replaceNodeWithBlock(currentBlock, nextBlock);
  }

  function replaceCurrentBlockWithParagraph() {
    const codeBlock = getClosestWithinSelection('[data-ff-code-block="true"], pre');
    if (codeBlock instanceof HTMLElement) {
      return replaceNodeWithBlock(codeBlock, createParagraphBlockFromText(getNodeText(codeBlock)));
    }
    const blockquote = getClosestWithinSelection("blockquote");
    if (blockquote instanceof HTMLElement) {
      const block = document.createElement("div");
      block.innerHTML = blockquote.innerHTML || "<br>";
      return replaceNodeWithBlock(blockquote, block);
    }
    return replaceCurrentBlockWithTag("div");
  }

  function setBlockType(blockType = "paragraph") {
    const normalized = String(blockType || "paragraph").trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized === "paragraph") {
      return replaceCurrentBlockWithParagraph();
    }
    if (/^heading-[1-6]$/.test(normalized)) {
      return replaceCurrentBlockWithTag(`h${normalized.slice(-1)}`);
    }
    if (normalized === "blockquote") {
      return replaceCurrentBlockWithTag("blockquote");
    }
    if (normalized === "code-block") {
      return toggleCodeBlock();
    }
    return false;
  }

  function selectNodeContents(node) {
    const selection = document.getSelection?.();
    if (!selection || !(node instanceof Node)) {
      return null;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    setSelectionRange(range);
    return range;
  }

  function setCollapsedSelection(node, offset = 0) {
    if (!(node instanceof Node)) {
      return false;
    }
    const range = document.createRange();
    range.setStart(node, Math.max(0, Number(offset) || 0));
    range.collapse(true);
    return setSelectionRange(range);
  }

  function collapseToEnd(node) {
    const selection = document.getSelection?.();
    if (!selection || !(node instanceof Node)) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    setSelectionRange(range);
  }

  function collapseInsideMathElement(mathElement) {
    if (!(mathElement instanceof HTMLElement)) {
      return false;
    }
    const type = getMathElementType(mathElement);
    const source = getMathElementSource(mathElement);
    const walker = document.createTreeWalker(mathElement, NodeFilter.SHOW_TEXT);
    let lastTextNode = null;
    while (walker.nextNode()) {
      lastTextNode = walker.currentNode;
    }
    if (lastTextNode instanceof Text) {
      const editingText = formatMathForEditing(source, type);
      if (editingText && lastTextNode.data === editingText) {
        const caretOffset =
          normalizeMathElementType(type) === "block" ? Math.max(0, 3 + source.length) : Math.max(0, 1 + source.length);
        return setCollapsedSelection(lastTextNode, Math.min(caretOffset, lastTextNode.data.length));
      }
      return setCollapsedSelection(lastTextNode, lastTextNode.data.length);
    }
    collapseToEnd(mathElement);
    return true;
  }

  function getCurrentMathElement() {
    const range = getSelectionRange();
    if (!range) {
      return null;
    }
    return getUniformAncestor(range, isMathElement);
  }

  function getActiveCodeBlock() {
    const range = getSelectionRange();
    if (!range) {
      return null;
    }
    return findAncestor(
      range.startContainer,
      (node) =>
        node instanceof HTMLElement &&
        node.getAttribute("data-ff-code-block") === "true"
    );
  }

  function ensureCodeBlockEditableTextNode(codeBlock) {
    if (!(codeBlock instanceof HTMLElement)) {
      return null;
    }
    if (
      codeBlock.childNodes.length === 1 &&
      codeBlock.firstChild instanceof HTMLBRElement
    ) {
      codeBlock.textContent = "";
    }
    if (!codeBlock.firstChild) {
      const textNode = document.createTextNode("");
      codeBlock.appendChild(textNode);
      return textNode;
    }
    if (codeBlock.lastChild instanceof Text) {
      return codeBlock.lastChild;
    }
    return null;
  }

  function collapseToCodeBlockEnd(codeBlock) {
    if (!(codeBlock instanceof HTMLElement)) {
      return false;
    }
    const textNode = ensureCodeBlockEditableTextNode(codeBlock);
    if (textNode instanceof Text) {
      return setCollapsedSelection(textNode, textNode.data.length);
    }
    collapseToEnd(codeBlock);
    return true;
  }

  function insertPlainText(text = "") {
    const range = getSelectionRange();
    if (!(range instanceof Range)) {
      return false;
    }
    const content = String(text || "");
    range.deleteContents();
    const textNode = document.createTextNode(content);
    range.insertNode(textNode);
    const nextRange = document.createRange();
    nextRange.setStart(textNode, textNode.data.length);
    nextRange.collapse(true);
    setSelectionRange(nextRange);
    textNode.parentNode?.normalize?.();
    return true;
  }

  function createCodeBlockFragmentFromPlainText(text = "") {
    const fragment = document.createDocumentFragment();
    const parts = String(text || "").split("\n");
    parts.forEach((part, index) => {
      if (index > 0) {
        fragment.appendChild(document.createElement("br"));
      }
      if (part) {
        fragment.appendChild(document.createTextNode(part));
        return;
      }
      if (index > 0 && index === parts.length - 1) {
        fragment.appendChild(document.createTextNode(""));
      }
    });
    return fragment;
  }

  function insertCodeBlockText(text = "") {
    const codeBlock = getActiveCodeBlock();
    if (!(codeBlock instanceof HTMLElement)) {
      return false;
    }
    ensureCodeBlockEditableTextNode(codeBlock);
    const range = getSelectionRange();
    if (!(range instanceof Range)) {
      return false;
    }
    const fragment = createCodeBlockFragmentFromPlainText(text);
    const lastChild = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);
    const nextRange = document.createRange();
    if (lastChild instanceof Text) {
      nextRange.setStart(lastChild, lastChild.data.length);
    } else if (lastChild instanceof Node) {
      nextRange.setStartAfter(lastChild);
    } else {
      collapseToCodeBlockEnd(codeBlock);
      return true;
    }
    nextRange.collapse(true);
    setSelectionRange(nextRange);
    return true;
  }

  function normalizeEditableCodeBlocks(root) {
    if (!(root instanceof HTMLElement)) {
      return;
    }
    root.querySelectorAll("pre, pre > code:only-child").forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const pre = node.tagName === "PRE" ? node : node.parentElement;
      if (!(pre instanceof HTMLElement) || pre.getAttribute("data-ff-code-block") === "normalized") {
        return;
      }
      const block = document.createElement("div");
      block.setAttribute("data-ff-code-block", "true");
      pre.setAttribute("data-ff-code-block", "normalized");
      while (pre.firstChild) {
        const child = pre.firstChild;
        if (child instanceof HTMLElement && child.tagName === "CODE") {
          while (child.firstChild) {
            block.appendChild(child.firstChild);
          }
          child.remove();
          continue;
        }
        block.appendChild(child);
      }
      pre.replaceWith(block);
      ensureCodeBlockEditableTextNode(block);
    });
  }

  function normalizeEditableMathNodes(root) {
    if (!(root instanceof HTMLElement)) {
      return;
    }
    normalizeFragmentedMathNodes(root);
    root.querySelectorAll('[data-role="math-inline"], [data-role="math-block"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const source = getMathElementSource(node);
      if (!source) {
        return;
      }
      node.textContent = formatMathForEditing(source, getMathElementType(node));
    });
  }

  function normalizeFragmentedMathNodes(root) {
    if (!(root instanceof HTMLElement)) {
      return;
    }
    const mathNodes = Array.from(root.querySelectorAll('[data-role="math-inline"]'));
    mathNodes.forEach((node) => {
      if (!(node instanceof HTMLElement) || node.parentElement == null) {
        return;
      }
      const leftText = getNodeText(node);
      if (!leftText.startsWith("$") || leftText.endsWith("$")) {
        return;
      }
      const fragments = [node];
      let middleText = "";
      let cursor = node.nextSibling;
      while (cursor) {
        if (cursor instanceof Text) {
          middleText += cursor.data || "";
          fragments.push(cursor);
          cursor = cursor.nextSibling;
          continue;
        }
        if (cursor instanceof HTMLElement) {
          const role = String(cursor.getAttribute("data-role") || "").trim().toLowerCase();
          if (role === "math-inline") {
            const rightText = getNodeText(cursor);
            if (!rightText.endsWith("$")) {
              return;
            }
            const mergedRaw = `${leftText}${middleText}${rightText}`;
            const mergedSource = stripMathEditingDelimiters(mergedRaw, "inline");
            if (!mergedSource) {
              return;
            }
            node.textContent = formatMathForEditing(mergedSource, "inline");
            fragments.slice(1).forEach((fragment) => fragment.remove?.());
            return;
          }
          if (role === "math-block" || /^(div|p|br|blockquote|ul|ol|li|pre|table)$/i.test(cursor.tagName)) {
            return;
          }
          middleText += getNodeText(cursor);
          fragments.push(cursor);
          cursor = cursor.nextSibling;
          continue;
        }
        return;
      }
    });
  }

  function serializeEditableCodeBlocks(root) {
    if (!(root instanceof HTMLElement)) {
      return "";
    }
    const clone = root.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return root.innerHTML || "";
    }
    clone.querySelectorAll('[data-ff-code-block="true"]').forEach((block) => {
      if (!(block instanceof HTMLElement)) {
        return;
      }
      const pre = document.createElement("pre");
      pre.setAttribute("data-ff-code-block", "true");
      const code = document.createElement("code");
      while (block.firstChild) {
        code.appendChild(block.firstChild);
      }
      pre.appendChild(code);
      block.replaceWith(pre);
    });
    return clone.innerHTML || "";
  }

  function serializeEditableMathNodes(root) {
    if (!(root instanceof HTMLElement)) {
      return "";
    }
    const clone = root.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      return root.innerHTML || "";
    }
    clone.querySelectorAll('[data-role="math-inline"], [data-role="math-block"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const source = getMathElementSource(node);
      node.textContent = source;
    });
    collapseSerializedMathDuplicates(clone);
    return clone.innerHTML || "";
  }

  function collapseSerializedMathDuplicates(root) {
    if (!(root instanceof HTMLElement)) {
      return;
    }
    const mathNodes = Array.from(root.querySelectorAll('[data-role="math-inline"]'));
    mathNodes.forEach((node) => {
      if (!(node instanceof HTMLElement) || node.parentNode == null) {
        return;
      }
      const source = getNodeText(node);
      if (!source) {
        return;
      }
      let cursor = node.nextSibling;
      const duplicateFragments = [];
      let duplicateText = "";
      while (cursor) {
        if (cursor instanceof Text) {
          duplicateText += cursor.data || "";
          duplicateFragments.push(cursor);
          cursor = cursor.nextSibling;
          continue;
        }
        if (cursor instanceof HTMLElement) {
          const role = String(cursor.getAttribute("data-role") || "").trim().toLowerCase();
          if (role === "math-inline") {
            const trailingSource = getNodeText(cursor);
            if (duplicateText === source && !trailingSource) {
              duplicateFragments.forEach((fragment) => fragment.remove?.());
              cursor.remove();
            }
            return;
          }
          if (/^(div|p|br|blockquote|ul|ol|li|pre|table)$/i.test(cursor.tagName)) {
            return;
          }
          duplicateText += getNodeText(cursor);
          duplicateFragments.push(cursor);
          cursor = cursor.nextSibling;
          continue;
        }
        return;
      }
    });
  }

  function replaceCurrentBlockText(text = "") {
    const block = getCurrentBlock();
    if (!(block instanceof HTMLElement)) {
      return false;
    }
    block.textContent = text;
    collapseToEnd(block);
    return true;
  }

  function insertParagraphAfterNode(node) {
    if (!(node instanceof HTMLElement) || !node.parentNode) {
      return false;
    }
    const nextBlock = document.createElement("div");
    nextBlock.innerHTML = "<br>";
    if (node.nextSibling) {
      node.parentNode.insertBefore(nextBlock, node.nextSibling);
    } else {
      node.parentNode.appendChild(nextBlock);
    }
    selectNodeContents(nextBlock);
    collapseToEnd(nextBlock);
    return true;
  }

  function replaceCurrentBlockWithList({ ordered = false, task = false } = {}) {
    const currentBlock = getCurrentBlock();
    if (!(currentBlock instanceof HTMLElement)) {
      return false;
    }
    const list = document.createElement(ordered ? "ol" : "ul");
    if (task) {
      list.setAttribute("data-ff-task-list", "true");
    }
    const item = document.createElement("li");
    if (task) {
      item.setAttribute("data-ff-task-item", "true");
      item.setAttribute("data-ff-task-state", "todo");
    }
    item.appendChild(document.createElement("br"));
    list.appendChild(item);
    if (currentBlock === element) {
      element.innerHTML = "";
      element.appendChild(list);
    } else {
      currentBlock.replaceWith(list);
    }
    selectNodeContents(item);
    collapseToEnd(item);
    return true;
  }

  function convertCurrentBlockToTaskListItem() {
    const currentBlock = getSelectionEdgeBlock({ preferEnd: true });
    if (!(currentBlock instanceof HTMLElement)) {
      return false;
    }
    const list = document.createElement("ul");
    list.setAttribute("data-ff-task-list", "true");
    const item = document.createElement("li");
    item.setAttribute("data-ff-task-item", "true");
    item.setAttribute("data-ff-task-state", "todo");
    if (currentBlock === element) {
      while (element.firstChild) {
        item.appendChild(element.firstChild);
      }
      if (!item.firstChild) {
        item.appendChild(document.createElement("br"));
      }
      list.appendChild(item);
      element.appendChild(list);
      selectNodeContents(item);
      collapseToEnd(item);
      return true;
    }
    while (currentBlock.firstChild) {
      item.appendChild(currentBlock.firstChild);
    }
    if (!item.firstChild) {
      item.appendChild(document.createElement("br"));
    }
    list.appendChild(item);
    currentBlock.replaceWith(list);
    selectNodeContents(item);
    collapseToEnd(item);
    return true;
  }

  function toggleInlineCode() {
    const range = getSelectionRange();
    if (!range || range.collapsed) {
      return false;
    }
    const existing = getUniformAncestor(range, isInlineCodeElement);
    if (existing instanceof HTMLElement) {
      unwrapNode(existing);
      const refreshedRange = getSelectionRange({ includeStored: false });
      if (refreshedRange) {
        setSelectionRange(refreshedRange);
      }
      return true;
    }
    const currentBlock = getCurrentBlock();
    const selectionText = getSelectionRangeText(range).trim();
    const blockText = getNodeText(currentBlock).trim();
    if (currentBlock instanceof HTMLElement && selectionText && selectionText === blockText) {
      currentBlock.innerHTML = `<code data-ff-inline-code="true">${escapeHtml(selectionText)}</code>`;
      selectNodeContents(currentBlock);
      return true;
    }
    return wrapSelection("code", { "data-ff-inline-code": "true" });
  }

  function toggleCodeBlock() {
    if (isRootCodeBlockMode()) {
      clearRootCodeBlockMode(getText());
      return true;
    }
    const currentBlock = getCurrentBlock();
    if (!(currentBlock instanceof HTMLElement)) {
      return false;
    }
    const currentText = getNodeText(currentBlock);
    setRootCodeBlockMode(currentText);
    return true;
  }

  function findCurrentUnorderedList() {
    const fromSelection = getClosestWithinSelection("ul");
    if (fromSelection instanceof HTMLElement) {
      return fromSelection;
    }
    const currentBlock = getCurrentBlock();
    const fromBlock = currentBlock?.closest?.("ul");
    if (fromBlock instanceof HTMLElement) {
      return fromBlock;
    }
    const lists = element.querySelectorAll("ul");
    return lists.length ? lists[lists.length - 1] : null;
  }

  function toggleTaskList() {
    focus();
    restoreSelection();
    const currentBlock = getSelectionEdgeBlock({ preferEnd: true });
    if (!(currentBlock instanceof HTMLElement)) {
      return false;
    }
    const currentItem = currentBlock.closest("li");
    if (currentItem instanceof HTMLElement) {
      const parentList = currentItem.parentElement;
      if (parentList instanceof HTMLUListElement || parentList instanceof HTMLOListElement) {
        const itemIsTask = currentItem.getAttribute("data-ff-task-item") === "true";
        if (itemIsTask) {
          currentItem.removeAttribute("data-ff-task-item");
          currentItem.removeAttribute("data-ff-task-state");
          if (!parentList.querySelector("li[data-ff-task-item='true']")) {
            parentList.removeAttribute("data-ff-task-list");
          }
          collapseToEnd(currentItem);
          return true;
        }
        parentList.setAttribute("data-ff-task-list", "true");
        currentItem.setAttribute("data-ff-task-item", "true");
        if (!currentItem.getAttribute("data-ff-task-state")) {
          currentItem.setAttribute("data-ff-task-state", "todo");
        }
        collapseToEnd(currentItem);
        return true;
      }
    }
    return convertCurrentBlockToTaskListItem();
  }

  function insertHorizontalRule() {
    focus();
    restoreSelection();
    const currentBlock = getSelectionEdgeBlock({ preferEnd: true });
    if (!(currentBlock instanceof HTMLElement)) {
      return false;
    }
    const hr = document.createElement("hr");
    hr.setAttribute("data-ff-divider", "true");
    const nextBlock = document.createElement("div");
    nextBlock.innerHTML = "<br>";
    if (currentBlock === element) {
      element.appendChild(hr);
      element.appendChild(nextBlock);
      selectNodeContents(nextBlock);
      collapseToEnd(nextBlock);
      return true;
    }
    const anchor =
      currentBlock.tagName === "LI" && currentBlock.parentElement instanceof HTMLElement
        ? currentBlock.parentElement
        : currentBlock;
    const parent = anchor.parentNode;
    if (!(parent instanceof Node)) {
      return false;
    }
    if (anchor.nextSibling) {
      parent.insertBefore(hr, anchor.nextSibling);
      parent.insertBefore(nextBlock, hr.nextSibling);
    } else {
      parent.appendChild(hr);
      parent.appendChild(nextBlock);
    }
    selectNodeContents(nextBlock);
    collapseToEnd(nextBlock);
    return true;
  }

  function insertTable({ rows = 3, columns = 3 } = {}) {
    const rowCount = Math.max(2, Number(rows) || 3);
    const columnCount = Math.max(2, Number(columns) || 3);
    const thead = `<thead><tr>${Array.from({ length: columnCount }, (_, index) => `<th>列${index + 1}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${Array.from({ length: rowCount - 1 }, (_, rowIndex) => `<tr>${Array.from({ length: columnCount }, (_, columnIndex) => `<td>单元格${rowIndex + 1}-${columnIndex + 1}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return insertHtml(`<table data-ff-md-table="true">${thead}${tbody}</table><div><br></div>`);
  }

  function applyAlignment(value = "left") {
    const commandName =
      value === "center" ? "justifyCenter" : value === "right" ? "justifyRight" : "justifyLeft";
    return exec(commandName);
  }

  function applyFormatBlock(tagName = "div") {
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
    const value = `<${String(tagName || "div").toLowerCase()}>`;
    if (exec("formatBlock", value) || exec("heading", value)) {
      return true;
    }
    return false;
  }

  function removeLeadingIndent() {
    const range = getSelectionRange();
    if (!range) {
      return false;
    }
    let node = range.startContainer;
    if (node?.nodeType !== Node.TEXT_NODE) {
      node = node?.childNodes?.[Math.max(0, range.startOffset - 1)] || node?.firstChild || node;
    }
    if (!(node instanceof Text)) {
      return false;
    }
    const value = node.nodeValue || "";
    const before = value.slice(0, range.startOffset);
    if (!before.endsWith("    ") && !before.endsWith("\u00a0\u00a0\u00a0\u00a0")) {
      return false;
    }
    node.nodeValue = `${before.slice(0, -4)}${value.slice(range.startOffset)}`;
    const nextRange = document.createRange();
    const nextOffset = Math.max(0, range.startOffset - 4);
    nextRange.setStart(node, nextOffset);
    nextRange.collapse(true);
    setSelectionRange(nextRange);
    return true;
  }

  function handleMarkdownShortcut() {
    const block = getCurrentBlock();
    if (!(block instanceof HTMLElement)) {
      return false;
    }
    const rawText = getNodeText(block).trim();
    const trigger = rawText.replace(/\s+$/, "");
    if (trigger === "#") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("heading-1");
      return true;
    }
    if (trigger === "##") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("heading-2");
      return true;
    }
    if (trigger === "###") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("heading-3");
      return true;
    }
    if (trigger === "####") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("heading-4");
      return true;
    }
    if (trigger === "#####") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("heading-5");
      return true;
    }
    if (trigger === "######") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("heading-6");
      return true;
    }
    if (trigger === ">") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("blockquote");
      return true;
    }
    if (trigger === "-" || trigger === "*") {
      block.textContent = "";
      selectNodeContents(block);
      replaceCurrentBlockWithList({ ordered: false, task: false });
      return true;
    }
    if (/^\d+\.$/.test(trigger)) {
      block.textContent = "";
      selectNodeContents(block);
      replaceCurrentBlockWithList({ ordered: true, task: false });
      return true;
    }
    if (/^(?:-|\*)\s+\[[ xX]\]$/.test(trigger)) {
      block.textContent = "";
      selectNodeContents(block);
      replaceCurrentBlockWithList({ ordered: false, task: true });
      return true;
    }
    if (trigger === "```") {
      block.textContent = "";
      selectNodeContents(block);
      setBlockType("code-block");
      return true;
    }
    return false;
  }

  function setContent(html = "", textFallback = "") {
    const safeHtml = normalizeRichHtmlInlineFontSizes(html || "", normalizeRichFontSize(element.style.fontSize, 16));
    const trimmedHtml = safeHtml.trim();
    if (/^<pre[\s>]/i.test(trimmedHtml) && /^<pre[\s\S]*<\/pre>$/i.test(trimmedHtml)) {
      element.setAttribute("data-ff-code-block-root", "true");
      element.textContent = htmlToPlainText(trimmedHtml);
      if (!element.firstChild) {
        element.appendChild(document.createTextNode(""));
      }
      return;
    }
    element.removeAttribute("data-ff-code-block-root");
    if (safeHtml.trim()) {
      element.innerHTML = safeHtml;
      normalizeEditableCodeBlocks(element);
      normalizeEditableMathNodes(element);
    } else {
      element.textContent = String(textFallback || "");
    }
  }

  function getHTML() {
    if (isRootCodeBlockMode()) {
      return `<pre data-ff-code-block="true"><code>${serializeCodeBlockPlainTextToHtml(getText())}</code></pre>`;
    }
    const htmlWithSerializedCodeBlocks = serializeEditableCodeBlocks(element);
    const container = document.createElement("div");
    container.innerHTML = htmlWithSerializedCodeBlocks;
    return serializeEditableMathNodes(container);
  }

  function getText() {
    return element.innerText || element.textContent || "";
  }

  function getSelectionHtml({ baseFontSize = 16 } = {}) {
    const range = getSelectionRange();
    if (!range) {
      return "";
    }
    const container = document.createElement("div");
    const fragment = range.cloneContents();
    const wrappers = getSelectionWrapperChain(range);
    if (wrappers.length) {
      const outer = wrappers[0].cloneNode(false);
      let cursor = outer;
      for (let index = 1; index < wrappers.length; index += 1) {
        const clone = wrappers[index].cloneNode(false);
        cursor.appendChild(clone);
        cursor = clone;
      }
      cursor.appendChild(fragment);
      container.appendChild(outer);
    } else {
      container.appendChild(fragment);
    }
    return normalizeRichHtmlInlineFontSizes(container.innerHTML || "", baseFontSize);
  }

  function getSelectionText() {
    const range = getSelectionRange();
    if (!range) {
      return "";
    }
    return getSelectionRangeText(range);
  }

  function insertHtml(html) {
    const content = String(html || "");
    if (!content) {
      return false;
    }
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
    const ok = exec("insertHTML", content);
    if (ok) {
      return true;
    }
    const range = getSelectionRange();
    if (!range) {
      return false;
    }
    const fragment = range.createContextualFragment(content);
    const lastChild = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);
    if (lastChild) {
      const nextRange = document.createRange();
      nextRange.setStartAfter(lastChild);
      nextRange.collapse(true);
      setSelectionRange(nextRange);
    }
    return true;
  }

  function insertMathInline(formula = "") {
    const source = stripMathEditingDelimiters(formula, "inline");
    if (!source) {
      return false;
    }
    return insertHtml(`<span data-role="math-inline">${escapeHtml(formatMathForEditing(source, "inline"))}</span>`);
  }

  function insertMathInlineTemplate() {
    const range = getSelectionRange();
    if (!(range instanceof Range)) {
      return false;
    }
    const content = '<span data-role="math-inline">$ $</span>';
    const fragment = range.createContextualFragment(content);
    const mathNode = fragment.firstChild;
    range.deleteContents();
    range.insertNode(fragment);
    if (mathNode instanceof HTMLElement && mathNode.firstChild instanceof Text) {
      return setCollapsedSelection(mathNode.firstChild, 1);
    }
    return mathNode instanceof HTMLElement ? collapseInsideMathElement(mathNode) : true;
  }

  function insertMathBlock(formula = "") {
    const source = stripMathEditingDelimiters(formula, "block");
    if (!source) {
      return false;
    }
    const range = getSelectionRange();
    if (!(range instanceof Range)) {
      return false;
    }
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    const block = document.createElement("div");
    block.setAttribute("data-role", "math-block");
    block.textContent = formatMathForEditing(source, "block");
    fragment.appendChild(block);
    const trailingParagraph = document.createElement("div");
    trailingParagraph.appendChild(document.createElement("br"));
    fragment.appendChild(trailingParagraph);
    range.insertNode(fragment);
    collapseToEnd(trailingParagraph);
    return true;
  }

  function insertMathBlockTemplate() {
    const range = getSelectionRange();
    if (!(range instanceof Range)) {
      return false;
    }
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    const block = document.createElement("div");
    block.setAttribute("data-role", "math-block");
    block.textContent = "$$\n\n$$";
    fragment.appendChild(block);
    const trailingParagraph = document.createElement("div");
    trailingParagraph.appendChild(document.createElement("br"));
    fragment.appendChild(trailingParagraph);
    range.insertNode(fragment);
    const textNode = block.firstChild;
    if (textNode instanceof Text) {
      setCollapsedSelection(textNode, Math.min(3, textNode.data.length));
      return true;
    }
    collapseInsideMathElement(block);
    return true;
  }

  function updateCurrentMath(formula = "") {
    const currentMathElement = getCurrentMathElement();
    if (!(currentMathElement instanceof HTMLElement)) {
      return false;
    }
    const source = stripMathEditingDelimiters(formula, getMathElementType(currentMathElement));
    if (!source) {
      return false;
    }
    if (!setMathElementSource(currentMathElement, source)) {
      return false;
    }
    collapseInsideMathElement(currentMathElement);
    return true;
  }

  function insertLineBreak() {
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
    if (exec("insertLineBreak")) {
      return true;
    }
    return insertHtml("<br>");
  }

  function focus() {
    element.focus();
  }

  function blur() {
    element.blur();
  }

  function deleteSelection() {
    focus();
    restoreSelection();
    if (!ensureSelection({ selectAllWhenCollapsed: false, selectAllWhenMissing: false })) {
      return false;
    }
    if (exec("delete")) {
      return true;
    }
    const range = getSelectionRange();
    if (!range) {
      return false;
    }
    range.deleteContents();
    setSelectionRange(range);
    return true;
  }

  function command(name, value) {
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false, selectAllWhenMissing: false });
    if (name === "unlink") {
      if (unlinkSelection()) {
        return true;
      }
      return exec("unlink");
    }
    if (name === "insertMathInline") {
      return insertMathInline(value);
    }
    if (name === "insertMathInlineTemplate") {
      return insertMathInlineTemplate();
    }
    if (name === "insertMathBlock") {
      return insertMathBlock(value);
    }
    if (name === "insertMathBlockTemplate") {
      return insertMathBlockTemplate();
    }
    if (name === "updateCurrentMath") {
      return updateCurrentMath(value);
    }
    if (name === "insertIntoCurrentMath") {
      return insertIntoCurrentMathElement(value);
    }
    if (name === "setBlockType") {
      return setBlockType(value);
    }
    if (name === "toggleInlineCode") {
      return toggleInlineCode();
    }
    if (name === "toggleTaskList") {
      return toggleTaskList();
    }
    if (name === "insertHorizontalRule") {
      return insertHorizontalRule();
    }
    if (name === "insertTable") {
      return insertTable(typeof value === "object" && value ? value : {});
    }
    if (name === "align") {
      return applyAlignment(value);
    }
    if (name === "formatBlock") {
      return applyFormatBlock(value);
    }
    if (name === "highlight") {
      const color = value || "#fff4a3";
      const range = getSelectionRange();
      if (!range || range.collapsed) {
        return false;
      }
      const currentHighlight = getHighlightStateFromRange(range);
      if (currentHighlight.highlight) {
        const targets = new Set();
        const textNodes = getSelectedTextNodes(range);
        textNodes.forEach((node) => {
          const target = findAncestor(node, isCanonicalHighlightElement) || findAncestor(node, (entry) => entry instanceof HTMLElement && entry.tagName === "MARK");
          if (target) {
            targets.add(target);
          }
        });
        if (!targets.size) {
          const fallbackTarget =
            findAncestor(range.startContainer, isCanonicalHighlightElement) ||
            findAncestor(range.startContainer, (entry) => entry instanceof HTMLElement && entry.tagName === "MARK");
          if (fallbackTarget) {
            targets.add(fallbackTarget);
          }
        }
        Array.from(targets).sort((left, right) => {
          if (left === right) {
            return 0;
          }
          return left.contains(right) ? -1 : 1;
        }).forEach((target) => {
          unwrapNode(target);
        });
        const refreshedRange = getSelectionRange({ includeStored: false });
        if (refreshedRange) {
          setSelectionRange(refreshedRange);
        }
        return true;
      }
      const ok = wrapSelection("span", {
        "data-ff-highlight": "true",
        "data-ff-highlight-color": color,
        style: `background-color: ${color};`,
      });
      if (ok) {
        return true;
      }
      return false;
    }
    if (name === "createLink") {
      const normalizedUrl = normalizeLinkInput(value);
      if (!normalizedUrl) {
        return false;
      }
      const range = getSelectionRange();
      if (!(range instanceof Range)) {
        return false;
      }
      const uniformLink = getUniformAncestor(range, isLinkElement);
      if (uniformLink instanceof HTMLAnchorElement) {
        applyAnchorAttrs(uniformLink, normalizedUrl);
        return true;
      }
      if (!range.collapsed) {
        const wrapped = wrapSelection("a", {
          href: normalizedUrl,
        });
        if (wrapped) {
          const nextLink = getUniformAncestor(getSelectionRange({ includeStored: false }) || range, isLinkElement);
          if (nextLink instanceof HTMLAnchorElement) {
            applyAnchorAttrs(nextLink, normalizedUrl);
          }
          return true;
        }
      }
      if (range?.collapsed) {
        const link = document.createElement("a");
        if (!applyAnchorAttrs(link, normalizedUrl)) {
          return false;
        }
        link.textContent = normalizedUrl;
        range.deleteContents();
        range.insertNode(link);
        const nextRange = document.createRange();
        nextRange.setStartAfter(link);
        nextRange.collapse(true);
        setSelectionRange(nextRange);
        return true;
      }
      return false;
    }
    if (name === "fontSize" && value) {
      if (typeof value === "object" && value !== null) {
        const logicalSize = normalizeRichFontSize(value.logicalSize, 16);
        const renderedSize = normalizeRichFontSize(value.renderedSize, logicalSize);
        wrapSelection("span", {
          "data-ff-font-size": String(logicalSize),
          style: `font-size: ${renderedSize}px;`,
        });
        return true;
      }
      const rawValue = String(value || "").trim().toLowerCase();
      if (rawValue.endsWith("em")) {
        wrapSelection("span", { style: `font-size: ${rawValue};` });
        return true;
      }
      const size = normalizeRichFontSize(value, 16);
      wrapSelection("span", { "data-ff-font-size": String(size), style: `font-size: ${size}px;` });
      return true;
    }
    const ok = exec(name, value);
    if (ok) {
      return true;
    }
    if (name === "bold") {
      return wrapSelection("strong");
    } else if (name === "italic") {
      return wrapSelection("em");
    } else if (name === "underline") {
      return wrapSelection("u");
    } else if (name === "strikeThrough") {
      return wrapSelection("s");
    } else if (name === "foreColor" && value) {
      return wrapSelection("span", { style: `color: ${value};` });
    }
    return false;
  }

  function clearInlineFontSizes() {
    const nodes = element.querySelectorAll("[style]");
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (!node.style.fontSize) {
        return;
      }
      node.style.fontSize = "";
      if (!node.getAttribute("style")) {
        node.removeAttribute("style");
      }
    });
  }

  function onKeyDown(event) {
    const inCodeBlock = Boolean(getActiveCodeBlock());
    const rootCodeBlock = isRootCodeBlockMode();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
      event.preventDefault();
      onCommit?.();
      return;
    }
    if (event.key === " " && !event.ctrlKey && !event.metaKey && !event.altKey && !inCodeBlock && !rootCodeBlock) {
      if (handleMarkdownShortcut()) {
        event.preventDefault();
      }
      return;
    }
    if (rootCodeBlock) {
      if (event.key === "Tab") {
        event.preventDefault();
        insertPlainText("    ");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
        return;
      }
      return;
    }
    if (inCodeBlock && event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      insertCodeBlockText("\n");
      return;
    }
    if (inCodeBlock && event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        removeLeadingIndent();
        return;
      }
      insertCodeBlockText("    ");
      return;
    }
    if (event.key === "Enter" && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      insertLineBreak();
      return;
    }
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      const inList = Boolean(getClosestWithinSelection("li"));
      if (inList) {
        return;
      }
      const currentBlock = getCurrentBlock();
      if (
        currentBlock instanceof HTMLElement &&
        (/^H[1-6]$/.test(currentBlock.tagName) || currentBlock.tagName === "BLOCKQUOTE")
      ) {
        event.preventDefault();
        insertParagraphAfterNode(currentBlock);
        return;
      }
      event.preventDefault();
      insertLineBreak();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const inList = Boolean(getClosestWithinSelection("li"));
      if (inList) {
        if (event.shiftKey) {
          command("outdent");
        } else {
          command("indent");
        }
        return;
      }
      if (event.shiftKey) {
        removeLeadingIndent();
        return;
      }
      insertHtml("&nbsp;&nbsp;&nbsp;&nbsp;");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        command("bold");
      } else if (key === "i") {
        event.preventDefault();
        command("italic");
      } else if (key === "u") {
        event.preventDefault();
        command("underline");
      } else if (key === "k") {
        event.preventDefault();
        if (typeof onRequestExternalLink === "function" && onRequestExternalLink() !== false) {
          return;
        }
        const url = window.prompt("输入链接");
        if (url === null) {
          return;
        }
        const raw = String(url || "").trim();
        const normalizedUrl = normalizeLinkInput(raw);
        if (normalizedUrl) {
          command("createLink", normalizedUrl);
        } else if (!raw) {
          exec("unlink");
        }
      }
    }
  }

  function onPaste(event) {
    if (element.getAttribute("data-ff-managed-paste") === "true") {
      return;
    }
    if (!event.clipboardData) {
      return;
    }
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (!html && !text) {
      return;
    }
    if (isRootCodeBlockMode()) {
      event.preventDefault();
      exec("insertText", text || htmlToPlainText(html || ""));
      return;
    }
    if (getActiveCodeBlock()) {
      event.preventDefault();
      insertCodeBlockText(text || htmlToPlainText(html || ""));
      return;
    }
    if (getCurrentMathElement()) {
      event.preventDefault();
      insertIntoCurrentMathElement(text || htmlToPlainText(html || ""));
      return;
    }
    event.preventDefault();
    if (html) {
      insertHtml(normalizeRichHtmlInlineFontSizes(html, normalizeRichFontSize(element.style.fontSize, 16)));
      return;
    }
    exec("insertText", text);
  }

  function getTaskItemFromEventTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const item = target.closest("li[data-ff-task-item='true']");
    if (!(item instanceof HTMLElement)) {
      return null;
    }
    return item;
  }

  function isTaskMarkerHotspot(event, item) {
    if (!(event instanceof MouseEvent) || !(item instanceof HTMLElement)) {
      return false;
    }
    const rect = item.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = window.getComputedStyle(item);
    const paddingStart = Number.parseFloat(style.paddingInlineStart || style.paddingLeft || "");
    const markerWidth = Number.isFinite(paddingStart) && paddingStart > 0 ? paddingStart : 22;
    const localX = event.clientX - rect.left;
    return localX >= -2 && localX <= Math.min(34, markerWidth + 8);
  }

  function toggleTaskItemState(item) {
    if (!(item instanceof HTMLElement)) {
      return false;
    }
    const current = String(item.getAttribute("data-ff-task-state") || "todo").trim().toLowerCase();
    item.setAttribute("data-ff-task-state", current === "done" ? "todo" : "done");
    return true;
  }

  function onMouseDown(event) {
    const item = getTaskItemFromEventTarget(event.target);
    if (!(item instanceof HTMLElement) || !isTaskMarkerHotspot(event, item)) {
      return;
    }
    event.preventDefault();
    focus();
    const range = document.createRange();
    range.selectNodeContents(item);
    range.collapse(true);
    setSelectionRange(range);
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.("a")) {
      return;
    }
    const item = getTaskItemFromEventTarget(target);
    if (!(item instanceof HTMLElement) || !isTaskMarkerHotspot(event, item)) {
      return;
    }
    event.preventDefault();
    if (toggleTaskItemState(item)) {
      storeSelection();
      onSelectionChangeExternal?.();
      onInput?.(event);
    }
  }

  function onInputEvent(event) {
    normalizeEditableCodeBlocks(element);
    onInput?.(event);
  }

  function onBlurEvent(event) {
    onBlur?.(event);
  }

  function onSelectionChange() {
    if (!selectionInside()) {
      return;
    }
    storeSelection();
    onSelectionChangeExternal?.();
  }

  element.addEventListener("keydown", onKeyDown);
  element.addEventListener("mousedown", onMouseDown);
  element.addEventListener("click", onClick);
  element.addEventListener("paste", onPaste);
  element.addEventListener("input", onInputEvent);
  element.addEventListener("blur", onBlurEvent);
  document.addEventListener("selectionchange", onSelectionChange);

  return {
    element,
    setContent,
    getHTML,
    getText,
    getSelectionHtml,
    getSelectionText,
    focus,
    blur,
    command,
    deleteSelection,
    selectAll,
    moveCaretToEnd() {
      focus();
      collapseToEnd(element);
      storeSelection();
    },
    captureSelection() {
      storeSelection();
    },
    setBaseFontSize(size, { normalize = false } = {}) {
      const next = normalizeRichFontSize(size, 16);
      element.style.fontSize = `${next}px`;
      if (normalize) {
        clearInlineFontSizes();
      }
    },
    getFormatState() {
      const range = getSelectionRange();
      const highlightState = range ? getHighlightStateFromRange(range) : { highlight: false, highlightColor: "" };
      const bold = Boolean(range && (isSelectionFullyMatched(range, isBoldElement) || isFullySelectedHeadingText(range)));
      const italic = Boolean(range && isSelectionFullyMatched(range, isItalicElement));
      const underline = Boolean(range && isSelectionFullyMatched(range, isUnderlineElement));
      const strike = Boolean(range && isSelectionFullyMatched(range, isStrikeElement));
      const inlineCode = Boolean(range && isSelectionFullyMatched(range, isInlineCodeElement));
      const linkElement = range ? getUniformAncestor(range, isLinkElement) : null;
      const currentLinkHref = String(linkElement?.getAttribute?.("href") || linkElement?.href || "").trim();
      const link = Boolean(linkElement && currentLinkHref);
      const unorderedList = Boolean(range && isSelectionFullyMatched(range, (node) => isListContainer(node, "ul")));
      const orderedList = Boolean(range && isSelectionFullyMatched(range, (node) => isListContainer(node, "ol")));
      const taskList = Boolean(range && isSelectionFullyMatched(range, isTaskListItemElement));
      const codeBlock = Boolean(range && getUniformAncestor(range, isCodeBlockElement));
      const blockquote = Boolean(range && isSelectionFullyMatched(range, isBlockquoteElement));
      const color = getRangeColor(range);
      let fontSize = getRangeFontSize(range);
      if (!fontSize && typeof window?.getComputedStyle === "function") {
        const parsed = Number.parseFloat(window.getComputedStyle(element).fontSize || "");
        if (Number.isFinite(parsed) && parsed > 0) {
          fontSize = Math.round(parsed);
        }
      }
      const blockElement =
        getClosestWithinSelection("pre, blockquote, table, h1, h2, h3, h4, h5, h6, p, div, section, article, li") || null;
      const block = blockElement?.tagName?.toLowerCase() || "";
      let blockType = "paragraph";
      if (codeBlock) {
        blockType = "code-block";
      } else if (blockquote) {
        blockType = "blockquote";
      } else if (taskList) {
        blockType = "task-list";
      } else if (orderedList) {
        blockType = "ordered-list";
      } else if (unorderedList) {
        blockType = "unordered-list";
      } else if (block === "table") {
        blockType = "table";
      } else if (/^h[1-6]$/.test(block)) {
        blockType = `heading-${block.slice(1)}`;
      }
      const alignTarget = getClosestWithinSelection("li, h1, h2, h3, h4, h5, h6, p, div, section, article");
      const style = alignTarget instanceof HTMLElement ? alignTarget.style.textAlign : "";
      const align = style === "center" || style === "right" ? style : "left";
      const currentMathElement = getCurrentMathElement();
      const currentMathType = getMathElementType(currentMathElement);
      return {
        bold,
        italic,
        underline,
        strike,
        link,
        currentLinkHref,
        inlineCode,
        color,
        fontSize,
        unorderedList,
        orderedList,
        taskList,
        codeBlock,
        blockquote,
        block,
        blockType,
        align,
        highlight: highlightState.highlight,
        highlightColor: highlightState.highlightColor,
        canEditMath: Boolean(currentMathType),
        currentMathType,
        currentMathSource: currentMathElement ? getMathElementSource(currentMathElement) : "",
      };
    },
    getSelectionSnapshot,
    destroy() {
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("mousedown", onMouseDown);
      element.removeEventListener("click", onClick);
      element.removeEventListener("paste", onPaste);
      element.removeEventListener("input", onInputEvent);
      element.removeEventListener("blur", onBlurEvent);
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
