const fs = require("node:fs");
const path = require("node:path");

function createBoardWorkspaceWatcher(notify) {
  let watcher = null;
  let timer = null;
  let generation = 0;
  function close() {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    watcher?.close();
    watcher = null;
  }
  function watch(folderPath) {
    close();
    if (!folderPath) return { ok: true };
    const root = path.resolve(folderPath);
    const token = generation;
    try {
      watcher = fs.watch(root, (_event, filename) => {
        if (token !== generation || (filename && !/\.(freeflow|json)$/i.test(String(filename)))) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (token === generation) notify({ folderPath: root });
        }, 120);
      });
      watcher.on("error", () => { if (token === generation) { close(); notify({ folderPath: root, error: "工作区监听已中断，请刷新列表" }); } });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
  return { watch, close };
}

module.exports = { createBoardWorkspaceWatcher };
