const DEFAULT_MARGIN_PX = 640;

function createSurface(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function viewsMatch(left = {}, right = {}) {
  return (
    Number(left.scale || 1) === Number(right.scale || 1) &&
    Number(left.offsetX || 0) === Number(right.offsetX || 0) &&
    Number(left.offsetY || 0) === Number(right.offsetY || 0)
  );
}

export function getRetainedFrameTransform(baseView = {}, nextView = {}, marginPx = DEFAULT_MARGIN_PX) {
  const baseScale = Math.max(0.01, Number(baseView.scale || 1) || 1);
  const nextScale = Math.max(0.01, Number(nextView.scale || 1) || 1);
  const ratio = nextScale / baseScale;
  const margin = Math.max(0, Number(marginPx || 0) || 0);
  return Object.freeze({
    ratio,
    translateX: Number(nextView.offsetX || 0) - ratio * (Number(baseView.offsetX || 0) + margin),
    translateY: Number(nextView.offsetY || 0) - ratio * (Number(baseView.offsetY || 0) + margin),
  });
}

export function isRetainedFrameCoverageValid(frame = null, view = {}, width = 0, height = 0) {
  if (!frame?.surface || !frame?.view) {
    return false;
  }
  const viewportWidth = Math.max(1, Number(width || 0) || 1);
  const viewportHeight = Math.max(1, Number(height || 0) || 1);
  if (frame.width !== viewportWidth || frame.height !== viewportHeight) {
    return false;
  }
  const baseScale = Math.max(0.01, Number(frame.view.scale || 1) || 1);
  const nextScale = Math.max(0.01, Number(view.scale || 1) || 1);
  const margin = Math.max(0, Number(frame.marginPx || 0) || 0);
  const toBaseLocalX = (screenX) =>
    ((screenX - Number(view.offsetX || 0)) / nextScale) * baseScale +
    Number(frame.view.offsetX || 0) +
    margin;
  const toBaseLocalY = (screenY) =>
    ((screenY - Number(view.offsetY || 0)) / nextScale) * baseScale +
    Number(frame.view.offsetY || 0) +
    margin;
  const left = Math.min(toBaseLocalX(0), toBaseLocalX(viewportWidth));
  const right = Math.max(toBaseLocalX(0), toBaseLocalX(viewportWidth));
  const top = Math.min(toBaseLocalY(0), toBaseLocalY(viewportHeight));
  const bottom = Math.max(toBaseLocalY(0), toBaseLocalY(viewportHeight));
  const epsilon = 0.5;
  return (
    left >= -epsilon &&
    top >= -epsilon &&
    right <= Number(frame.extendedWidth || 0) + epsilon &&
    bottom <= Number(frame.extendedHeight || 0) + epsilon
  );
}

function defaultSchedule(task) {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(task, { timeout: 160 });
    return () => globalThis.cancelIdleCallback?.(id);
  }
  const id = setTimeout(task, 0);
  return () => clearTimeout(id);
}

