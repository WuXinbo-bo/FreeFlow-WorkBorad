import { createCanvas2DEngine } from "./engines/canvas2d-core/createCanvas2DEngine.js";

let engine = null;
const DESKTOP_SHELL = globalThis?.desktopShell || null;
let startupContextPromise = null;

async function loadStartupContext() {
  if (startupContextPromise) {
    return startupContextPromise;
  }
  startupContextPromise = (async () => {
    if (!DESKTOP_SHELL?.getStartupContext) {
      return null;
    }
    const context = await DESKTOP_SHELL.getStartupContext().catch(() => null);
    if (context?.ok) {
      globalThis.__FREEFLOW_STARTUP_CONTEXT = context;
      return context;
    }
    return null;
  })();
  return startupContextPromise;
}

function ensureCanvas2DEngine() {
  if (engine) {
    return engine;
  }

  engine = createCanvas2DEngine();
  globalThis.__canvas2dEngine = engine;
  return engine;
}

async function bootstrapCanvasOfficeApp() {
  const host = document.getElementById("canvas-canvas2d-host");
  if (!(host instanceof HTMLElement)) {
    requestAnimationFrame(bootstrapCanvasOfficeApp);
    return;
  }

  await loadStartupContext();
  ensureCanvas2DEngine().mount(host);
}

bootstrapCanvasOfficeApp();
