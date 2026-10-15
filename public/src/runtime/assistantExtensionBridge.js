// The base application knows the capability, not the assistant implementation.
export const assistantEnabled = document.body.dataset.assistantEnabled === "true";
let modulePromise;
let clientPromise;
export function loadAssistantModule() {
  if (!assistantEnabled) return Promise.reject(new Error("AI 助手扩展未启用"));
  if (!modulePromise) modulePromise = import("/extensions/ai-assistant/client.js").catch((error) => { modulePromise = null; throw error; });
  return modulePromise;
}
export const optionalAgentClient = assistantEnabled ? new Proxy({}, {
  get(_target, name) {
    return async (...args) => {
      if (!clientPromise) clientPromise = loadAssistantModule().then((module) => module.createAgentClient()).catch((error) => { clientPromise = null; throw error; });
      const client = await clientPromise;
      return client[name](...args);
    };
  },
}) : null;

export async function watchAssistantMigration(onReady) {
  try {
    const response = await fetch("/api/extensions", { cache: "no-store" });
    const result = await response.json();
    if (!result.ok) return;
    const item = result.assistant;
    if (item.enabled !== assistantEnabled) { await onReady(); return; }
    if (item.legacyAvailable && item.operation) window.setTimeout(() => { void watchAssistantMigration(onReady); }, 1000);
  } catch { /* Offline migration never blocks the workbench. */ }
}
