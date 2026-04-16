let hostRoot = null;
let hostContent = null;

function applyRootStyles(node) {
  node.style.position = "fixed";
  node.style.left = "-100000px";
  node.style.top = "0";
  node.style.visibility = "hidden";
  node.style.pointerEvents = "none";
  node.style.zIndex = "-1";
  node.style.width = "0";
  node.style.height = "0";
  node.style.overflow = "hidden";
  node.style.contain = "layout style paint";
}

function applyContentStyles(node) {
  node.style.display = "block";
  node.style.boxSizing = "border-box";
  node.style.margin = "0";
  node.style.padding = "0";
  node.style.border = "0";
  node.style.whiteSpace = "pre-wrap";
  node.style.wordBreak = "break-word";
  node.style.overflowWrap = "anywhere";
}

export function createTextMeasureHost() {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }
  if (hostRoot?.isConnected && hostContent?.isConnected) {
    return {
      root: hostRoot,
      content: hostContent,
    };
  }

  const root = document.createElement("div");
  const content = document.createElement("div");
  root.setAttribute("data-freeflow-text-measure-host", "true");
  content.setAttribute("data-freeflow-text-measure-content", "true");

  applyRootStyles(root);
  applyContentStyles(content);

  root.appendChild(content);
  document.body.appendChild(root);

  hostRoot = root;
  hostContent = content;

  return {
    root: hostRoot,
    content: hostContent,
  };
}
