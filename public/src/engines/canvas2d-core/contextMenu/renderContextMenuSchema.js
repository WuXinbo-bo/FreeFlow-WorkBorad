function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAttributes(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => {
      if (value === true) {
        return ` ${escapeHtml(key)}`;
      }
      return ` ${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .join("");
}

function renderMenuItem(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  if (item.type === "submenu") {
    const triggerAttributes = renderAttributes({
      ...item.triggerAttributes,
      type: "button",
      class: item.triggerClassName || "canvas2d-context-menu-item canvas2d-context-submenu-trigger",
    });
    const panelAttributes = renderAttributes({
      role: "menu",
      "aria-label": item.ariaLabel || item.label || "",
      ...item.panelAttributes,
      class: item.panelClassName || "canvas2d-context-submenu-panel",
    });
    const children = Array.isArray(item.items) ? item.items.map(renderMenuItem).join("") : "";
    return `
      <div class="canvas2d-context-submenu">
        <button${triggerAttributes}>${escapeHtml(item.label || "")}</button>
        <div${panelAttributes}>${children}</div>
      </div>
    `;
  }
  if (item.type === "html") {
    return String(item.html || "");
  }
  const attributes = renderAttributes({
    ...item.attributes,
    type: "button",
    class: item.className || "canvas2d-context-menu-item",
    "data-action": item.action || undefined,
  });
  return `<button${attributes}>${escapeHtml(item.label || "")}</button>`;
}

export function renderContextMenuSchema(items = []) {
  return (Array.isArray(items) ? items : []).map(renderMenuItem).join("");
}

