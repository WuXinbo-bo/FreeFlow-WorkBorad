import { createAgentClient } from "../../api/agentClient.js";
import { createAgentController } from "../conversationAssistant/agentController.js";

export { createAgentClient, createAgentController };

const SLOT_NAMES = ["header", "history", "composer", "thread-controls"];

export async function prepareAssistantUI({ document: doc = document, templateUrl = "/api/plugins/assistant/assets/assistant.html" } = {}) {
  const response = await fetch(templateUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("AI 助手界面读取失败，请重新安装插件");
  const fragment = doc.createElement("template");
  fragment.innerHTML = await response.text();
  const slots = SLOT_NAMES.map((name) => ({
    host: doc.getElementById(`assistant-plugin-${name}`),
    template: fragment.content.querySelector(`template[data-assistant-slot="${name}"]`),
  }));
  if (slots.some(({ host, template }) => !host || !template)) throw new Error("AI 助手界面与主程序不兼容");
  slots.forEach(({ host, template }) => host.replaceChildren(template.content.cloneNode(true)));
  return () => slots.forEach(({ host }) => host.replaceChildren());
}

export function mountAssistant(options = {}) {
  const client = options.client || createAgentClient();
  const controller = createAgentController({ ...options, client });
  return { client, controller };
}
