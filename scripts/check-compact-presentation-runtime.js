const assert = require("assert");

async function main() {
  const { createElementTypeRegistry } = await import(
    "../public/src/engines/canvas2d-core/runtime/elementTypeRegistry.js"
  );
  const { createCompactPresentationRegistry } = await import(
    "../public/src/engines/canvas2d-core/runtime/compactPresentationRegistry.js"
  );

  const elementRegistry = createElementTypeRegistry({ fallbackType: "text" });
  const definition = (type) => ({
    type,
    normalize: (item) => item,
    getBounds: (item) => item,
    translate: (item) => item,
  });
  elementRegistry.register(definition("text"));
  elementRegistry.register(definition("image"));

  const compact = createCompactPresentationRegistry({ elementRegistry });
  const calls = [];
  const textBase = ({ item }) => {
    calls.push(`text-base:${item.id}`);
    return true;
  };
  const textOverride = ({ item }) => {
    calls.push(`text-override:${item.id}`);
    return true;
  };
  const fallback = ({ item }) => {
    calls.push(`fallback:${item.id}`);
    return true;
  };

  const removeTextBase = compact.register(textBase, { supportedTypes: ["text"] });
  const removeFallback = compact.register(fallback);
  const removeTextOverride = compact.register(textOverride, { supportedTypes: ["text"] });

  assert.strictEqual(compact.render({ item: { id: "a", type: "text" } }).handled, true);
  assert.deepStrictEqual(calls, ["text-override:a"]);
  assert.strictEqual(removeTextOverride(), true);
  assert.strictEqual(removeTextOverride(), false);
  compact.render({ item: { id: "b", type: "text" } });
  compact.render({ item: { id: "c", type: "image" } });
  assert.deepStrictEqual(calls, ["text-override:a", "text-base:b", "fallback:c"]);

  const snapshot = compact.getSnapshot();
  assert.strictEqual(Object.isFrozen(snapshot), true);
  assert.strictEqual(Object.isFrozen(snapshot.registeredTypes), true);
  assert.deepStrictEqual(snapshot.registeredTypes, ["text"]);
  assert.strictEqual(snapshot.fallbackCount, 1);
  assert.strictEqual(removeTextBase(), true);
  assert.strictEqual(removeFallback(), true);
  assert.strictEqual(compact.render({ item: { id: "d", type: "text" } }).handled, false);

  console.log("[check-compact-presentation-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-compact-presentation-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
