function normalizeType(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeTypes(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map(normalizeType).filter(Boolean))
  );
}

export function createCompactPresentationRegistry({ elementRegistry = null } = {}) {
  const paintersByType = new Map();
  const fallbackPainters = [];
  let revision = 0;

  function register(painter, { supportedTypes = painter?.supportedTypes } = {}) {
    if (typeof painter !== "function") {
      return () => false;
    }
    const types = normalizeTypes(supportedTypes).map((type) => {
      const definition = elementRegistry?.resolve?.(type, { fallback: false });
      return normalizeType(definition?.type || type);
    });
    if (!types.length) {
      fallbackPainters.push(painter);
    } else {
      types.forEach((type) => {
        const stack = paintersByType.get(type) || [];
        stack.push(painter);
        paintersByType.set(type, stack);
      });
    }
    revision += 1;
    let active = true;
    return () => {
      if (!active) {
        return false;
      }
      active = false;
      if (!types.length) {
        const index = fallbackPainters.lastIndexOf(painter);
        if (index >= 0) fallbackPainters.splice(index, 1);
      } else {
        types.forEach((type) => {
          const stack = paintersByType.get(type) || [];
          const index = stack.lastIndexOf(painter);
          if (index >= 0) stack.splice(index, 1);
          if (!stack.length) paintersByType.delete(type);
        });
      }
      revision += 1;
      return true;
    };
  }

  function resolveAll(item = {}) {
    const definition = elementRegistry?.resolveElement?.(item, { fallback: false });
    const type = normalizeType(definition?.type || item?.type || item?.kind);
    const typed = paintersByType.get(type) || [];
    return [...typed.slice().reverse(), ...fallbackPainters.slice().reverse()];
  }

  function render(context = {}) {
    for (const painter of resolveAll(context.item)) {
      const result = painter(context);
      if (result) {
        return {
          handled: true,
          painter,
          result,
        };
      }
    }
    return { handled: false, painter: null, result: false };
  }

  function getSnapshot() {
    return Object.freeze({
      revision,
      registeredTypes: Object.freeze(Array.from(paintersByType.keys()).sort()),
      fallbackCount: fallbackPainters.length,
    });
  }

  return Object.freeze({ register, resolveAll, render, getSnapshot });
}
