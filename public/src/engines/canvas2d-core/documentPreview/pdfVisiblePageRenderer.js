export function createVisiblePageWindow(pageNumber, pageCount, radius = 1) {
  const center = Math.min(Math.max(1, Number(pageNumber) || 1), Math.max(1, Number(pageCount) || 1));
  const safeRadius = Math.max(0, Math.floor(Number(radius) || 0));
  const pages = [];
  for (let distance = 0; distance <= safeRadius; distance += 1) {
    const before = center - distance;
    const after = center + distance;
    if (before >= 1 && !pages.includes(before)) pages.push(before);
    if (after <= pageCount && !pages.includes(after)) pages.push(after);
  }
  return pages;
}

export async function createPdfVisiblePageRenderer({
  pdfDocument,
  host,
  scrollRoot,
  onStats = null,
  preloadRadius = 1,
  retentionRadius = 4,
} = {}) {
  if (!pdfDocument || !(host instanceof HTMLElement)) {
    throw new TypeError("PDF visible-page renderer requires a document and host");
  }
  const pageCount = Math.max(0, Number(pdfDocument.numPages || 0) || 0);
  if (!pageCount) {
    throw new Error("PDF 文档不包含可预览页面");
  }
  const records = new Map();
  const queued = new Set();
  const queue = [];
  let activeRenderTask = null;
  let processing = false;
  let disposed = false;
  let visibleCenter = 1;
  let observer = null;

  const firstPage = await pdfDocument.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1 });
  const defaultWidth = Math.max(1, Math.round(firstViewport.width));
  const defaultHeight = Math.max(1, Math.round(firstViewport.height));
  host.innerHTML = "";

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const shell = document.createElement("div");
    shell.className = "canvas2d-file-preview-react-pdf-page";
    shell.dataset.pageNumber = String(pageNumber);
    shell.style.width = `${defaultWidth}px`;
    shell.style.height = `${defaultHeight}px`;
    host.appendChild(shell);
    records.set(pageNumber, { pageNumber, shell, state: "idle", canvas: null });
  }

  function getRenderedCount() {
    return Array.from(records.values()).filter((record) => record.state === "ready").length;
  }

  function emitStats() {
    onStats?.({ pageCount, renderedCount: getRenderedCount(), visibleCenter });
  }

  function releaseFarPages() {
    records.forEach((record, pageNumber) => {
      if (record.state !== "ready" || Math.abs(pageNumber - visibleCenter) <= retentionRadius) return;
      if (record.canvas) {
        record.canvas.width = 1;
        record.canvas.height = 1;
        record.canvas.remove();
      }
      record.canvas = null;
      record.state = "idle";
    });
  }

  async function renderPage(pageNumber) {
    const record = records.get(pageNumber);
    if (!record || disposed || record.state === "ready" || record.state === "rendering") return;
    record.state = "rendering";
    const page = pageNumber === 1 ? firstPage : await pdfDocument.getPage(pageNumber);
    if (disposed) return;
    const cssViewport = page.getViewport({ scale: 1 });
    const outputScale = Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio || 1) || 1));
    const renderViewport = page.getViewport({ scale: outputScale });
    const canvas = document.createElement("canvas");
    canvas.className = "canvas2d-file-preview-react-pdf-canvas";
    canvas.width = Math.max(1, Math.floor(renderViewport.width));
    canvas.height = Math.max(1, Math.floor(renderViewport.height));
    canvas.style.width = `${Math.round(cssViewport.width)}px`;
    canvas.style.height = `${Math.round(cssViewport.height)}px`;
    record.shell.style.width = `${Math.round(cssViewport.width)}px`;
    record.shell.style.height = `${Math.round(cssViewport.height)}px`;
    record.shell.replaceChildren(canvas);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("PDF 预览画布上下文不可用");
    activeRenderTask = page.render({ canvasContext: context, viewport: renderViewport });
    try {
      await activeRenderTask.promise;
      if (disposed) return;
      record.canvas = canvas;
      record.state = "ready";
      emitStats();
    } finally {
      activeRenderTask = null;
    }
  }

  async function processQueue() {
    if (processing || disposed) return;
    processing = true;
    try {
      while (queue.length && !disposed) {
        const pageNumber = queue.shift();
        queued.delete(pageNumber);
        await renderPage(pageNumber);
      }
    } finally {
      processing = false;
      releaseFarPages();
    }
  }

  function enqueuePages(pageNumbers = []) {
    pageNumbers.forEach((pageNumber) => {
      const record = records.get(pageNumber);
      if (!record || record.state !== "idle" || queued.has(pageNumber)) return;
      queued.add(pageNumber);
      queue.push(pageNumber);
    });
    void processQueue();
  }

  function updateVisibleCenter() {
    if (disposed || !(scrollRoot instanceof HTMLElement)) return;
    const rootRect = scrollRoot.getBoundingClientRect();
    const viewportCenter = rootRect.top + rootRect.height / 2;
    let nearestPage = visibleCenter;
    let nearestDistance = Infinity;
    records.forEach((record, pageNumber) => {
      const rect = record.shell.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPage = pageNumber;
      }
    });
    visibleCenter = nearestPage;
    enqueuePages(createVisiblePageWindow(visibleCenter, pageCount, preloadRadius));
    releaseFarPages();
    emitStats();
  }

  if (typeof IntersectionObserver === "function" && scrollRoot instanceof HTMLElement) {
    observer = new IntersectionObserver((entries) => {
      const visiblePages = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => Number(entry.target?.dataset?.pageNumber || 0))
        .filter(Boolean);
      if (!visiblePages.length) return;
      visibleCenter = visiblePages[Math.floor(visiblePages.length / 2)];
      enqueuePages(visiblePages.flatMap((pageNumber) => createVisiblePageWindow(pageNumber, pageCount, preloadRadius)));
      releaseFarPages();
      emitStats();
    }, { root: scrollRoot, rootMargin: "100% 0px", threshold: 0.01 });
    records.forEach((record) => observer.observe(record.shell));
  }
  scrollRoot?.addEventListener?.("scroll", updateVisibleCenter, { passive: true });
  await renderPage(1);
  enqueuePages(createVisiblePageWindow(1, pageCount, preloadRadius));
  emitStats();

  return Object.freeze({
    getStats: () => Object.freeze({ pageCount, renderedCount: getRenderedCount(), visibleCenter }),
    refresh: updateVisibleCenter,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      observer = null;
      scrollRoot?.removeEventListener?.("scroll", updateVisibleCenter);
      try {
        activeRenderTask?.cancel?.();
      } catch {
        // Ignore pdf.js cancellation differences across builds.
      }
      records.forEach((record) => {
        if (record.canvas) {
          record.canvas.width = 1;
          record.canvas.height = 1;
        }
      });
      records.clear();
      queue.length = 0;
      queued.clear();
      pdfDocument.cleanup?.();
    },
  });
}
