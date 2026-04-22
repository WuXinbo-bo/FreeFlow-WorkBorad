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
    return node instanceof HTMLElement && node.tagName === "UL" && node.getAttribute("data-ff-task-list") === "true";
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

  function ensureSelection({ selectAllWhenCollapsed = true } = {}) {
    const selection = document.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      selectAll();
      return;
    }
    if (!selectionInside()) {
      selectAll();
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed && selectAllWhenCollapsed) {
      selectAll();
    }
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
    const walker = document.createTreeWalker(mathElement, NodeFilter.SHOW_TEXT);
    let lastTextNode = null;
    while (walker.nextNode()) {
      lastTextNode = walker.currentNode;
    }
    if (lastTextNode instanceof Text) {
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
    const currentTaskList = getClosestWithinSelection("ul[data-ff-task-list='true']");
    if (currentTaskList instanceof HTMLElement) {
      clearTaskListAttributes(currentTaskList);
      return true;
    }
    if (!exec("insertUnorderedList")) {
      return false;
    }
    const list = findCurrentUnorderedList();
    return markListAsTaskList(list);
  }

  function insertHorizontalRule() {
    return insertHtml('<hr data-ff-divider="true"><div><br></div>');
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
    } else {
      element.textContent = String(textFallback || "");
    }
  }

  function getHTML() {
    if (isRootCodeBlockMode()) {
      return `<pre data-ff-code-block="true"><code>${serializeCodeBlockPlainTextToHtml(getText())}</code></pre>`;
    }
    return serializeEditableCodeBlocks(element);
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
    const source = String(formula || "").trim();
    if (!source) {
      return false;
    }
    return insertHtml(`<span data-role="math-inline">${escapeHtml(source)}</span>`);
  }

  function insertMathBlock(formula = "") {
    const source = String(formula || "").trim();
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
    block.textContent = source;
    fragment.appendChild(block);
    const trailingParagraph = document.createElement("div");
    trailingParagraph.appendChild(document.createElement("br"));
    fragment.appendChild(trailingParagraph);
    range.insertNode(fragment);
    collapseToEnd(trailingParagraph);
    return true;
  }

  function updateCurrentMath(formula = "") {
    const source = String(formula || "").trim();
    if (!source) {
      return false;
    }
    const currentMathElement = getCurrentMathElement();
    if (!(currentMathElement instanceof HTMLElement)) {
      return false;
    }
    currentMathElement.textContent = source;
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
    ensureSelection({ selectAllWhenCollapsed: false });
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
    ensureSelection({ selectAllWhenCollapsed: false });
    if (name === "insertMathInline") {
      insertMathInline(value);
      return;
    }
    if (name === "insertMathBlock") {
      insertMathBlock(value);
      return;
    }
    if (name === "updateCurrentMath") {
      updateCurrentMath(value);
      return;
    }
    if (name === "setBlockType") {
      setBlockType(value);
      return;
    }
    if (name === "toggleInlineCode") {
      toggleInlineCode();
      return;
    }
    if (name === "toggleTaskList") {
      toggleTaskList();
      return;
    }
    if (name === "insertHorizontalRule") {
      insertHorizontalRule();
      return;
    }
    if (name === "insertTable") {
      insertTable(typeof value === "object" && value ? value : {});
      return;
    }
    if (name === "align") {
      applyAlignment(value);
      return;
    }
    if (name === "formatBlock") {
      applyFormatBlock(value);
      return;
    }
    if (name === "highlight") {
      const color = value || "#fff4a3";
      const range = getSelectionRange();
      if (!range || range.collapsed) {
        return;
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
        return;
      }
      const ok = wrapSelection("span", {
        "data-ff-highlight": "true",
        "data-ff-highlight-color": color,
        style: `background-color: ${color};`,
      });
      if (ok) {
        return;
      }
      return;
    }
    if (name === "fontSize" && value) {
      if (typeof value === "object" && value !== null) {
        const logicalSize = normalizeRichFontSize(value.logicalSize, 16);
        const renderedSize = normalizeRichFontSize(value.renderedSize, logicalSize);
        wrapSelection("span", {
          "data-ff-font-size": String(logicalSize),
          style: `font-size: ${renderedSize}px;`,
        });
        return;
      }
      const rawValue = String(value || "").trim().toLowerCase();
      if (rawValue.endsWith("em")) {
        wrapSelection("span", { style: `font-size: ${rawValue};` });
        return;
      }
      const size = normalizeRichFontSize(value, 16);
      wrapSelection("span", { "data-ff-font-size": String(size), style: `font-size: ${size}px;` });
      return;
    }
    const ok = exec(name, value);
    if (ok) {
      return;
    }
    if (name === "bold") {
      wrapSelection("strong");
    } else if (name === "italic") {
      wrapSelection("em");
    } else if (name === "underline") {
      wrapSelection("u");
    } else if (name === "strikeThrough") {
      wrapSelection("s");
    } else if (name === "createLink" && value) {
      wrapSelection("a", {
        href: value,
        target: "_blank",
        rel: "noopener noreferrer",
      });
    } else if (name === "foreColor" && value) {
      wrapSelection("span", { style: `color: ${value};` });
    }
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
        const url = window.prompt("输入链接");
        if (url) {
          command("createLink", url);
        } else {
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
    event.preventDefault();
    if (html) {
      insertHtml(normalizeRichHtmlInlineFontSizes(html, normalizeRichFontSize(element.style.fontSize, 16)));
      return;
    }
    exec("insertText", text);
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
      const bold = Boolean(range && getUniformAncestor(range, isBoldElement));
      const italic = Boolean(range && getUniformAncestor(range, isItalicElement));
      const underline = Boolean(range && getUniformAncestor(range, isUnderlineElement));
      const strike = Boolean(range && getUniformAncestor(range, isStrikeElement));
      const inlineCode = Boolean(range && getUniformAncestor(range, isInlineCodeElement));
      const unorderedList = Boolean(range && getUniformAncestor(range, (node) => isListContainer(node, "ul")));
      const orderedList = Boolean(range && getUniformAncestor(range, (node) => isListContainer(node, "ol")));
      const taskList = Boolean(range && getUniformAncestor(range, isTaskListElement));
      const codeBlock = Boolean(range && getUniformAncestor(range, isCodeBlockElement));
      const blockquote = Boolean(range && getUniformAncestor(range, isBlockquoteElement));
      let color = "";
      const colorTarget = range
        ? getUniformAncestor(range, (node) => node instanceof HTMLElement && Boolean(node.style?.color))
        : null;
      if (colorTarget instanceof HTMLElement) {
        color = String(colorTarget.style.color || "");
      } else if (typeof document?.queryCommandValue === "function") {
        color = String(document.queryCommandValue("foreColor") || "");
      }
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
        currentMathSource: currentMathElement ? getNodeText(currentMathElement) : "",
      };
    },
    getSelectionSnapshot,
    destroy() {
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("paste", onPaste);
      element.removeEventListener("input", onInputEvent);
      element.removeEventListener("blur", onBlurEvent);
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
