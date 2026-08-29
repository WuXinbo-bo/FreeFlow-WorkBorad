"use strict";

const { createIpcEventValidator, createSecuredIpcMain } = require("../electron/ipcSecurity");

function createWebContents(url) {
  const mainFrame = { url };
  return {
    mainFrame,
    isDestroyed: () => false,
  };
}

function assertThrows(action, message) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

const mainSender = createWebContents("http://127.0.0.1:3000/?desktop=1");
const backgroundSender = createWebContents(
  "http://127.0.0.1:3000/canvas-office.html?desktop=1&backgroundExport=1"
);
const backgroundChannels = new Set([
  "desktop-shell:background-export-ready",
  "desktop-shell:background-export-result",
  "desktop-shell:read-file-base64",
  "desktop-shell:save-tile-composite-image",
  "desktop-shell:save-tile-composite-pdf",
]);
const validate = createIpcEventValidator({
  expectedOrigin: "http://127.0.0.1:3000/",
  getAllowedWebContents(channel) {
    return backgroundChannels.has(channel) ? [backgroundSender] : [mainSender];
  },
});

validate({ sender: mainSender, senderFrame: mainSender.mainFrame }, "desktop-shell:get-state");
validate(
  { sender: backgroundSender, senderFrame: backgroundSender.mainFrame },
  "desktop-shell:background-export-result"
);
validate(
  { sender: backgroundSender, senderFrame: backgroundSender.mainFrame },
  "desktop-shell:read-file-base64"
);

assertThrows(
  () => validate({ sender: backgroundSender, senderFrame: backgroundSender.mainFrame }, "desktop-shell:read-file"),
  "background window could invoke a main-window channel"
);
const foreignSender = createWebContents("http://127.0.0.1:3000/");
assertThrows(
  () => validate({ sender: foreignSender, senderFrame: foreignSender.mainFrame }, "desktop-shell:get-state"),
  "foreign sender was accepted"
);
mainSender.mainFrame.url = "https://example.com/";
assertThrows(
  () => validate({ sender: mainSender, senderFrame: mainSender.mainFrame }, "desktop-shell:get-state"),
  "remote origin was accepted"
);
mainSender.mainFrame.url = "http://127.0.0.1:3000/?desktop=1";
assertThrows(
  () => validate({ sender: mainSender, senderFrame: { url: mainSender.mainFrame.url } }, "desktop-shell:get-state"),
  "subframe was accepted"
);
mainSender.isDestroyed = () => true;
assertThrows(
  () => validate({ sender: mainSender, senderFrame: mainSender.mainFrame }, "desktop-shell:get-state"),
  "destroyed sender was accepted"
);
mainSender.isDestroyed = () => false;
assertThrows(() => validate({}, "desktop-shell:get-state"), "missing sender was accepted");

const listeners = new Map();
const securedIpcMain = createSecuredIpcMain({
  ipcMain: {
    handle: (channel, listener) => listeners.set(`handle:${channel}`, listener),
    on: (channel, listener) => listeners.set(`on:${channel}`, listener),
  },
  validate,
});
let onCallCount = 0;
securedIpcMain.on("desktop-shell:renderer-ready", () => {
  onCallCount += 1;
});
listeners.get("on:desktop-shell:renderer-ready")({
  sender: foreignSender,
  senderFrame: foreignSender.mainFrame,
});
if (onCallCount !== 0) {
  throw new Error("rejected on-channel listener was executed");
}
listeners.get("on:desktop-shell:renderer-ready")({
  sender: mainSender,
  senderFrame: mainSender.mainFrame,
});
if (onCallCount !== 1) {
  throw new Error("trusted on-channel listener was not executed");
}

console.log("[check-electron-ipc-security] ok");