export function createRetainedCameraFrame({
  marginPx = DEFAULT_MARGIN_PX,
  scheduleTask = defaultSchedule,
  surfaceFactory = createSurface,
} = {}) {
  const margin = Math.max(0, Number(marginPx || 0) || 0);
  let readyFrame = null;
  let pendingKey = "";
  let cancelPending = null;
  let generation = 0;
  let prepareCount = 0;
  let presentCount = 0;
  let coverageMissCount = 0;

  function getReadiness({ view, width, height, dpr = 1, key = "" } = {}) {
    if (!readyFrame?.surface || !readyFrame?.view) {
      return Object.freeze({ ready: false, reason: "unavailable" });
    }
    const expectedKey = String(key || "");
    if (expectedKey && readyFrame.key !== expectedKey) {
      return Object.freeze({ ready: false, reason: "content" });
    }
    if (Math.abs(Number(readyFrame.dpr || 1) - Number(dpr || 1)) > 0.001) {
      return Object.freeze({ ready: false, reason: "dpr" });
    }
    if (!isRetainedFrameCoverageValid(readyFrame, view, width, height)) {
      return Object.freeze({ ready: false, reason: "coverage" });
    }
    return Object.freeze({ ready: true, reason: "ready", key: readyFrame.key });
  }

  function cancelScheduledPrepare() {
    cancelPending?.();
    cancelPending = null;
    pendingKey = "";
  }

  function prepareNow(descriptor = {}, targetGeneration = generation) {
    if (targetGeneration !== generation) {
      return false;
    }
    const width = Math.max(1, Number(descriptor.width || 0) || 1);
    const height = Math.max(1, Number(descriptor.height || 0) || 1);
    const dpr = Math.max(0.1, Number(descriptor.dpr || 1) || 1);
    const extendedWidth = width + margin * 2;
    const extendedHeight = height + margin * 2;
    const surface = surfaceFactory(
      Math.max(1, Math.round(extendedWidth * dpr)),
      Math.max(1, Math.round(extendedHeight * dpr))
    );
    const context = surface?.getContext?.("2d") || null;
    if (!surface || !context || typeof descriptor.draw !== "function") {
      return false;
    }
    const view = Object.freeze({
      scale: Math.max(0.01, Number(descriptor.view?.scale || 1) || 1),
      offsetX: Number(descriptor.view?.offsetX || 0) || 0,
      offsetY: Number(descriptor.view?.offsetY || 0) || 0,
    });
    const extendedView = Object.freeze({
      ...view,
      offsetX: view.offsetX + margin,
      offsetY: view.offsetY + margin,
    });
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, extendedWidth, extendedHeight);
    descriptor.draw({
      ctx: context,
      view: extendedView,
      width: extendedWidth,
      height: extendedHeight,
      dpr,
      marginPx: margin,
    });
    if (targetGeneration !== generation) {
      return false;
    }
    readyFrame = Object.freeze({
      key: String(descriptor.key || ""),
      surface,
      view,
      width,
      height,
      dpr,
      marginPx: margin,
      extendedWidth,
      extendedHeight,
    });
    prepareCount += 1;
    return true;
  }

  function schedulePrepare(descriptor = {}) {
    const key = String(descriptor.key || "");
    if (!key || (readyFrame?.key === key && viewsMatch(readyFrame.view, descriptor.view)) || pendingKey === key) {
      return false;
    }
    cancelScheduledPrepare();
    generation += 1;
    const targetGeneration = generation;
    pendingKey = key;
    cancelPending = scheduleTask(() => {
      cancelPending = null;
      pendingKey = "";
      prepareNow(descriptor, targetGeneration);
    });
    return true;
  }

  function present({ ctx, view, width, height, dpr = 1, key = "" } = {}) {
    const readiness = getReadiness({ view, width, height, dpr, key });
    if (!ctx || !readiness.ready) {
      coverageMissCount += 1;
      return { presented: false, reason: ctx ? readiness.reason : "unavailable" };
    }
    const transform = getRetainedFrameTransform(readyFrame.view, view, readyFrame.marginPx);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(transform.translateX, transform.translateY);
    ctx.scale(transform.ratio, transform.ratio);
    ctx.drawImage(
      readyFrame.surface,
      0,
      0,
      readyFrame.surface.width,
      readyFrame.surface.height,
      0,
      0,
      readyFrame.extendedWidth,
      readyFrame.extendedHeight
    );
    ctx.restore();
    presentCount += 1;
    return { presented: true, transform, key: readyFrame.key };
  }

  function clear() {
    generation += 1;
    cancelScheduledPrepare();
    readyFrame = null;
  }

  function getStats() {
    return Object.freeze({
      ready: Boolean(readyFrame),
      pending: Boolean(pendingKey),
      pendingKey,
      key: readyFrame?.key || "",
      marginPx: margin,
      prepareCount,
      presentCount,
      coverageMissCount,
      byteSize: readyFrame
        ? Math.max(1, Number(readyFrame.surface.width || 0)) * Math.max(1, Number(readyFrame.surface.height || 0)) * 4
        : 0,
    });
  }

  return Object.freeze({ schedulePrepare, prepareNow, present, getReadiness, clear, getStats });
}
