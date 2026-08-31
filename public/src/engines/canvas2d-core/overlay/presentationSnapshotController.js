import { PRESENTATION_REPRESENTATIONS } from "../runtime/presentationQualityPlanner.js";
import html2canvas from "../../../../assets/vendor/html2canvas/html2canvas.esm.min.js";

const DEFAULT_CACHE_LIMIT = 96;
const DEFAULT_MAX_PIXELS = 1_500_000;
const DEFAULT_MAX_CONCURRENT_CAPTURES = 1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function isElementNode(node) {
  return Boolean(node && typeof node === "object" && node.dataset && typeof node.replaceChildren === "function");
}

function clearLiveContentState(node) {
  [
    "contentMode",
    "contentSignature",
    "detailRenderSignature",
    "html",
    "inlineScaleBucket",
    "layoutWritebackSignature",
    "linkSignature",
    "mathRenderState",
    "mathRenderTransport",
    "renderContentSignature",
    "renderSignature",
    "styleSignature",
    "text",
  ].forEach((key) => {
    delete node.dataset[key];
  });
}

function resizeSnapshotCanvas(source, width, height) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function createSnapshotMip(canvas, width, height, density) {
  const targetWidth = Math.max(1, Math.ceil(width * density));
  const targetHeight = Math.max(1, Math.ceil(height * density));
  let current = canvas;
  while (current.width / 2 > targetWidth * 1.25 || current.height / 2 > targetHeight * 1.25) {
    current = resizeSnapshotCanvas(
      current,
      Math.max(targetWidth, Math.round(current.width / 2)),
      Math.max(targetHeight, Math.round(current.height / 2))
    );
  }
  if (current.width !== targetWidth || current.height !== targetHeight) {
    current = resizeSnapshotCanvas(current, targetWidth, targetHeight);
  }
  return current;
}

async function captureElementSnapshot(node, { density = 1, maxPixels = DEFAULT_MAX_PIXELS } = {}) {
  if (!isElementNode(node) || !node.isConnected) {
    throw new Error("presentation snapshot source is unavailable");
  }
  const width = Math.max(1, Math.ceil(Number(node.offsetWidth || node.scrollWidth || 0) || 1));
  const height = Math.max(1, Math.ceil(Number(node.offsetHeight || node.scrollHeight || 0) || 1));
  const requestedDensity = clamp(density, 0.125, 2);
  const pixelScale = Math.min(
    Math.max(1, requestedDensity),
    Math.sqrt(Math.max(1, maxPixels) / (width * height))
  );
  const canvas = await html2canvas(node, {
    allowTaint: false,
    backgroundColor: null,
    height,
    imageTimeout: 3000,
    logging: false,
    removeContainer: true,
    scale: pixelScale,
    useCORS: true,
    width,
    onclone: (_, clone) => {
      const sceneRoot = clone.closest?.("#canvas2d-scene-root");
      if (sceneRoot?.style) sceneRoot.style.setProperty("transform", "none", "important");
      clone.style.animation = "none";
      clone.style.caretColor = "transparent";
      clone.style.transform = "none";
      clone.style.transition = "none";
      clone.style.visibility = "visible";
    },
  });
  const snapshotCanvas = createSnapshotMip(canvas, width, height, Math.min(requestedDensity, pixelScale));
  return Object.freeze({
    dataUrl: snapshotCanvas.toDataURL("image/png"),
    width,
    height,
    pixelWidth: snapshotCanvas.width,
    pixelHeight: snapshotCanvas.height,
  });
}

function scheduleIdleWork(callback) {
  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback(callback, { timeout: 500 });
    return () => globalThis.cancelIdleCallback?.(id);
  }
  const id = globalThis.setTimeout(callback, 16);
  return () => globalThis.clearTimeout(id);
}

