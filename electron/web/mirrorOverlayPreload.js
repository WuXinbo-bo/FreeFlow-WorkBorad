"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const listeners = new Set();
let lastPresentation;

ipcRenderer.on("mirror-overlay:present", (_event, payload) => {
  lastPresentation = payload;
  for (const listener of listeners) listener(payload);
});

contextBridge.exposeInMainWorld("mirrorOverlay", {
  onPresent(listener) {
    if (typeof listener !== "function") throw new TypeError("浮层监听器必须是函数");
    listeners.add(listener);
    if (lastPresentation !== undefined) listener(lastPresentation);
    return () => listeners.delete(listener);
  },
  request: (method, args = []) => ipcRenderer.invoke("mirror-overlay:request", method, args),
  emit: (eventName, payload) => ipcRenderer.send("mirror-overlay:event", eventName, payload),
  ready: () => ipcRenderer.send("mirror-overlay:ready"),
});
