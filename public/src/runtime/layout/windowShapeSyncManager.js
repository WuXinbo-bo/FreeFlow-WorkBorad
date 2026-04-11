export function bindWindowShapeAutoSync({
  element,
  scheduleSync,
  observeSubtree = false,
  observeChildList = true,
  observeAttributes = true,
  observeCharacterData = false,
  attributeFilter = ["class", "style", "open", "hidden", "aria-hidden", "data-shape-include", "data-shape-padding", "data-shape-exclude"],
  watchResize = true,
  syncOnBind = true,
} = {}) {
  if (!(element instanceof Element) || typeof scheduleSync !== "function") {
    return () => {};
  }

  let resizeObserver = null;
  let mutationObserver = null;

  const requestSync = () => {
    scheduleSync();
  };

  if (typeof MutationObserver === "function") {
    mutationObserver = new MutationObserver(() => {
      requestSync();
    });
    mutationObserver.observe(element, {
      attributes: observeAttributes,
      childList: observeChildList,
      subtree: observeSubtree,
      characterData: observeCharacterData,
      attributeFilter: observeAttributes ? attributeFilter : undefined,
    });
  }

  if (watchResize && typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      requestSync();
    });
    resizeObserver.observe(element);
  }

  if (syncOnBind) {
    requestSync();
  }

  return () => {
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
  };
}

export function createWindowShapeSyncScheduler({
  sync,
  finalDelayMs = 32,
} = {}) {
  if (typeof sync !== "function") {
    return {
      scheduleSync() {},
      requestImmediateShapeSync() {},
      requestFinalShapeSync() {},
      dispose() {},
    };
  }

  let frameId = 0;
  let finalTimer = 0;

  const clearFinalTimer = () => {
    if (!finalTimer) {
      return;
    }
    window.clearTimeout(finalTimer);
    finalTimer = 0;
  };

  const runSync = () => {
    sync();
  };

  const scheduleSync = () => {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      runSync();
    });
  };

  const requestImmediateShapeSync = () => {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    clearFinalTimer();
    runSync();
  };

  const requestFinalShapeSync = (delayMs = finalDelayMs) => {
    clearFinalTimer();
    finalTimer = window.setTimeout(() => {
      finalTimer = 0;
      scheduleSync();
    }, Math.max(0, Number(delayMs) || 0));
  };

  const dispose = () => {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    clearFinalTimer();
  };

  return {
    scheduleSync,
    requestImmediateShapeSync,
    requestFinalShapeSync,
    dispose,
  };
}

export function bindMarkedWindowShapeAutoSync({
  rootElement,
  scheduleSync,
  syncOnBind = true,
  elementAttributeFilter = ["class", "style", "open", "hidden", "aria-hidden", "data-shape-include", "data-shape-padding", "data-shape-exclude"],
} = {}) {
  if (!(rootElement instanceof Element) || typeof scheduleSync !== "function") {
    return () => {};
  }

  const elementDisposers = new Map();
  let rootObserver = null;

  const collectMarkedElements = () => {
    const marked = [];
    if (rootElement.getAttribute("data-shape-include") === "true") {
      marked.push(rootElement);
    }
    marked.push(...rootElement.querySelectorAll('[data-shape-include="true"]'));
    return marked;
  };

  const syncObservedElements = () => {
    const nextElements = new Set(collectMarkedElements());

    Array.from(elementDisposers.entries()).forEach(([element, dispose]) => {
      if (nextElements.has(element)) {
        return;
      }
      dispose?.();
      elementDisposers.delete(element);
    });

    nextElements.forEach((element) => {
      if (elementDisposers.has(element)) {
        return;
      }
      elementDisposers.set(
        element,
        bindWindowShapeAutoSync({
          element,
          scheduleSync,
          observeSubtree: false,
          observeChildList: false,
          observeCharacterData: false,
          attributeFilter: elementAttributeFilter,
          watchResize: true,
          syncOnBind: false,
        })
      );
    });
  };

  const refresh = () => {
    syncObservedElements();
    scheduleSync();
  };

  if (typeof MutationObserver === "function") {
    rootObserver = new MutationObserver(() => {
      refresh();
    });
    rootObserver.observe(rootElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: elementAttributeFilter,
    });
  }

  syncObservedElements();
  if (syncOnBind) {
    scheduleSync();
  }

  return () => {
    rootObserver?.disconnect();
    elementDisposers.forEach((dispose) => {
      dispose?.();
    });
    elementDisposers.clear();
  };
}
