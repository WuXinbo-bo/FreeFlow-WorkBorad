export function createStep(id, title, description, options = {}) {
  return {
    id,
    title,
    description,
    type: options.type || "info",
    targetId: options.targetId || "",
    placement: options.placement || "bottom",
    skippable: options.skippable !== false,
    completionRule: options.completionRule || null,
  };
}
