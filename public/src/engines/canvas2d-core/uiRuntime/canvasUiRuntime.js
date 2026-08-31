import { createCanvasCommandRegistry } from "./commandRegistry.js";

const HOST_KINDS = Object.freeze(["toolbar", "context-menu", "inspector", "editor", "dialog", "shortcut"]);
const DESKTOP_INPUT_CAPABILITIES = Object.freeze({
  pointer: true,
  mouse: true,
  keyboard: true,
  wheel: true,
  touch: false,
  pinchZoom: false,
  pen: false,
  reserved: Object.freeze(["touch", "pinchZoom", "pen"]),
});

function freezeElementUxSnapshot(definition = {}) {
  const ux = definition.ux || {};
  return Object.freeze({
    type: definition.type,
    editor: String(ux.editor || definition.capabilities?.editor || "none"),
    inspector: String(ux.inspector || "common"),
    contextMenu: String(ux.contextMenu || "element"),
    preview: String(ux.preview || "none"),
    commands: Object.freeze([...(ux.commands || [])]),
    acceptance: Object.freeze([...(ux.acceptance || [])]),
  });
}

export function createCanvasUiRuntime({ elementRegistry, inputCapabilities = DESKTOP_INPUT_CAPABILITIES } = {}) {
  const commandRegistry = createCanvasCommandRegistry();
  const hosts = new Map();
  let hostRevision = 0;

  function registerHost(kind = "", host = null) {
    const normalizedKind = String(kind || "").trim().toLowerCase();
    if (!HOST_KINDS.includes(normalizedKind)) {
      throw new Error(`Unknown canvas UI host \"${normalizedKind}\"`);
    }
    const previous = hosts.get(normalizedKind);
    hosts.set(normalizedKind, host);
    hostRevision += 1;
    return () => {
      if (hosts.get(normalizedKind) !== host) {
        return false;
      }
      if (previous === undefined) {
        hosts.delete(normalizedKind);
      } else {
        hosts.set(normalizedKind, previous);
      }
      hostRevision += 1;
      return true;
    };
  }

  function getElementUx(elementOrType = "") {
    const definition = typeof elementOrType === "string"
      ? elementRegistry?.resolve?.(elementOrType, { fallback: false })
      : elementRegistry?.resolveElement?.(elementOrType, { fallback: false });
    return definition ? freezeElementUxSnapshot(definition) : null;
  }

  function getElementUxSnapshot() {
    return Object.freeze((elementRegistry?.list?.() || []).map(freezeElementUxSnapshot));
  }

  function getSnapshot(context = null) {
    return Object.freeze({
      revision: commandRegistry.getRevision() + hostRevision + Number(elementRegistry?.getRevision?.() || 0),
      commands: Object.freeze(commandRegistry.list(context).map(Object.freeze)),
      elements: getElementUxSnapshot(),
      hosts: Object.freeze(HOST_KINDS.map((kind) => Object.freeze({ kind, registered: hosts.has(kind) }))),
      input: Object.freeze({ ...inputCapabilities, reserved: Object.freeze([...(inputCapabilities.reserved || [])]) }),
    });
  }

  return {
    commands: commandRegistry,
    registerHost,
    getHost: (kind = "") => hosts.get(String(kind || "").trim().toLowerCase()) || null,
    getElementUx,
    getElementUxSnapshot,
    getInputCapabilities: () => ({ ...inputCapabilities, reserved: [...(inputCapabilities.reserved || [])] }),
    getSnapshot,
  };
}

export { DESKTOP_INPUT_CAPABILITIES, HOST_KINDS as CANVAS_UI_HOST_KINDS };