export function createPresentationSnapshotController({
  capture = captureElementSnapshot,
  cacheLimit = DEFAULT_CACHE_LIMIT,
  maxPixels = DEFAULT_MAX_PIXELS,
  maxConcurrentCaptures = DEFAULT_MAX_CONCURRENT_CAPTURES,
  scheduleWork = scheduleIdleWork,
} = {}) {
  const cache = new Map();
  const pendingByKey = new Map();
  const nodeStates = new WeakMap();
  const captureQueue = [];
  const concurrency = Math.max(1, Math.floor(Number(maxConcurrentCaptures) || DEFAULT_MAX_CONCURRENT_CAPTURES));
  let requestToken = 0;
  let controllerGeneration = 0;
  let activeCaptures = 0;
  let paused = false;
  let cancelScheduledWork = null;

  function pumpCaptureQueue() {
    cancelScheduledWork = null;
    if (paused || activeCaptures >= concurrency || !captureQueue.length) return;
    const task = captureQueue.shift();
    activeCaptures += 1;
    Promise.resolve()
      .then(() => capture(task.node, task.options))
      .then(task.resolve, task.reject)
      .finally(() => {
        activeCaptures = Math.max(0, activeCaptures - 1);
        scheduleCapturePump();
      });
  }

  function scheduleCapturePump() {
    if (paused || cancelScheduledWork || activeCaptures >= concurrency || !captureQueue.length) return;
    cancelScheduledWork = scheduleWork(pumpCaptureQueue) || null;
  }

  function enqueueCapture(node, options) {
    return new Promise((resolve, reject) => {
      captureQueue.push({ node, options, resolve, reject });
      scheduleCapturePump();
    });
  }

  function cancelQueuedCaptures(node) {
    let canceled = 0;
    for (let index = captureQueue.length - 1; index >= 0; index -= 1) {
      const task = captureQueue[index];
      if (task.node !== node) continue;
      captureQueue.splice(index, 1);
      task.reject(new Error("presentation snapshot request superseded"));
      canceled += 1;
    }
    if (!captureQueue.length && cancelScheduledWork) {
      cancelScheduledWork();
      cancelScheduledWork = null;
    }
    return canceled;
  }

  function readCache(key) {
    if (!key || !cache.has(key)) return null;
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function writeCache(key, value) {
    if (!key || !value) return;
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > Math.max(1, Number(cacheLimit) || DEFAULT_CACHE_LIMIT)) {
      cache.delete(cache.keys().next().value);
    }
  }

  function restoreLive(node) {
    if (!isElementNode(node)) return false;
    const state = nodeStates.get(node) || null;
    const wasSnapshot = node.dataset.activeRepresentation === PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT;
    if (wasSnapshot) {
      node.replaceChildren();
      clearLiveContentState(node);
      if (state?.liveBoxStyle) {
        node.style.width = state.liveBoxStyle.width;
        node.style.height = state.liveBoxStyle.height;
        state.liveBoxStyle = null;
      }
    }
    delete node.dataset.presentationSnapshotSignature;
    delete node.dataset.presentationSnapshotStatus;
    delete node.dataset.presentationSnapshotError;
    node.dataset.activeRepresentation = PRESENTATION_REPRESENTATIONS.LIVE_DETAIL;
    return wasSnapshot;
  }

  function prepare(node, { plannedRepresentation, signature = "", generation = 0 } = {}) {
    if (!isElementNode(node)) {
      return Object.freeze({ snapshotActive: false, restored: false });
    }
    const target = String(plannedRepresentation || PRESENTATION_REPRESENTATIONS.LIVE_DETAIL);
    const normalizedSignature = String(signature || "");
    const normalizedGeneration = Math.max(0, Number(generation) || 0);
    node.dataset.plannedRepresentation = target;
    node.dataset.presentationSnapshotWanted = normalizedSignature;
    node.dataset.presentationSnapshotGeneration = String(normalizedGeneration);
    const state = nodeStates.get(node) || { token: 0, signature: "", generation: 0 };
    if (target !== PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT) {
      if (state.signature || state.generation !== normalizedGeneration) {
        state.token = ++requestToken;
        cancelQueuedCaptures(node);
      }
      state.signature = "";
      state.generation = normalizedGeneration;
      nodeStates.set(node, state);
      const restored = restoreLive(node);
      node.dataset.activeRepresentation = target === PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL
        ? PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL
        : PRESENTATION_REPRESENTATIONS.LIVE_DETAIL;
      return Object.freeze({ snapshotActive: false, restored });
    }
    const snapshotActive =
      node.dataset.activeRepresentation === PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT &&
      node.dataset.presentationSnapshotSignature === normalizedSignature;
    if (snapshotActive) {
      return Object.freeze({ snapshotActive: true, restored: false });
    }
    if (state.signature !== normalizedSignature) {
      state.token = ++requestToken;
      cancelQueuedCaptures(node);
      state.signature = normalizedSignature;
      state.generation = normalizedGeneration;
      delete node.dataset.presentationSnapshotStatus;
      delete node.dataset.presentationSnapshotError;
    } else if (state.generation !== normalizedGeneration) {
      state.generation = normalizedGeneration;
    }
    nodeStates.set(node, state);
    const restored =
      node.dataset.activeRepresentation === PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT
        ? restoreLive(node)
        : false;
    if (!node.dataset.activeRepresentation) {
      node.dataset.activeRepresentation = PRESENTATION_REPRESENTATIONS.LIVE_DETAIL;
    }
    return Object.freeze({ snapshotActive: false, restored });
  }

  function applySnapshot(node, snapshot, { signature, generation, token, controllerToken }) {
    const state = nodeStates.get(node);
    if (
      !isElementNode(node) ||
      !node.isConnected ||
      !state ||
      state.token !== token ||
      controllerGeneration !== controllerToken ||
      node.dataset.plannedRepresentation !== PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT ||
      node.dataset.presentationSnapshotWanted !== signature ||
      node.dataset.presentationSnapshotGeneration !== String(generation)
    ) {
      return false;
    }
    const image = node.ownerDocument.createElement("img");
    image.className = "canvas2d-presentation-snapshot";
    image.alt = "";
    image.draggable = false;
    image.src = snapshot.dataUrl;
    image.style.position = "absolute";
    image.style.inset = "0";
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.display = "block";
    image.style.objectFit = "fill";
    image.style.imageRendering = "auto";
    image.style.pointerEvents = "none";
    image.style.userSelect = "none";
    state.liveBoxStyle = {
      width: String(node.style.width || ""),
      height: String(node.style.height || ""),
    };
    node.style.width = `${snapshot.width}px`;
    node.style.height = `${snapshot.height}px`;
    node.replaceChildren(image);
    node.dataset.presentationSnapshotSignature = signature;
    node.dataset.presentationSnapshotStatus = "ready";
    delete node.dataset.presentationSnapshotError;
    node.dataset.activeRepresentation = PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT;
    return true;
  }

  function commit(
    node,
    { plannedRepresentation, signature = "", generation = 0, density = 1, ready = true } = {}
  ) {
    if (!isElementNode(node) || !ready) return false;
    const target = String(plannedRepresentation || PRESENTATION_REPRESENTATIONS.LIVE_DETAIL);
    const normalizedSignature = String(signature || "");
    const normalizedGeneration = Math.max(0, Number(generation) || 0);
    if (
      target !== PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT ||
      !normalizedSignature ||
      node.dataset.presentationSnapshotWanted !== normalizedSignature
    ) {
      return false;
    }
    const state = nodeStates.get(node) || {
      token: ++requestToken,
      signature: normalizedSignature,
      generation: normalizedGeneration,
    };
    nodeStates.set(node, state);
    const token = state.token;
    const controllerToken = controllerGeneration;
    const cached = readCache(normalizedSignature);
    if (cached) {
      return applySnapshot(node, cached, {
        signature: normalizedSignature,
        generation: normalizedGeneration,
        token,
        controllerToken,
      });
    }
    if (
      node.dataset.presentationSnapshotStatus === "pending" ||
      node.dataset.presentationSnapshotStatus === "error"
    ) return false;
    node.dataset.presentationSnapshotStatus = "pending";
    let pending = pendingByKey.get(normalizedSignature);
    if (!pending) {
      pending = enqueueCapture(node, { density, maxPixels });
      pendingByKey.set(normalizedSignature, pending);
      const cleanup = () => {
        if (pendingByKey.get(normalizedSignature) === pending) {
          pendingByKey.delete(normalizedSignature);
        }
      };
      pending.then(cleanup, cleanup);
    }
    pending
      .then((snapshot) => {
        if (!snapshot?.dataUrl) throw new Error("presentation snapshot result is empty");
        writeCache(normalizedSignature, snapshot);
        const current = nodeStates.get(node);
        applySnapshot(node, snapshot, {
          signature: normalizedSignature,
          generation: current?.generation ?? normalizedGeneration,
          token: current?.token ?? token,
          controllerToken,
        });
      })
      .catch((error) => {
        const current = nodeStates.get(node);
        if (current?.token === token && node.dataset.presentationSnapshotWanted === normalizedSignature) {
          node.dataset.presentationSnapshotStatus = "error";
          node.dataset.presentationSnapshotError = String(error?.message || error || "snapshot failed");
          node.dataset.activeRepresentation = PRESENTATION_REPRESENTATIONS.LIVE_DETAIL;
        }
      });
    return true;
  }

  function remove(node) {
    if (!isElementNode(node)) return;
    const state = nodeStates.get(node) || { token: 0 };
    state.token = ++requestToken;
    cancelQueuedCaptures(node);
    nodeStates.delete(node);
  }

  function clear() {
    cache.clear();
    pendingByKey.clear();
    if (cancelScheduledWork) cancelScheduledWork();
    cancelScheduledWork = null;
    const error = new Error("presentation snapshot queue cleared");
    captureQueue.splice(0).forEach((task) => task.reject(error));
    controllerGeneration += 1;
    requestToken += 1;
  }

  function setPaused(nextPaused = false) {
    paused = Boolean(nextPaused);
    if (paused && cancelScheduledWork) {
      cancelScheduledWork();
      cancelScheduledWork = null;
    } else if (!paused) {
      scheduleCapturePump();
    }
    return getSnapshot();
  }

  function getSnapshot() {
    return Object.freeze({
      cacheSize: cache.size,
      pendingCount: pendingByKey.size,
      queuedCount: captureQueue.length,
      activeCount: activeCaptures,
      paused,
    });
  }

  return Object.freeze({ prepare, commit, remove, clear, setPaused, getSnapshot });
}
