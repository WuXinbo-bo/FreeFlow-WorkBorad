"use strict";

function createIpcEventValidator({ expectedOrigin, getAllowedWebContents }) {
  const getExpectedOrigin = typeof expectedOrigin === "function"
    ? expectedOrigin
    : () => expectedOrigin;
  if (typeof getAllowedWebContents !== "function") {
    throw new TypeError("getAllowedWebContents must be a function");
  }

  return function assertTrustedIpcEvent(event, channel = "") {
    const sender = event?.sender;
    if (!sender || sender.isDestroyed?.()) {
      throw new Error(`Rejected IPC ${channel}: sender is unavailable`);
    }

    const allowedSenders = getAllowedWebContents(channel) || [];
    if (!Array.from(allowedSenders).includes(sender)) {
      throw new Error(`Rejected IPC ${channel}: sender is not allowed`);
    }

    const senderFrame = event?.senderFrame;
    if (!senderFrame || senderFrame !== sender.mainFrame) {
      throw new Error(`Rejected IPC ${channel}: sender frame is not the main frame`);
    }

    let senderOrigin = "";
    try {
      senderOrigin = new URL(senderFrame.url).origin;
    } catch {
      throw new Error(`Rejected IPC ${channel}: sender URL is invalid`);
    }
    if (senderOrigin !== new URL(getExpectedOrigin()).origin) {
      throw new Error(`Rejected IPC ${channel}: sender origin is not allowed`);
    }
  };
}

function createSecuredIpcMain({ ipcMain, validate, onRejected = () => {} }) {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, (event, ...args) => {
        validate(event, channel);
        return listener(event, ...args);
      });
    },
    on(channel, listener) {
      ipcMain.on(channel, (event, ...args) => {
        try {
          validate(event, channel);
        } catch (error) {
          onRejected(error);
          return;
        }
        listener(event, ...args);
      });
    },
  };
}

module.exports = { createIpcEventValidator, createSecuredIpcMain };
