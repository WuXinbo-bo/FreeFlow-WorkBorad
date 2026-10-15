let activeShowcase = null;

export function openFeatureShowcase({ onShapeChange, onMirrorTutorial } = {}) {
  if (activeShowcase) { activeShowcase.focus(); return activeShowcase; }
  const previousFocus = document.activeElement;
  const host = document.createElement("div");
  host.className = "feature-showcase-host";
  host.dataset.shapeInclude = "true";
  host.dataset.shapePadding = "0";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "FreeFlow 特色导览");
  const frame = document.createElement("iframe");
  frame.title = "FreeFlow 特色导览画布";
  frame.src = "./feature-showcase.html";
  const loading = document.createElement("div");
  loading.className = "feature-showcase-loading";
  loading.textContent = "正在准备特色导览…";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "feature-showcase-host-close";
  closeButton.setAttribute("aria-label", "退出特色导览");
  closeButton.textContent = "×";
  host.append(frame, loading, closeButton);
  // Disable the covered workbench without changing any of its UI state.
  const covered = [...document.body.children].filter((node) => !node.inert);
  covered.forEach((node) => { node.inert = true; });
  document.body.append(host);
  let closed = false;
  function focusFrame(last = false) {
    const targets = [...(frame.contentDocument?.querySelectorAll('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"], [contenteditable="true"]') || [])]
      .filter((element) => element.getClientRects().length && !element.closest('[inert]'));
    (last ? targets.at(-1) : targets[0])?.focus({ preventScroll: true });
  }
  const instance = {
    focus() { closeButton.focus({ preventScroll: true }); },
    close() {
      if (closed) return;
      closed = true;
      void frame.contentWindow?.__featureShowcase?.dispose();
      host.remove();
      covered.forEach((node) => { node.inert = false; });
      document.removeEventListener("keydown", onKeyDown, true);
      activeShowcase = null;
      onShapeChange?.();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
  };
  function onKeyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); instance.close(); }
    if (event.key === "Tab" && document.activeElement === closeButton) {
      event.preventDefault(); focusFrame(event.shiftKey);
    }
  }
  closeButton.addEventListener("click", () => instance.close());
  document.addEventListener("keydown", onKeyDown, true);
  frame.addEventListener("load", () => {
    if (closed) return;
    frame.contentDocument.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const targets = [...frame.contentDocument.querySelectorAll('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"], [contenteditable="true"]')]
        .filter((element) => element.getClientRects().length && !element.closest('[inert]'));
      const boundary = event.shiftKey ? targets[0] : targets.at(-1);
      if (frame.contentDocument.activeElement === boundary) { event.preventDefault(); closeButton.focus({ preventScroll: true }); }
    });
    const shell = globalThis.desktopShell;
    const previewWord = shell?.previewWordDocx ? (payload) => shell.previewWordDocx(payload) : null;
    const exportWord = shell?.exportWordDocx ? (payload) => shell.exportWordDocx(payload) : null;
    const attributes = [...document.documentElement.attributes].filter((entry) => entry.name.startsWith("data-"));
    attributes.forEach((entry) => frame.contentDocument.documentElement.setAttribute(entry.name, entry.value));
    const style = getComputedStyle(document.documentElement);
    for (const property of style) {
      if (property.startsWith("--")) frame.contentDocument.documentElement.style.setProperty(property, style.getPropertyValue(property));
    }
    if (typeof frame.contentWindow.startFeatureShowcase !== "function") {
      loading.textContent = "导览加载失败，请退出后重试。";
      return;
    }
    frame.contentWindow.startFeatureShowcase({
      previewWord,
      exportWord,
      close: () => instance.close(),
      mirrorTutorial() { instance.close(); onMirrorTutorial?.(); },
    }).then(() => { if (!closed) loading.remove(); }).catch(() => {
      if (!closed) loading.textContent = "导览加载失败，请退出后重试。";
    });
  });
  activeShowcase = instance;
  instance.focus();
  onShapeChange?.();
  return instance;
}
