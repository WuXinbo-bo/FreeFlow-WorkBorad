// A single, cancelable timeline. Chapter changes wait for the old operation to
// settle before preparing the next board, so late imports cannot cross scenes.
export function createShowcasePlayer({ chapters, prepare, onChapterComplete, onChange, reducedMotion = false }) {
  let state = { chapter: 0, step: -1, status: "idle", caption: "", error: "", practicing: false };
  let controller = null;
  let task = Promise.resolve();
  let generation = 0;
  let disposed = false;
  const listeners = new Set();
  const emit = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    onChange?.({ ...state });
    listeners.forEach((listener) => listener({ ...state }));
  };
  const aborted = () => new DOMException("演示已取消", "AbortError");

  async function gate(signal) {
    if (signal.aborted || disposed) throw aborted();
    if (state.status !== "paused" && !state.practicing) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => { listeners.delete(wake); signal.removeEventListener("abort", cancel); };
      const cancel = () => { cleanup(); reject(aborted()); };
      const wake = () => {
        if (state.status === "paused" || state.practicing) return;
        cleanup(); resolve();
      };
      listeners.add(wake);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(aborted());
      const cancel = () => { clearTimeout(timer); reject(aborted()); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  async function hold(ms, signal) {
    let remaining = ms;
    while (remaining > 0) {
      await gate(signal);
      if (reducedMotion) return;
      const slice = Math.min(remaining, 60);
      await delay(slice, signal);
      if (state.status !== "paused" && !state.practicing) remaining -= slice;
    }
  }

  async function playChapter(index, signal) {
    emit({ chapter: index, step: -1, status: "loading", error: "", caption: "正在准备示例画布…" });
    await prepare(index, signal);
    if (signal.aborted) throw aborted();
    emit({ status: reducedMotion ? "paused" : "playing", caption: chapters[index].description });
    for (let step = 0; step < chapters[index].steps.length; step += 1) {
      await gate(signal);
      const entry = chapters[index].steps[step];
      emit({ step, caption: entry.caption });
      await entry.run?.(signal);
      if (signal.aborted) throw aborted();
      if (reducedMotion) emit({ status: "paused" });
      else await hold(entry.duration || 2600, signal);
    }
    if (reducedMotion) await gate(signal);
  }

  function goTo(index = 0) {
    if (disposed) return Promise.resolve();
    const next = Math.max(0, Math.min(chapters.length - 1, index));
    const ticket = ++generation;
    controller?.abort();
    emit({ status: "loading", practicing: false, error: "" });
    task = task.catch(() => {}).then(async () => {
      if (disposed || ticket !== generation) return;
      controller = new AbortController();
      const signal = controller.signal;
      try {
        for (let chapter = next; chapter < chapters.length; chapter += 1) {
          await playChapter(chapter, signal);
          if (signal.aborted) throw aborted();
          onChapterComplete?.(chapter);
        }
        emit({ status: "complete", caption: "从资料到成果，现在亲自试试。" });
      } catch (error) {
        if (!signal.aborted && !disposed) emit({ status: "error", error: error.message || "本章暂时无法播放" });
      }
    });
    return task;
  }

  return {
    getSnapshot: () => ({ ...state }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    goTo,
    pause() { if (state.status === "playing") emit({ status: "paused" }); },
    resume() { if (state.status === "paused" && !state.practicing) emit({ status: "playing" }); },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
      emit(reducedMotion && state.status === "playing" ? { status: "paused" } : {});
    },
    async practice() {
      if (!["playing", "paused", "complete"].includes(state.status)) return;
      const ticket = ++generation;
      controller?.abort();
      emit({ status: "loading", caption: "正在准备练习…" });
      await task;
      if (!disposed && ticket === generation) emit({ status: "paused", practicing: true });
    },
    async dispose() {
      disposed = true;
      ++generation;
      controller?.abort();
      listeners.clear();
      await task;
    },
  };
}
