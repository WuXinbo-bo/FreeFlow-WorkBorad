function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function createElementResourceManager({ registry } = {}) {
  const adapters = new Map();
  let lastSceneRevision = null;

  function register(resourceType, adapter = {}) {
    const key = normalizeKey(resourceType);
    if (!key || key === "none") {
      return () => {};
    }
    const stack = adapters.get(key) || [];
    stack.push(adapter);
    adapters.set(key, stack);
    lastSceneRevision = null;
    let disposed = false;
    return () => {
      if (disposed) {
        return false;
      }
      disposed = true;
      const currentStack = adapters.get(key) || [];
      const index = currentStack.lastIndexOf(adapter);
      if (index < 0) {
        return false;
      }
      currentStack.splice(index, 1);
      adapter.dispose?.();
      if (!currentStack.length) {
        adapters.delete(key);
      }
      lastSceneRevision = null;
      return true;
    };
  }

  function sync(items = [], { sceneRevision = 0, frameContext = null } = {}) {
    const revision = Number(sceneRevision) || 0;
    if (revision === lastSceneRevision) {
      return false;
    }
    lastSceneRevision = revision;
    const grouped = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const resourceType = normalizeKey(registry?.resolveElement?.(item)?.capabilities?.resource);
      if (!resourceType || resourceType === "none" || !adapters.has(resourceType)) {
        return;
      }
      const bucket = grouped.get(resourceType) || [];
      bucket.push(item);
      grouped.set(resourceType, bucket);
    });
    adapters.forEach((stack, resourceType) => {
      const adapter = stack[stack.length - 1];
      adapter.sync?.(grouped.get(resourceType) || [], { frameContext, sceneRevision: revision });
    });
    return true;
  }

  function dispose() {
    adapters.forEach((stack) => stack.forEach((adapter) => adapter.dispose?.()));
    adapters.clear();
    lastSceneRevision = null;
  }

  return {
    register,
    sync,
    dispose,
    getRegisteredTypes: () => Array.from(adapters.keys()),
  };
}
