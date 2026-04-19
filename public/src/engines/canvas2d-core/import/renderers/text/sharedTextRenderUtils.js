import { sanitizeText } from "../../../utils.js";

const HEADING_FONT_SIZE_MAP = Object.freeze({
  1: 36,
  2: 30,
  3: 26,
  4: 22,
  5: 20,
  6: 18,
});

export function inferHeadingFontSize(level) {
  return HEADING_FONT_SIZE_MAP[Number(level) || 1] || 18;
}

export function estimateTextWidth(text, fontSize) {
  const lines = sanitizeText(text || "").split("\n");
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return Math.max(120, Math.min(760, Math.round(40 + longest * fontSize * 0.58)));
}

export function estimateTextHeight(text, fontSize) {
  const lines = sanitizeText(text || "").split("\n");
  const lineCount = Math.max(1, lines.length);
  return Math.max(40, Math.round(18 + lineCount * Math.max(22, fontSize * 1.35)));
}

export function inlineNodesToPlainText(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const parts = [];
  safeNodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "text") {
      parts.push(String(node.text || ""));
      return;
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (node.type === "inlineCode" || node.type === "mathInline") {
      parts.push(String(node.text || ""));
      return;
    }
    if (node.type === "link") {
      parts.push(inlineNodesToPlainText(node.content || []));
      return;
    }
    if (node.type === "footnoteRef") {
      const refId = String(node?.attrs?.refId || "").trim();
      parts.push(refId ? `[${refId}]` : "[*]");
    }
  });
  return sanitizeText(parts.join(""));
}

export function inlineNodesToHtml(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  return safeNodes.map((node) => renderInlineNodeToHtml(node)).join("");
}

export function renderInlineNodeToHtml(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  if (node.type === "text") {
    return applyMarksToHtml(escapeHtml(String(node.text || "")), node.marks || []);
  }
  if (node.type === "hardBreak") {
    return "<br>";
  }
  if (node.type === "inlineCode") {
    return `<code>${escapeHtml(String(node.text || ""))}</code>`;
  }
  if (node.type === "mathInline") {
    const math = escapeHtml(String(node.text || ""));
    return `<span data-role="math-inline">${math}</span>`;
  }
  if (node.type === "link") {
    const inner = inlineNodesToHtml(node.content || []);
    const href = escapeAttribute(String(node?.attrs?.href || ""));
    const title = String(node?.attrs?.title || "").trim();
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
    return `<a href="${href}"${titleAttr}>${inner}</a>`;
  }
  if (node.type === "footnoteRef") {
    const refId = String(node?.attrs?.refId || "").trim();
    return `<sup data-footnote-ref="${escapeAttribute(refId || "*")}">${escapeHtml(refId || "*")}</sup>`;
  }
  return "";
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function applyMarksToHtml(html, marks = []) {
  let output = html;
  const safeMarks = Array.isArray(marks) ? marks : [];
  safeMarks.forEach((mark) => {
    const type = String(mark?.type || "");
    if (type === "bold") {
      output = `<strong>${output}</strong>`;
    } else if (type === "italic") {
      output = `<em>${output}</em>`;
    } else if (type === "underline") {
      output = `<u>${output}</u>`;
    } else if (type === "strike") {
      output = `<s>${output}</s>`;
    } else if (type === "highlight") {
      output = `<mark>${output}</mark>`;
    } else if (type === "textColor") {
      const color = escapeAttribute(String(mark?.attrs?.color || ""));
      output = `<span style="color:${color};">${output}</span>`;
    } else if (type === "backgroundColor") {
      const color = escapeAttribute(String(mark?.attrs?.color || ""));
      output = `<span style="background-color:${color};">${output}</span>`;
    } else if (type === "code") {
      output = `<code>${output}</code>`;
    } else if (type === "link") {
      const href = escapeAttribute(String(mark?.attrs?.href || ""));
      output = `<a href="${href}">${output}</a>`;
    }
  });
  return output;
}
