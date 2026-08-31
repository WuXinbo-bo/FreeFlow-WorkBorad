import { PRESENTATION_REPRESENTATIONS } from "../runtime/presentationQualityPlanner.js";
import html2canvas from "../../../../assets/vendor/html2canvas/html2canvas.esm.min.js";

const DEFAULT_CACHE_LIMIT = 96;
const DEFAULT_MAX_PIXELS = 1_500_000;

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

async function captureElementSnapshot(node, { density = 1, maxPixels = DEFAULT_MAX_PIXELS } = {}) {
  if (!isElementNode(node) || !node.isConnected) {
    throw new Error("presentation snapshot source is unavailable");
  }
  const width = Math.max(1, Math.ceil(Number(node.offsetWidth || node.scrollWidth || 0) || 1));
  const height = Math.max(1, Math.ceil(Number(node.offsetHeight || node.scrollHeight || 0) || 1));
  const requestedDensity = clamp(density, 0.25, 2);
  const pixelScale = Math.min(requestedDensity, Math.sqrt(Math.max(1, maxPixels) / (width * height)));
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
      clone.style.animation = "none";
      clone.style.caretColor = "transparent";
      clone.style.transform = "none";
      clone.style.transition = "none";
      clone.style.visibility = "visible";
    },
  });
  return Object.freeze({
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  });
}

export function createPresentationSnapshotController({
  capture = captureElementSnapshot,
  cacheLimit = DEFAULT_CACHE_LIMIT,
  maxPixels = DEFAULT_MAX_PIXELS,
} = {}) {
  const cache = new Map();
  const pendingByKey = new Map();
  const nodeStates = new WeakMap();
  let requestToken = 0;
  let controllerGeneration = 0;

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
      }
      state.signature = "";
      state.generation = normalizedGeneration;
      nodeStates.set(node, state);
      return Object.freeze({ snapshotActive: false, restored: restoreLive(node) });
    }
    const snapshotActive =
      node.dataset.activeRepresentation === PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT &&
      node.dataset.presentationSnapshotSignature === normalizedSignature;
    if (snapshotActive) {
      return Object.freeze({ snapshotActive: true, restored: false });
    }
    if (state.signature !== normalizedSignature || state.generation !== normalizedGeneration) {
      state.token = ++requestToken;
      state.signature = normalizedSignature;
      state.generation = normalizedGeneration;
      delete node.dataset.presentationSnapshotStatus;
      delete node.dataset.presentationSnapshotError;
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
      pending = Promise.resolve().then(() => capture(node, { density, maxPixels }));
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
        applySnapshot(node, snapshot, {
          signature: normalizedSignature,
          generation: normalizedGeneration,
          token,
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
    nodeStates.delete(node);
  }

  function clear() {
    cache.clear();
    pendingByKey.clear();
    controllerGeneration += 1;
    requestToken += 1;
  }

  function getSnapshot() {
    return Object.freeze({ cacheSize: cache.size, pendingCount: pendingByKey.size });
  }

  return Object.freeze({ prepare, commit, remove, clear, getSnapshot });
}
