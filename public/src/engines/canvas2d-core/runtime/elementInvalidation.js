const INVALIDATION_DOMAINS = Object.freeze([
  "background",
  "geometry",
  "content",
  "resource",
  "interaction",
  "overlay",
  "hitTest",
]);

function normalizeIds(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))
  );
}

export function createElementInvalidation(domains = [], itemIds = []) {
  const requested = new Set(Array.isArray(domains) ? domains : [domains]);
  const normalizedDomains = INVALIDATION_DOMAINS.filter((domain) => requested.has(domain));
  return Object.freeze({
    domains: Object.freeze(normalizedDomains),
    itemIds: Object.freeze(normalizeIds(itemIds)),
  });
}

export function mergeElementInvalidations(...values) {
  const domains = new Set();
  const itemIds = [];
  values.flat().filter(Boolean).forEach((value) => {
    (value.domains || []).forEach((domain) => domains.add(domain));
    itemIds.push(...(value.itemIds || []));
  });
  return createElementInvalidation(Array.from(domains), itemIds);
}

export function invalidationToRenderPatch(value = null) {
  const domains = new Set(value?.domains || []);
  const geometryDirty = domains.has("geometry");
  return {
    backgroundDirty: domains.has("background"),
    sceneDirty: geometryDirty || domains.has("content") || domains.has("resource"),
    interactionDirty: geometryDirty || domains.has("interaction"),
    overlayDirty: geometryDirty || domains.has("content") || domains.has("resource") || domains.has("overlay"),
    hitTestDirty: geometryDirty || domains.has("hitTest"),
    itemIds: normalizeIds(value?.itemIds || []),
  };
}

export const ELEMENT_INVALIDATION_DOMAINS = INVALIDATION_DOMAINS;
