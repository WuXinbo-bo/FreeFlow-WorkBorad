import { DEMO_DOCX_PATH, buildDemoBoard } from "./demoBoard.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PRISM_BOOT_FILES = [
  "vendor/prismjs/components/prism-core.min.js",
  "vendor/prismjs/components/prism-clike.min.js",
  "vendor/prismjs/components/prism-javascript.min.js",
  "vendor/prismjs/components/prism-typescript.min.js",
  "vendor/prismjs/components/prism-python.min.js",
  "vendor/prismjs/components/prism-json.min.js",
  "vendor/prismjs/components/prism-markup.min.js",
  "vendor/prismjs/components/prism-css.min.js",
  "vendor/prismjs/components/prism-markdown.min.js",
  "vendor/prismjs/components/prism-sql.min.js",
  "vendor/prismjs/components/prism-c.min.js",
  "vendor/prismjs/components/prism-cpp.min.js",
  "vendor/prismjs/components/prism-java.min.js",
  "vendor/prismjs/components/prism-bash.min.js",
];

function resolvePublicAssetUrl(pathname = "") {
  const cleanPath = String(pathname || "").trim().replace(/^\/+/, "");
  const baseUrl = String(import.meta.env?.BASE_URL || "/").trim() || "/";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${cleanPath}`;
}

function createJsonResponse(data, { status = 200 } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
}

async function loadDemoDocxBase64() {
  const response = await fetch(resolvePublicAssetUrl("demo-assets/freeflow-selection-word.docx"));
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function ensureStylesheet(pathname = "") {
  const href = resolvePublicAssetUrl(pathname);
  const existing = document.querySelector(`link[data-standalone-style="${href}"]`);
  if (existing) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.standaloneStyle = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`样式加载失败: ${href}`));
    document.head.appendChild(link);
  });
}

function ensureScript(pathname = "") {
  const src = resolvePublicAssetUrl(pathname);
  const existing = document.querySelector(`script[data-standalone-script="${src}"]`);
  if (existing) {
    if (existing.dataset.loaded === "1") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`脚本加载失败: ${src}`)), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.standaloneScript = src;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureVendorBootAssets() {
  await ensureStylesheet("vendor/katex/katex.min.css");
  for (const file of PRISM_BOOT_FILES) {
    await ensureScript(file);
  }
}

export async function installStandaloneRuntime() {
  await ensureVendorBootAssets();
  const previewDocxBase64 = await loadDemoDocxBase64();
  const demoBoard = buildDemoBoard();

  globalThis.__FREEFLOW_STARTUP_CONTEXT = {
    ok: true,
    uiSettings: {
      canvasBoardSavePath: "",
      canvasLastOpenedBoardPath: "",
      canvasImageSavePath: "",
    },
    startup: {
      initialBoardPath: "",
      boardSavePath: "",
      canvasImageSavePath: "",
    },
  };

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (typeof originalFetch === "function") {
    globalThis.fetch = async (input, init) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input || "");
      const resolvedUrl = new URL(requestUrl, globalThis.location?.href || "http://localhost/");
      const pathname = resolvedUrl.pathname;

      if (pathname === "/api/ui-settings") {
        const body = {
          ok: true,
          canvasBoardSavePath: "",
          canvasLastOpenedBoardPath: "",
          canvasImageSavePath: "",
          updatedAt: Date.now(),
        };
        return createJsonResponse(body);
      }

      if (pathname === "/api/url-meta") {
        return createJsonResponse({
          ok: true,
          meta: null,
        });
      }

      if (pathname === "/api/file-preview/docx-base64") {
        return createJsonResponse({
          ok: true,
          data: previewDocxBase64,
          mime: DOCX_MIME,
        });
      }

      if (pathname === "/api/file-preview/pdf-base64") {
        return createJsonResponse({
          ok: false,
          error: "Standalone demo 未内置 PDF 示例文件",
        }, { status: 404 });
      }

      if (pathname === "/api/canvas-board") {
        return createJsonResponse({
          ok: true,
          file: "freeflow-demo.freeflow",
          canonicalFile: "freeflow-demo.freeflow",
          format: "standalone-demo",
          legacy: false,
          board: demoBoard,
        });
      }

      if (pathname === "/api/canvas-board/repair") {
        return createJsonResponse({
          ok: false,
          error: "Standalone demo 不提供修复接口",
          repairedFile: "",
          recoveredItemCount: 0,
        }, { status: 400 });
      }

      return originalFetch(input, init);
    };
  }

  globalThis.__FREEFLOW_STANDALONE_DEMO__ = {
    previewDocxBase64,
    demoDocxPath: DEMO_DOCX_PATH,
  };
}
