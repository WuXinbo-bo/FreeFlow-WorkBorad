function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function createElementAdapterManager() {
  const adapters = new Map();

  function register(key, adapter = {}) {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      throw new Error("Adapter key is required");
    }
    const registered = Object.freeze({ ...adapter, key: normalizedKey });
    const stack = adapters.get(normalizedKey) || [];
    stack.push(registered);
    adapters.set(normalizedKey, stack);
    let disposed = false;
    return () => {
      if (disposed) {
        return false;
      }
      disposed = true;
      const currentStack = adapters.get(normalizedKey) || [];
      const index = currentStack.lastIndexOf(registered);
      if (index < 0) {
        return false;
      }
      currentStack.splice(index, 1);
      if (!currentStack.length) {
        adapters.delete(normalizedKey);
      }
      return true;
    };
  }

  function get(key) {
    const stack = adapters.get(normalizeKey(key)) || [];
    return stack[stack.length - 1] || null;
  }

  function invoke(key, method, ...args) {
    const handler = get(key)?.[method];
    return typeof handler === "function" ? handler(...args) : undefined;
  }

  function invokeAll(method, ...args) {
    const results = [];
    adapters.forEach((stack) => {
      const adapter = stack[stack.length - 1];
      if (typeof adapter[method] === "function") {
        results.push(adapter[method](...args));
      }
    });
    return results;
  }

  return {
    register,
    get,
    invoke,
    invokeAll,
    list: () => Array.from(adapters.values(), (stack) => stack[stack.length - 1]).filter(Boolean),
    clear: () => adapters.clear(),
  };
}
